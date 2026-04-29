"""
zigbee_receiver.py  —  Dual-source telemetry ingestion
Primary  : Zigbee radio module  →  serial COM port  (ZIGBEE_COM_PORT)
Fallback : Direct UDP sender    →  UDP socket       (UDP_PORT 8765)

Architecture
────────────
  read_from_zigbee  ──→  _zigbee_q ─┐
  (serial COM port)                   ├─→ source_mux ──→ _out_q ──→ packet_consumer
  read_from_udp     ──→  _udp_q    ─┘
  (UDP socket)

Both readers run continuously.  source_mux decides which queue to forward
to _out_q based on Zigbee health.  If Zigbee is silent for ZIGBEE_TIMEOUT
seconds the mux switches to UDP and logs the transition.  Every
RETRY_INTERVAL seconds on UDP the mux re-probes Zigbee.

Public API
──────────
  get_data()          → dict    thread-safe snapshot of latest telemetry
  get_active_source() → Source  enum (ZIGBEE | UDP)
  main()                        run from command line

Protocol (unchanged)
────────────────────
  [CODE$$v1,v2,...##]
  A = roll, pitch, yaw, pos_x, pos_y, pos_z, vel_x, vel_y, vel_z
  B = voltage, remaining_pct, current_a
  D = distance_m
"""

import asyncio
import logging
import socket
import sys
import time
import shutil
from datetime import datetime
from enum import Enum
from threading import Lock
from typing import Dict, List
import serial

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
# Primary: Zigbee radio module connected via serial COM port
ZIGBEE_COM_PORT  = "/dev/ttyUSB0"     # serial port the Zigbee module is on
ZIGBEE_BAUD_RATE = 115200     # must match the Zigbee module firmware

# Fallback: direct UDP sender (e.g. WiFi direct from drone)
UDP_IP           = "0.0.0.0"
UDP_PORT         = 8765        # matches the original listen port
BUFFER           = 65535

ZIGBEE_TIMEOUT   = 2.0        # seconds of serial silence before failover
RETRY_INTERVAL   = 10.0       # seconds on UDP before re-probing Zigbee

EMA_ALPHA        = 0.2        # smoothing factor for inter-packet Hz estimate
STALE_MULTIPLIER = 1.5        # display warns if age > interval × this

# ─────────────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("zigbee_rx")

# ─────────────────────────────────────────────────────────────────────────────
# PROTOCOL DEFINITIONS
# ─────────────────────────────────────────────────────────────────────────────
CODES = ["A", "B", "D"]

PARAM_ORDER: Dict[str, List[str]] = {
    "A": ["roll", "pitch", "yaw", "pos_x", "pos_y", "pos_z", "vel_x", "vel_y", "vel_z"],
    "B": ["voltage", "battery", "current"],
    "D": ["distance", "rpi_temp", "imu_temp"],
}

PARAM_UNITS: Dict[str, List[str]] = {
    "roll": "°",   "pitch": "°",   "yaw": "°",
    "pos_x": "m",  "pos_y": "m",   "pos_z": "m",
    "vel_x": "m/s","vel_y": "m/s", "vel_z": "m/s",
    "voltage": "V", "battery": "%",  "current": "A",
    "distance": "m", "rpi_temp": "°C", "imu_temp": "°C",
}

# ─────────────────────────────────────────────────────────────────────────────
# SOURCE STATE
# ─────────────────────────────────────────────────────────────────────────────
class Source(Enum):
    ZIGBEE = "ZIGBEE"
    UDP    = "UDP"

_source_lock: Lock   = Lock()
_active_source: Source = Source.ZIGBEE


def get_active_source() -> Source:
    with _source_lock:
        return _active_source


def _set_active_source(src: Source) -> None:
    global _active_source
    with _source_lock:
        prev = _active_source
    if prev == src:
        return
    log.info(f"[SOURCE] {prev.value} → {src.value}")
    with _source_lock:
        _active_source = src
    with _state_lock:
        _state["source"] = src.value

