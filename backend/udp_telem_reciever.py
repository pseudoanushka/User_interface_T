"""
udp_telem_reciever.py  —  UDP telemetry fallback receiver

Activated by listen.py when the primary Zigbee serial link fails.
Receives [CODE$$v1,v2,...##] packets on UDP and forwards them to
listen.process_telem_packet() which gates JSON writes based on the
active source (_telem_source in listen.py).

Architecture (listen.py is master):
  listen.zigbee_telem_thread  — Zigbee active → listen writes JSON
        ↓ on failure
  listen._ensure_udp_fallback_running()
        ↓ starts once
  udp_telem_reciever.run_udp_only()  — UDP active → listen writes JSON via process_telem_packet

Public entry point (called by listen.py):
  run_udp_only()   — blocking; run in a daemon thread
"""

import socket
import sys
import time
import shutil
import logging
from threading import Lock

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
UDP_IP   = "0.0.0.0"
UDP_PORT = 8765
BUFFER   = 65535
EMA_ALPHA = 0.2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("udp_telem")

# ─────────────────────────────────────────────────────────────────────────────
# PROTOCOL
# ─────────────────────────────────────────────────────────────────────────────
CODES = ["A", "B", "D"]

PARAM_ORDER = {
    "A": ["roll", "pitch", "yaw", "pos_x", "pos_y", "pos_z", "vel_x", "vel_y", "vel_z"],
    "B": ["voltage", "battery", "current"],
    "D": ["distance", "rpi_temp", "imu_temp"],
}

PARAM_UNITS = {
    "roll": "°",    "pitch": "°",    "yaw": "°",
    "pos_x": "m",   "pos_y": "m",    "pos_z": "m",
    "vel_x": "m/s", "vel_y": "m/s",  "vel_z": "m/s",
    "voltage": "V", "battery": "%",  "current": "A",
    "distance": "m","rpi_temp": "°C","imu_temp": "°C",
}

# ─────────────────────────────────────────────────────────────────────────────
# EMA FREQUENCY TRACKING  (terminal display only — JSON gating is in listen.py)
# ─────────────────────────────────────────────────────────────────────────────
_code_last_time:  dict = {}
_code_freq_ema:   dict = {}
_param_frequency: dict = {}
_param_values:    dict = {}
_display_lock = Lock()


def _update_code_freq(code: str, t: float) -> float:
    if code in _code_last_time:
        gap = t - _code_last_time[code]
        if gap > 0:
            inst = 1.0 / gap
            prev = _code_freq_ema.get(code, inst)
            _code_freq_ema[code] = (1.0 - EMA_ALPHA) * prev + EMA_ALPHA * inst
    else:
        _code_freq_ema[code] = 0.0
    _code_last_time[code] = t
    return _code_freq_ema.get(code, 0.0)


def parse_packet(raw: str):
    """Parse [CODE$$v1,...##] → (code, [floats]) or (None, None)."""
    if not (raw.startswith("[") and raw.endswith("##]")):
        return None, None
    inner = raw[1:-3]
    if "$$" not in inner:
        return None, None
    code, data_str = inner.split("$$", 1)
    try:
        return code, [float(v) for v in data_str.split(",")]
    except ValueError:
        return None, None


def _update_display_state(code: str, values: list, hz: float) -> None:
    with _display_lock:
        for i, name in enumerate(PARAM_ORDER.get(code, [])):
            if i < len(values):
                _param_values[name]    = values[i]
                _param_frequency[name] = hz


# ─────────────────────────────────────────────────────────────────────────────
# TERMINAL DISPLAY
# ─────────────────────────────────────────────────────────────────────────────
def _fmt_param(name: str) -> str:
    if name not in _param_values:
        return f"{name}->no data"
    hz = _param_frequency.get(name, 0.0)
    if hz < 0.5:
        return f"{name}->stale"
    unit = PARAM_UNITS.get(name, "")
    return f"{name}={_param_values[name]:>8.3f}{unit}(@{hz:.1f}Hz)"


def _display_loop() -> None:
    LINES = len(CODES) + 1
    sys.stdout.write("\033[?7l")
    sys.stdout.write("\n" * LINES)
    sys.stdout.flush()
    while True:
        w = shutil.get_terminal_size((220, 24)).columns - 3
        rows = [
            "[UDP] Hi-Pri   " + "  ".join(_fmt_param(n) for n in PARAM_ORDER["A"]),
            "[UDP] Battery  " + "  ".join(_fmt_param(n) for n in PARAM_ORDER["B"]),
            "[UDP] Distance " + _fmt_param("distance"),
            "Packet Hz  │  " + "   ".join(
                f"{c}: {_code_freq_ema.get(c, 0.0):>5.1f}Hz" for c in CODES
            ),
        ]
        out = f"\033[{LINES}A" + "".join(f"\033[2K\r  {r[:w]}\n" for r in rows)
        sys.stdout.write(out)
        sys.stdout.flush()
        time.sleep(0.05)


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT  (called by listen._ensure_udp_fallback_running)
# ─────────────────────────────────────────────────────────────────────────────
def run_udp_only() -> None:
    """
    Blocking UDP receiver. Called from listen.py in a daemon thread when
    Zigbee fails. Parses packets and forwards to listen.process_telem_packet()
    with source="udp" so the gate in listen.py controls JSON writes.
    """
    import listen   # late import — listen is already loaded when this runs

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(1.0)
    try:
        sock.bind((UDP_IP, UDP_PORT))
        log.info(f"[UDP] Listening on {UDP_IP}:{UDP_PORT}")
    except OSError as e:
        log.error(f"[UDP] Bind failed on port {UDP_PORT}: {e}")
        return

    while True:
        try:
            raw, _ = sock.recvfrom(BUFFER)
            t      = time.monotonic()
            text   = raw.decode("utf-8", errors="replace").strip()
            code, values = parse_packet(text)
            if code in CODES:
                hz = _update_code_freq(code, t)
                _update_display_state(code, values, hz)
                # JSON write permission is gated inside listen.process_telem_packet
                listen.process_telem_packet(code, values, "udp")
        except socket.timeout:
            pass   # no packet — keep looping
        except Exception as e:
            log.error(f"[UDP] Error: {e}")


if __name__ == "__main__":
    import threading
    print(f"  UDP telemetry fallback (standalone mode — port {UDP_PORT})")
    print("  " + "─" * 60)
    threading.Thread(target=_display_loop, daemon=True).start()
    run_udp_only()