# ─────────────────────────────────────────────────────────────────────────────
# SHARED TELEMETRY STATE
# ─────────────────────────────────────────────────────────────────────────────
_state_lock: Lock = Lock()
_state: dict = {
    "timestamp":     None,
    "roll_deg":      None, "pitch_deg":     None, "yaw_deg":      None,
    "pos_x_m":       None, "pos_y_m":       None, "pos_z_m":      None,
    "vel_x_m_s":     None, "vel_y_m_s":     None, "vel_z_m_s":    None,
    "voltage_v":     None, "remaining_pct": None, "current_a":    None,
    "current_m":     None,
    "rpi_temp_c":    None, "imu_temp_c":    None,
    "source":        Source.ZIGBEE.value,
}


def get_data() -> dict:
    """Thread-safe snapshot of the latest telemetry values."""
    with _state_lock:
        return dict(_state)

# ─────────────────────────────────────────────────────────────────────────────
# EMA FREQUENCY TRACKING  (per-code packet rate)
# ─────────────────────────────────────────────────────────────────────────────
# For each code letter (A/B/D), we measure the gap between consecutive packets
# and maintain an EMA-smoothed frequency estimate.  Every parameter inside one
# packet group inherits that group's Hz value.
#
#   gap       = t_now − t_prev
#   inst_freq = 1 / gap
#   ema_freq  = (1 − α) × prev_ema  +  α × inst_freq
#
_code_last_time: dict  = {}
_code_freq_ema: dict   = {}
_param_frequency: dict = {}
_param_values: dict    = {}


def _update_code_freq(code: str, t: float) -> float:
    if code in _code_last_time:
        gap = t - _code_last_time[code]
        if gap > 0:
            inst = 1.0 / gap
            prev = _code_freq_ema.get(code, inst)
            _code_freq_ema[code] = (1.0 - EMA_ALPHA) * prev + EMA_ALPHA * inst
    else:
        _code_freq_ema[code] = 0.0   # first packet — no gap yet
    _code_last_time[code] = t
    return _code_freq_ema.get(code, 0.0)

# ─────────────────────────────────────────────────────────────────────────────
# PACKET PARSING
# ─────────────────────────────────────────────────────────────────────────────
def parse_packet(raw: str) -> tuple:
    """
    Parse [CODE$$v1,v2,...##] → (code: str, values: list[float]).
    Returns (None, None) for malformed input.
    """
    if not (raw.startswith("[") and raw.endswith("##]")):
        return None, None
    inner = raw[1:-3]
    if "$$" not in inner:
        return None, None
    code, data_str = inner.split("$$", 1)
    try:
        values = [float(v) for v in data_str.split(",")]
    except ValueError:
        return None, None
    return code, values


def _normalise_udp(raw: str) -> str:
    """
    Map UDP fallback packets to the standard [CODE$$...##] schema before
    they enter the processing pipeline.

    If the UDP source already sends data in the standard format this
    function is a pass-through.  Add custom field-mapping logic here if
    your UDP fallback uses a different wire format.
    """
    if raw.startswith("[") and raw.endswith("##]"):
        return raw   # already standard
    # ── Example: JSON → standard schema ────────────────────────────────────
    # import json
    # try:
    #     d = json.loads(raw)
    #     fields = [d["roll"], d["pitch"], d["yaw"],
    #               d["pos_x"], d["pos_y"], d["pos_z"],
    #               d["vel_x"], d["vel_y"], d["vel_z"]]
    #     return "[A$$" + ",".join(str(f) for f in fields) + "##]"
    # except Exception:
    #     pass
    return raw   # return unchanged; will be dropped as malformed by parse_packet

# ─────────────────────────────────────────────────────────────────────────────
# STATE UPDATE  (called by consumer after parsing)
# ─────────────────────────────────────────────────────────────────────────────
def _process_packet(code: str, values: list, t: float) -> None:
    hz = _update_code_freq(code, t)
    with _state_lock:
        _state["timestamp"] = datetime.now().isoformat()

        if code == "A" and len(values) == 9:
            _state.update({
                "roll_deg":  values[0], "pitch_deg": values[1], "yaw_deg":   values[2],
                "pos_x_m":   values[3], "pos_y_m":   values[4], "pos_z_m":   values[5],
                "vel_x_m_s": values[6], "vel_y_m_s": values[7], "vel_z_m_s": values[8],
            })
            for i, name in enumerate(PARAM_ORDER["A"]):
                _param_values[name]    = values[i]
                _param_frequency[name] = hz

        elif code == "B" and len(values) == 3:
            _state.update({
                "voltage_v":     values[0],
                "remaining_pct": values[1],
                "current_a":     values[2],
            })
            for i, name in enumerate(PARAM_ORDER["B"]):
                _param_values[name]    = values[i]
                _param_frequency[name] = hz

        elif code == "D" and len(values) == 3:
            _state["current_m"]  = values[0]
            _state["rpi_temp_c"] = values[1]
            _state["imu_temp_c"] = values[2]
            for i, name in enumerate(PARAM_ORDER["D"]):
                _param_values[name]    = values[i]
                _param_frequency[name] = hz

# ─────────────────────────────────────────────────────────────────────────────
# ASYNC READER: ZIGBEE  (primary source)
# ─────────────────────────────────────────────────────────────────────────────
async def read_from_zigbee(queue: asyncio.Queue) -> None:
    """
    Reads lines from the Zigbee radio module via serial COM port and puts
    (raw_str, monotonic_timestamp) tuples into *queue*.

    Uses run_in_executor so the blocking serial.readline() never stalls the
    event loop.  The serial port's own read timeout (1 s) ensures readline
    returns promptly even when the drone is silent, so the mux can detect
    the silence and trigger failover.

    Runs forever with auto-reconnect on serial errors (e.g. USB unplug).
    """
    loop = asyncio.get_running_loop()
    while True:
        ser = None
        try:
            ser = serial.Serial(ZIGBEE_COM_PORT, ZIGBEE_BAUD_RATE, timeout=1.0)
            log.info(f"[ZIGBEE] Opened {ZIGBEE_COM_PORT} @ {ZIGBEE_BAUD_RATE} baud")
            while True:
                # readline blocks for at most 1 s (serial timeout), then returns b""
                line = await loop.run_in_executor(None, ser.readline)
                if not line:
                    continue   # serial timeout — no data this second, loop again
                ts   = time.monotonic()
                text = line.decode("utf-8", errors="replace").strip()
                if text:
                    await queue.put((text, ts))
        except serial.SerialException as exc:
            log.error(f"[ZIGBEE] Serial error: {exc}  — retrying in 3 s")
            await asyncio.sleep(3.0)
        except asyncio.CancelledError:
            raise
        finally:
            if ser and ser.is_open:
                ser.close()

# ─────────────────────────────────────────────────────────────────────────────
# ASYNC READER: UDP  (fallback source)
# ─────────────────────────────────────────────────────────────────────────────
async def read_from_udp(queue: asyncio.Queue) -> None:
    """
    Non-blocking coroutine that receives raw packets from the direct UDP
    fallback source and puts normalised (raw_str, timestamp) tuples into
    *queue*.

    Packets are passed through _normalise_udp() before queuing so they
    always arrive at the consumer in the standard [CODE$$...##] schema.

    Runs forever with auto-reconnect on socket errors.
    """
    loop = asyncio.get_running_loop()
    while True:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.bind((UDP_IP, UDP_PORT))
            sock.setblocking(False)
            log.info(f"[UDP] Listening on {UDP_IP}:{UDP_PORT}")
            while True:
                raw  = await loop.sock_recv(sock, BUFFER)
                ts   = time.monotonic()
                text = _normalise_udp(raw.decode("utf-8", errors="replace").strip())
                if text:
                    await queue.put((text, ts))
        except (OSError, ConnectionResetError) as exc:
            log.error(f"[UDP] Socket error: {exc}  — retrying in 3 s")
            await asyncio.sleep(3.0)
        except asyncio.CancelledError:
            raise
        finally:
            sock.close()

# ─────────────────────────────────────────────────────────────────────────────
# SOURCE MUX  (failover logic)
# ─────────────────────────────────────────────────────────────────────────────
async def source_mux(
    zigbee_q: asyncio.Queue,
    udp_q: asyncio.Queue,
    out_q: asyncio.Queue,
) -> None:
    """
    Selects the active source and forwards its packets to *out_q*.

    ZIGBEE mode
    ───────────
    Waits up to ZIGBEE_TIMEOUT seconds for the next Zigbee packet.
    If none arrives, logs the failover and switches to UDP.

    UDP mode
    ────────
    Continuously forwards UDP packets.  The wait timeout is set to
    expire at the next Zigbee retry deadline so the retry check never
    waits longer than RETRY_INTERVAL even when UDP is silent.

    Every RETRY_INTERVAL seconds the mux checks whether Zigbee has
    sent a packet recently (fresher than ZIGBEE_TIMEOUT ago).  If yes,
    it switches back to Zigbee.
    """
    last_zigbee_ts = time.monotonic()           # monotonic time of last Zigbee packet
    retry_at       = time.monotonic() + RETRY_INTERVAL   # when to next probe Zigbee

    while True:
        src = get_active_source()
        now = time.monotonic()

        # ── ZIGBEE active ─────────────────────────────────────────────────────
        if src == Source.ZIGBEE:
            try:
                raw, ts = await asyncio.wait_for(
                    zigbee_q.get(), timeout=ZIGBEE_TIMEOUT
                )
                last_zigbee_ts = ts
                await out_q.put(raw)

            except asyncio.TimeoutError:
                silent_s = time.monotonic() - last_zigbee_ts
                log.warning(
                    f"[FAILOVER] Zigbee silent {silent_s:.1f}s "
                    f"(threshold {ZIGBEE_TIMEOUT}s)  →  switching to UDP"
                )
                _set_active_source(Source.UDP)
                retry_at = time.monotonic() + RETRY_INTERVAL

        # ── UDP active ────────────────────────────────────────────────────────
        else:
            # Drain any Zigbee packets that accumulated while on UDP and track
            # the timestamp of the most recent one (used for re-entry check).
            while not zigbee_q.empty():
                try:
                    _, ts = zigbee_q.get_nowait()
                    last_zigbee_ts = ts
                except asyncio.QueueEmpty:
                    break

            # Wait for a UDP packet; wake up early if the retry deadline arrives.
            wait_s = max(0.05, retry_at - time.monotonic())
            try:
                raw, _ = await asyncio.wait_for(udp_q.get(), timeout=wait_s)
                await out_q.put(raw)
            except asyncio.TimeoutError:
                pass   # expected wake-up for retry check

            # ── Zigbee retry probe ────────────────────────────────────────────
            if time.monotonic() >= retry_at:
                freshness = time.monotonic() - last_zigbee_ts
                if freshness <= ZIGBEE_TIMEOUT:
                    log.info(
                        f"[FAILOVER] Zigbee back online "
                        f"(last packet {freshness:.2f}s ago)  →  switching back"
                    )
                    _set_active_source(Source.ZIGBEE)
                else:
                    log.info(
                        f"[FAILOVER] Zigbee still silent "
                        f"(last seen {freshness:.1f}s ago)  —  staying on UDP"
                    )
                    retry_at = time.monotonic() + RETRY_INTERVAL

# ─────────────────────────────────────────────────────────────────────────────
# PACKET CONSUMER  (parses and writes to telemetry state)
# ─────────────────────────────────────────────────────────────────────────────
async def packet_consumer(out_q: asyncio.Queue) -> None:
    """
    Reads from *out_q* (populated by source_mux), parses each packet, and
    calls _process_packet() to update the shared telemetry state.
    """
    while True:
        raw = await out_q.get()
        code, values = parse_packet(raw)
        if code in CODES:
            _process_packet(code, values, time.monotonic())
        else:
            log.debug(f"[CONSUMER] Malformed packet dropped: {raw!r}")

# ─────────────────────────────────────────────────────────────────────────────
# TERMINAL DISPLAY  (optional, 20 Hz)
# ─────────────────────────────────────────────────────────────────────────────
def _fmt_param(name: str) -> str:
    if name not in _param_values:
        return f"{name}->no data"
    hz = _param_frequency.get(name, 0.0)
    if hz < 0.5:
        return f"{name}->stale"
    unit = PARAM_UNITS.get(name, "")
    return f"{name}={_param_values[name]:>8.3f}{unit}(@{hz:.1f}Hz)"


async def display_loop() -> None:
    LINES = len(CODES) + 1
    sys.stdout.write("\033[?7l")    # disable line-wrap so long lines don't shift block
    sys.stdout.write("\n" * LINES)
    sys.stdout.flush()
    w = shutil.get_terminal_size((220, 24)).columns - 3
    try:
        while True:
            src = get_active_source()
            label = f"[{src.value}]"
            rows = [
                f"{label} Hi-Pri   " + "  ".join(_fmt_param(n) for n in PARAM_ORDER["A"]),
                f"{label} Battery  " + "  ".join(_fmt_param(n) for n in PARAM_ORDER["B"]),
                f"{label} Distance " + _fmt_param("distance"),
                "Packet Hz  │  " + "   ".join(
                    f"{c}: {_code_freq_ema.get(c, 0.0):>5.1f}Hz" for c in CODES
                ),
            ]
            out = f"\033[{LINES}A" + "".join(f"\033[2K\r  {r[:w]}\n" for r in rows)
            sys.stdout.write(out)
            sys.stdout.flush()
            await asyncio.sleep(0.05)
    finally:
        sys.stdout.write("\033[?7h\n")   # re-enable wrap on exit
        sys.stdout.flush()

# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
async def run() -> None:
    """
    Creates the inter-task queues and launches all coroutines.

         read_from_zigbee  ──→ zigbee_q ─┐
                                          ├─→ source_mux ──→ out_q ──→ packet_consumer
         read_from_udp     ──→ udp_q    ─┘

    All tasks share a single event loop.  If any task raises an unhandled
    exception the remaining tasks are cancelled and the program exits cleanly.
    """
    zigbee_q: asyncio.Queue = asyncio.Queue(maxsize=64)
    udp_q:    asyncio.Queue = asyncio.Queue(maxsize=64)
    out_q:    asyncio.Queue = asyncio.Queue(maxsize=128)

    tasks = [
        asyncio.create_task(read_from_zigbee(zigbee_q),              name="zigbee-reader"),
        asyncio.create_task(read_from_udp(udp_q),                    name="udp-reader"),
        asyncio.create_task(source_mux(zigbee_q, udp_q, out_q),      name="source-mux"),
        asyncio.create_task(packet_consumer(out_q),                   name="consumer"),
        asyncio.create_task(display_loop(),                           name="display"),
    ]
    try:
        await asyncio.gather(*tasks)
    except Exception as exc:
        log.error(f"Fatal error in ingestion pipeline: {exc}")
    finally:
        for t in tasks:
            t.cancel()


def main() -> None:
    print("  Dual-source telemetry receiver")
    print(f"  Primary  : Zigbee serial       {ZIGBEE_COM_PORT} @ {ZIGBEE_BAUD_RATE} baud")
    print(f"  Fallback : UDP socket          port {UDP_PORT}")
    print(f"  Failover threshold : {ZIGBEE_TIMEOUT}s   Retry interval : {RETRY_INTERVAL}s")
    print("  " + "─" * 60)
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\n\n  Shutting down.")


if __name__ == "__main__":
    main()
