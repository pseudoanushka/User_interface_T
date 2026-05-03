from flask import Flask, render_template, send_from_directory, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import os, csv, json, math, threading, time, datetime
import socket, struct, asyncio, websockets
import urllib.request
import listen

# Project root is one level above backend/
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── RPi connection config ────────────────────────────────────────────────────
RPI_IP   = os.environ.get("RPI_IP",   "192.168.0.97")  # override with env var if needed
RPI_PORT = os.environ.get("RPI_PORT", "8000")

app = Flask(
    __name__,
    static_folder=os.path.join(_PROJECT_ROOT, "frontend", "dist", "assets"),
    static_url_path="/assets",
    template_folder=os.path.join(_PROJECT_ROOT, "frontend", "dist"),
)
CORS(app, origins=["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173", "http://127.0.0.1:8000"])
socketio = SocketIO(app, cors_allowed_origins=["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173", "http://127.0.0.1:8000"])

PARAMS_DIR  = os.path.join(_PROJECT_ROOT, "public", "params")
LOGGER_DIR  = os.path.join(_PROJECT_ROOT, "datatransfer", "logger")
FRAMES_DIR  = os.path.join(_PROJECT_ROOT, "datatransfer", "frames")

os.makedirs(LOGGER_DIR, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)

# ── JSON file paths (absolute) ───────────────────────────────────────────────
_ATTITUDE_JSON     = os.path.join(PARAMS_DIR, "ATTITUDE.json")
_BATTERY_JSON      = os.path.join(PARAMS_DIR, "BATTERY_STATUS.json")
_POSITION_JSON     = os.path.join(PARAMS_DIR, "LOCAL_POSITION_NED.json")
_DISTANCE_JSON     = os.path.join(PARAMS_DIR, "DISTANCE_SENSOR.json")
_HEARTBEAT_JSON    = os.path.join(PARAMS_DIR, "HEARTBEAT.json")
_BASE_STATION_JSON = os.path.join(PARAMS_DIR, "BASE_STATION_DATA.json")
_CHARGING_JSON     = os.path.join(PARAMS_DIR, "CHARGING_STATUS.json")
_CHARGING_JSON_FE  = os.path.join(_PROJECT_ROOT, "frontend", "public", "params", "CHARGING_STATUS.json")

_charging_lock = threading.Lock()
_charging_state = {
    "charging": False,
    "landed": False,
    "source": None,
    "timestamp": None,
    "relay_armed": False,
    "relay_triggered": False,
}

def _write_charging_status(landed: bool, source: str, relay_armed: bool = False, relay_triggered: bool = False):
    """Write charging status to both JSON param files."""
    global _charging_state
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _charging_lock:
        _charging_state.update({
            "charging":        landed,
            "landed":          landed,
            "source":          source if landed else None,
            "timestamp":       ts if landed else None,
            "relay_armed":     relay_armed,
            "relay_triggered": relay_triggered,
        })
        snap = dict(_charging_state)
    for path in (_CHARGING_JSON, _CHARGING_JSON_FE):
        try:
            with open(path, "w") as f:
                json.dump(snap, f, indent=4)
        except Exception as e:
            print(f"[charging] JSON write error ({path}): {e}")

def _read_json(path: str) -> dict:
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return {}

# ── Battery SOH Engine ────────────────────────────────────────────────────────
class BatterySOHEngine:
    """
    State-of-Health estimator using internal resistance (R_int) measurement.

    Whenever |ΔI| >= I_DELTA_MIN within a 100 ms window, we compute:
        R_int = |ΔV| / |ΔI|
    A new 4S LiPo has R_int ≈ 0.020 Ω.  As the pack degrades R_int rises, so:
        SOH = clamp(R_INT_REF / R_int × 100, 0, 100)

    While R_int has not yet been measured (no qualifying load step observed),
    a voltage-based fallback (12 V → 0 %, 16.4 V → 100 %) is used instead.

    If individual cell voltages are available, a cell-balance penalty is also
    applied: each 0.1 V of delta costs ~10 SOH points (capped at −30).
    """
    R_INT_REF     = 0.020   # Ω  — reference internal resistance for a new 4S pack
    I_DELTA_MIN   = 0.5     # A  — minimum |ΔI| to trigger an R_int measurement
    SAMPLE_WINDOW = 0.10    # s  — 100 ms window per spec
    MAX_READINGS  = 30      # rolling-average window size

    def __init__(self):
        self._lock           = threading.Lock()
        self._samples        = []   # list of (timestamp, V, I)
        self._r_int_readings = []   # rolling list of valid R_int measurements
        self._r_int          = None
        self._soh            = None
        self._c_used_mah     = 0.0
        self._v_cell_delta   = None
        self._mission_safe   = True

    def update(self, V: float, I: float, c_used_mah: float, cell_volts: list):
        now = time.time()
        with self._lock:
            self._c_used_mah = c_used_mah

            # ── Append sample, purge older than 200 ms ───────────────────────
            self._samples.append((now, V, I))
            cutoff = now - 0.20
            self._samples = [s for s in self._samples if s[0] >= cutoff]

            # ── Scan pairs within the 100 ms window for R_int ────────────────
            n = len(self._samples)
            found = False
            for i in range(n - 1):
                if found:
                    break
                t0, v0, i0 = self._samples[i]
                for j in range(i + 1, n):
                    t1, v1, i1 = self._samples[j]
                    if (t1 - t0) > self.SAMPLE_WINDOW:
                        break
                    dI = abs(i1 - i0)
                    dV = abs(v1 - v0)
                    if dI >= self.I_DELTA_MIN and dV > 0:
                        r = dV / dI
                        if 0.001 < r < 1.0:   # sanity: 1 mΩ – 1 Ω
                            self._r_int_readings.append(r)
                            if len(self._r_int_readings) > self.MAX_READINGS:
                                self._r_int_readings.pop(0)
                            found = True
                            break

            if self._r_int_readings:
                self._r_int = sum(self._r_int_readings) / len(self._r_int_readings)

            # ── Cell voltage balance delta ────────────────────────────────────
            valid_cells = [v for v in cell_volts if 2.5 < v < 4.5]
            if len(valid_cells) >= 2:
                self._v_cell_delta = round(max(valid_cells) - min(valid_cells), 4)

            # ── SOH computation ───────────────────────────────────────────────
            if self._r_int is not None:
                soh = min(100.0, max(0.0, (self.R_INT_REF / self._r_int) * 100.0))
            elif V > 0:
                soh = min(100.0, max(0.0, ((V - 12.0) / 4.4) * 100.0))
            else:
                soh = None

            if soh is not None and self._v_cell_delta is not None:
                penalty = min(30.0, (self._v_cell_delta / 0.1) * 10.0)
                soh = max(0.0, soh - penalty)

            self._soh = round(soh, 1) if soh is not None else None

            # ── Mission-continue decision ─────────────────────────────────────
            self._mission_safe = (
                (self._soh is None or self._soh >= 25.0) and
                (self._v_cell_delta is None or self._v_cell_delta < 0.5)
            )

    def get_state(self) -> dict:
        with self._lock:
            return {
                "soh":            self._soh,
                "r_int_ohm":      round(self._r_int, 5) if self._r_int is not None else None,
                "r_int_samples":  len(self._r_int_readings),
                "c_used_mah":     round(self._c_used_mah, 1),
                "v_cell_delta_v": self._v_cell_delta,
                "mission_safe":   self._mission_safe,
            }

_soh_engine = BatterySOHEngine()

def _soh_update_loop():
    """10 Hz feed of V/I samples into the SOH engine."""
    while True:
        try:
            batt   = listen.get_data().get("battery", {})
            status = _read_json(_BATTERY_JSON)
            V      = float(batt.get("voltage", 0) or 0)
            I      = float(batt.get("current", 0) or 0)
            c_used = float(status.get("current_consumed", 0) or 0)
            raw_v  = status.get("voltages", [])
            cells  = [v / 1000.0 for v in raw_v if isinstance(v, int) and 0 < v < 65535]
            _soh_engine.update(V, I, c_used, cells)
        except Exception as e:
            print(f"[soh] update error: {e}")
        time.sleep(0.1)   # 10 Hz

# ── PX4 mode decode (inlined) ────────────────────────────────────────────────
def _decode_mode(custom_mode: int) -> str:
    px4_main = (custom_mode >> 16) & 0xFF
    px4_sub  = custom_mode & 0xFFFF
    main_map = {1:"MANUAL",2:"ALTCTL",3:"POSCTL",4:"AUTO",5:"ACRO",
                6:"OFFBOARD",7:"STABILIZED",8:"RATTITUDE"}
    main = main_map.get(px4_main, f"PX4_{px4_main}")
    if main == "AUTO":
        sub_map = {2:"AUTO.TAKEOFF",3:"AUTO.LOITER",4:"AUTO.MISSION",
                   5:"AUTO.RTL",6:"AUTO.LAND",9:"AUTO.PRECLAND"}
        return sub_map.get(px4_sub, f"AUTO.SUB_{px4_sub}")
    return main if main else "UNKNOWN"

# ── Mission state ────────────────────────────────────────────────────────────
_mission_lock     = threading.Lock()
_mission_running  = False
_mission_start_ts = None
_mission_frames   = 0
_last_csv_path    = ""

# Write-through CSV handles — opened on START, closed on STOP
_csv_file         = None   # raw file handle
_csv_writer       = None   # csv.DictWriter
_rows_written     = 0      # counter

CSV_COLUMNS = [
    "timestamp", "mode", "armed",
    "roll_deg", "pitch_deg", "yaw_deg",
    "rollspeed", "pitchspeed", "yawspeed",
    "x", "y", "z",
    "vx", "vy", "vz",
    "speed_h", "altitude_agl",
    "battery_pct", "battery_v",
    "current_a0", "current_a1",
    "voltage_s1", "voltage_s2",
    "relay", "distance_m",
]

def _build_row() -> dict:
    att  = _read_json(_ATTITUDE_JSON)
    batt = _read_json(_BATTERY_JSON)
    pos  = _read_json(_POSITION_JSON)
    dist = _read_json(_DISTANCE_JSON)
    hb   = _read_json(_HEARTBEAT_JSON)
    ard  = _read_json(_BASE_STATION_JSON)

    roll_deg   = round(math.degrees(att.get("roll",  0) or 0), 3)
    pitch_deg  = round(math.degrees(att.get("pitch", 0) or 0), 3)
    yaw_deg    = round((math.degrees(att.get("yaw",  0) or 0) + 360) % 360, 3)
    rollspeed  = round(att.get("rollspeed",  0) or 0, 4)
    pitchspeed = round(att.get("pitchspeed", 0) or 0, 4)
    yawspeed   = round(att.get("yawspeed",   0) or 0, 4)

    x  = round(pos.get("x",  0) or 0, 4)
    y  = round(pos.get("y",  0) or 0, 4)
    z  = round(pos.get("z",  0) or 0, 4)
    vx = round(pos.get("vx", 0) or 0, 4)
    vy = round(pos.get("vy", 0) or 0, 4)
    vz = round(pos.get("vz", 0) or 0, 4)

    voltages = batt.get("voltages", [])
    batt_v   = 0.0
    for v in voltages:
        if isinstance(v, (int, float)) and 0 < v < 65535:
            batt_v = round(v / 1000.0, 3)
            break
    batt_pct = batt.get("battery_remaining", 0) or 0

    return {
        "timestamp":    datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
        "mode":         _decode_mode(hb.get("custom_mode", 0) or 0),
        "armed":        bool((hb.get("base_mode", 0) or 0) & 0x80),
        "roll_deg":     roll_deg,
        "pitch_deg":    pitch_deg,
        "yaw_deg":      yaw_deg,
        "rollspeed":    rollspeed,
        "pitchspeed":   pitchspeed,
        "yawspeed":     yawspeed,
        "x":            x,
        "y":            y,
        "z":            z,
        "vx":           vx,
        "vy":           vy,
        "vz":           vz,
        "speed_h":      round(math.sqrt(vx**2 + vy**2), 3),
        "altitude_agl": round(-z, 3),
        "battery_pct":  batt_pct,
        "battery_v":    batt_v,
        "current_a0":   ard.get("currentA0", 0.0) or 0.0,
        "current_a1":   ard.get("currentA1", 0.0) or 0.0,
        "voltage_s1":   ard.get("voltageS1", 0.0) or 0.0,
        "voltage_s2":   ard.get("voltageS2", 0.0) or 0.0,
        "relay":        ard.get("relay", "UNKNOWN"),
        "distance_m":   round((dist.get("current_distance", 0) or 0) / 100.0, 3),
    }

def _log_loop():
    """Write-through logger: writes each row directly to the open CSV file."""
    global _rows_written
    while True:
        try:
            with _mission_lock:
                running = _mission_running
                writer  = _csv_writer

            if not running or writer is None:
                time.sleep(0.2)
                continue

            row = _build_row()

            with _mission_lock:
                if _mission_running and _csv_writer is not None:
                    _csv_writer.writerow(row)
                    _csv_file.flush()   # ← ensure bytes hit disk immediately
                    _rows_written += 1

        except Exception as e:
            print(f"[log_loop] error: {e}")

        time.sleep(1.0)

# ── UDP Video Bridge ─────────────────────────────────────────────────────────
class UDPVideoBridge:
    """
    Generic UDP-to-WebSocket bridge for reassembling chunked JPEG frames.

    Supported header formats:
      '<IHH'  – little-endian: 4B frame_id, 2B chunk_idx, 2B total  (RPi feed, port 5005)
      '>HBB'  – big-endian:    2B frame_id, 1B chunk_idx, 1B total  (Base-station feed, port 5006)

    Wire protocol for outgoing WS binary frames:
      [4B uint32-LE json_header_len] [json_header bytes] [raw JPEG bytes]
    """
    # How many consecutive missing chunks before we drop a stale frame_id
    _STALE_LIMIT = 8
    # Maximum incomplete frame_ids to hold before evicting oldest
    _BUFFER_MAX  = 30

    def __init__(self, udp_port=5005, ws_port=9999, udp_ip="0.0.0.0", header_format="<IHH"):
        self.udp_port      = udp_port
        self.ws_port       = ws_port
        self.udp_ip        = udp_ip
        self.header_format = header_format
        self.header_size   = struct.calcsize(header_format)
        self.connected_clients: set = set()
        # frame_id → {"p": {chunk_idx: bytes}, "t": total, "ts": time.time()}
        self.frame_buffer: dict = {}

    async def ws_handler(self, websocket):
        self.connected_clients.add(websocket)
        print(f"[UDP-BRIDGE:{self.ws_port}] Client connected ({len(self.connected_clients)} total)")
        try:
            await websocket.wait_closed()
        finally:
            self.connected_clients.discard(websocket)
            print(f"[UDP-BRIDGE:{self.ws_port}] Client disconnected ({len(self.connected_clients)} remaining)")

    def udp_receiver_thread(self, loop):
        """Blocking thread: receive UDP chunks, reassemble JPEGs, push to WS clients."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Large OS receive buffer – critical on Windows to avoid kernel-side drops
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
        sock.settimeout(2.0)   # allow thread to check liveness without hanging
        try:
            sock.bind((self.udp_ip, self.udp_port))
            print(f"[UDP-BRIDGE:{self.ws_port}] Listening on UDP :{self.udp_port}  header='{self.header_format}'")
        except OSError as e:
            print(f"[UDP-BRIDGE:{self.ws_port}] BIND FAILED on :{self.udp_port} — {e}")
            return

        _latest_fid = 0   # newest frame_id seen (unsigned short wraps at 65535)

        while True:
            try:
                data, _ = sock.recvfrom(65536)
            except socket.timeout:
                # Periodic stale-entry cleanup even when no packets arrive
                self._evict_stale()
                continue
            except OSError:
                break

            if len(data) < self.header_size:
                continue

            try:
                frame_id, idx, total = struct.unpack(
                    self.header_format, data[: self.header_size]
                )
            except struct.error:
                continue

            chunk = data[self.header_size :]
            now   = time.time()

            # Initialise buffer slot for this frame_id
            if frame_id not in self.frame_buffer:
                self.frame_buffer[frame_id] = {"p": {}, "t": total, "ts": now}
                # Evict oldest slots if we're holding too many incomplete frames
                if len(self.frame_buffer) > self._BUFFER_MAX:
                    oldest = min(self.frame_buffer, key=lambda k: self.frame_buffer[k]["ts"])
                    del self.frame_buffer[oldest]

            self.frame_buffer[frame_id]["p"][idx] = chunk
            _latest_fid = frame_id

            # Check for complete frame
            entry = self.frame_buffer[frame_id]
            if len(entry["p"]) >= entry["t"]:
                # Reassemble all chunks in order
                full_frame  = b"".join(entry["p"][i] for i in range(entry["t"]))
                json_header = json.dumps({"frame_id": frame_id, "ts": now}).encode("utf-8")
                msg         = struct.pack("<I", len(json_header)) + json_header + full_frame
                if self.connected_clients:
                    asyncio.run_coroutine_threadsafe(self._broadcast(msg), loop)
                del self.frame_buffer[frame_id]

    def _evict_stale(self, max_age: float = 1.5):
        """Remove incomplete frame_ids older than max_age seconds."""
        cutoff = time.time() - max_age
        stale  = [fid for fid, v in self.frame_buffer.items() if v["ts"] < cutoff]
        for fid in stale:
            del self.frame_buffer[fid]

    async def _broadcast(self, msg: bytes):
        if not self.connected_clients:
            return
        clients = list(self.connected_clients)  # snapshot to avoid set-size change during iteration
        await asyncio.gather(
            *(ws.send(msg) for ws in clients),
            return_exceptions=True
        )

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        # UDP receiver runs in its own blocking thread; WS server lives in the event loop
        threading.Thread(
            target=self.udp_receiver_thread,
            args=(loop,),
            daemon=True,
            name=f"udp-rx-{self.udp_port}"
        ).start()

        async def _main():
            async with websockets.serve(self.ws_handler, "0.0.0.0", self.ws_port):
                print(f"[UDP-BRIDGE:{self.udp_port}] WebSocket server on ws://0.0.0.0:{self.ws_port}")
                await asyncio.Future()  # run forever

        loop.run_until_complete(_main())


def start_udp_bridge():
    """RPi camera feed: UDP 5005 → WS 9999.  Header format <IHH."""
    bridge = UDPVideoBridge(udp_port=5005, ws_port=9999, udp_ip="0.0.0.0", header_format="<IHH")
    threading.Thread(target=bridge.run, daemon=True, name="rpi-udp-bridge").start()


# ── BASE STATION UDP CAMERA VIDEO BRIDGE ─────────────────────────────────────
def start_bs_video_bridge():
    """
    Base-station camera feed: UDP 5006 → WS 9998.
    Header format >HBB (big-endian): 2B frame_id | 1B chunk_idx | 1B total_chunks
    Matches the base-station server's stream_frame() packet layout exactly.
    Telemetry events (JSON, UDP 5007) are handled separately in listen.py.
    """
    bridge = UDPVideoBridge(udp_port=5006, ws_port=9998, udp_ip="0.0.0.0", header_format=">HBB")
    threading.Thread(target=bridge.run, daemon=True, name="bs-udp-bridge").start()


# Start threads at module level
threading.Thread(target=listen.main,       daemon=True, name="listen-mavlink").start()
threading.Thread(target=_log_loop,         daemon=True, name="csv-logger").start()
threading.Thread(target=_soh_update_loop,  daemon=True, name="soh-engine").start()
start_udp_bridge()
start_bs_video_bridge()

# ── RPi Proxy helpers ─────────────────────────────────────────────────────────
def _fetch_rpi_json(path: str, timeout: float = 1.0):
    """Fetch JSON from the RPi FastAPI server with a short timeout."""
    url = f"http://{RPI_IP}:{RPI_PORT}{path}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None

_ALLOWED_DRONE_COMMANDS = {"arm", "takeoff", "land", "disarm", "kill"}

def _send_rpi_command(command: str, timeout: float = 2.0):
    """Forward an operator command to the RPi FastAPI server."""
    url = f"http://{RPI_IP}:{RPI_PORT}/{command}"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode()
            try:
                payload = json.loads(body) if body else {}
            except Exception:
                payload = {"raw": body}
            return True, resp.status, payload
    except Exception as e:
        return False, 502, {"error": str(e)}

# Cache the last known RPi telemetry so the endpoint doesn't block forever
_rpi_telemetry_cache: dict = {}
_rpi_telemetry_lock = threading.Lock()

_rpi_landed_fired = False  # one-shot flag so relay fires only once per landing

def _rpi_poll_loop():
    """Background thread: poll RPi /telemetry every 200 ms and cache result.
    Watches for landed=True from RPi and auto-triggers charging + relay."""
    global _rpi_telemetry_cache, _rpi_landed_fired
    while True:
        data = _fetch_rpi_json("/telemetry")
        if data:
            with _rpi_telemetry_lock:
                _rpi_telemetry_cache = data

            # Auto-trigger when RPi reports landed
            rpi_landed = bool(data.get("landed", False))
            if rpi_landed and not _rpi_landed_fired:
                _rpi_landed_fired = True
                print("[charging] RPi landed signal detected — arming relay and writing charging status")
                _write_charging_status(True, "rpi", relay_armed=True)
                success = listen.send_arduino_cmd("landed")
                if success:
                    _write_charging_status(True, "rpi", relay_armed=True, relay_triggered=True)
                    print("[charging] Relay triggered via RPi landed signal")
                else:
                    print("[charging] Base station HTTP unreachable — charging status set from RPi signal")
            elif not rpi_landed:
                # Reset one-shot when drone is no longer landed (next flight)
                _rpi_landed_fired = False
        time.sleep(0.2)

threading.Thread(target=_rpi_poll_loop, daemon=True).start()

def _compute_phase(t: dict) -> str:
    """Derive a human-readable flight phase from the RPi telemetry dict."""
    ptp  = t.get("post_takeoff_phase", "idle")
    auto = t.get("auto", False)
    lp   = t.get("landing_phase", 0)
    armed = t.get("armed", False)
    in_air = t.get("in_air", False)

    phase_map = {
        "align_3_5m": "PT-ALIGNING",
        "climb_3_5m": "PT-CLIMBING",
        "hover_5min": "PT-HOVERING",
        "auto_land":  "PT-AUTOLAND",
    }
    if ptp in phase_map:
        return phase_map[ptp]

    if auto:
        lp_map = {0: "ALIGNING", 1: "DESCENDING", 2: "FINAL APPROACH"}
        return lp_map.get(lp, "AUTO")

    if in_air:
        return "AIRBORNE"
    if armed:
        return "ARMED"
    return "STANDBY"

# ── Routes ───────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/public/params/<filename>')
def serve_param(filename):
    return send_from_directory(PARAMS_DIR, filename)

@app.route('/vite.svg')
def serve_vite_svg():
    return send_from_directory('frontend/dist', 'vite.svg')

@app.route('/static/js/script.js')
def script():
    return "Not Found", 404

@app.route("/telemetry")
def telemetry():
    with _rpi_telemetry_lock:
        rpi_data = dict(_rpi_telemetry_cache)
    with _charging_lock:
        charging_snap = dict(_charging_state)
    ard = listen.get_arduino_data()
    return jsonify({
        "ZIGBEE":  listen.get_data(),
        "ARDUINO": ard,
        "RPI":     rpi_data,
        # Raw JSON param files — ground-truth MAVLink values
        "PARAMS": {
            "ATTITUDE":           _read_json(_ATTITUDE_JSON),
            "BATTERY_STATUS":     _read_json(_BATTERY_JSON),
            "LOCAL_POSITION_NED": _read_json(_POSITION_JSON),
            "HEARTBEAT":          _read_json(_HEARTBEAT_JSON),
            "DISTANCE_SENSOR":    _read_json(_DISTANCE_JSON),
            "BASE_STATION_DATA":  _read_json(_BASE_STATION_JSON),
            "CHARGING_STATUS":    charging_snap,
        },
        # Convenience top-level fields for base station zone / relay state
        "BS_ZONE":  ard.get("zone_state",      "OUT"),
        "BS_ARMED": ard.get("relay_armed",     False),
        "BS_TRIG":  ard.get("relay_triggered", False),
    })

@app.route("/params/all")
def params_all():
    """Return all MAVLink param JSON files in one call for real-time frontend polling."""
    with _charging_lock:
        charging_snap = dict(_charging_state)
    return jsonify({
        "ATTITUDE":           _read_json(_ATTITUDE_JSON),
        "BATTERY_STATUS":     _read_json(_BATTERY_JSON),
        "LOCAL_POSITION_NED": _read_json(_POSITION_JSON),
        "HEARTBEAT":          _read_json(_HEARTBEAT_JSON),
        "DISTANCE_SENSOR":    _read_json(_DISTANCE_JSON),
        "BASE_STATION_DATA":  _read_json(_BASE_STATION_JSON),
        "CHARGING_STATUS":    charging_snap,
    })

@app.route("/battery/soh")
def battery_soh():
    """Return current State-of-Health metrics computed by BatterySOHEngine."""
    return jsonify(_soh_engine.get_state())

@app.route("/rpi/telemetry")
def rpi_telemetry():
    """Pass-through: return cached RPi telemetry."""
    with _rpi_telemetry_lock:
        data = dict(_rpi_telemetry_cache)
    if not data:
        return jsonify({"error": "RPi not reachable"}), 503
    return jsonify(data)

@app.route("/rpi/phase")
def rpi_phase():
    """Return the current drone flight phase as a short string."""
    with _rpi_telemetry_lock:
        data = dict(_rpi_telemetry_cache)
    phase = _compute_phase(data) if data else "OFFLINE"
    return jsonify({"phase": phase, "telemetry": data})

@app.route("/drone/control/<command>", methods=["POST"])
def drone_control(command):
    """
    Frontend -> GCS backend -> RPi: operator drone controls.
    Accepted commands: arm, takeoff, land, disarm, kill.
    """
    command = command.lower()
    if command not in _ALLOWED_DRONE_COMMANDS:
        return jsonify({"success": False, "error": f"Unsupported command '{command}'"}), 400

    ok, status, payload = _send_rpi_command(command)
    response = {
        "success": ok,
        "command": command,
        "rpi_status": status,
        "rpi_response": payload,
    }

    if command == "land":
        _write_charging_status(True, "manual", relay_armed=True)
        relay_ok = listen.send_arduino_cmd("landed")
        response["base_station_relay_armed"] = relay_ok
        if relay_ok:
            _write_charging_status(True, "manual", relay_armed=True, relay_triggered=True)

    return jsonify(response), 200 if ok else 502

@app.route("/bs/landed", methods=["POST"])
def bs_landed():
    """
    Frontend → GCS → Base Station: arm the relay trigger.
    Calls listen.send_base_station_landed() which POSTs to the base
    station Flask API at http://{BS_HTTP_IP}:5000/drone-landed.
    """
    _write_charging_status(True, "manual", relay_armed=True)
    success = listen.send_arduino_cmd("landed")
    if success:
        _write_charging_status(True, "manual", relay_armed=True, relay_triggered=True)
        return jsonify({"success": True, "message": "drone-landed forwarded to base station"})
    # HTTP to base station failed (timeout) but we still mark charging active
    print("[charging] Base station HTTP unreachable — charging status set locally")
    return jsonify({"success": False, "error": "Could not reach base station REST API", "charging_status": "set_locally"}), 502

@app.route("/bs/reset", methods=["POST"])
def bs_reset():
    """Frontend → GCS → Base Station: disarm and reset the relay."""
    _write_charging_status(False, None)
    success = listen.send_arduino_cmd("reset")
    if success:
        return jsonify({"success": True, "message": "drone-reset forwarded to base station"})
    return jsonify({"success": False, "error": "Could not reach base station REST API"}), 502

@app.route("/charging-status")
def charging_status():
    """Return current charging/landed status for frontend polling."""
    with _charging_lock:
        return jsonify(dict(_charging_state))

@app.route("/landed-status")
def landed_status():
    """Frontend polls this to know when to connect to the base WS."""
    with _rpi_telemetry_lock:
        landed = bool(_rpi_telemetry_cache.get("landed", False))
    return jsonify({
        "landed":   landed,
        "ws_ready": True,
    })


@app.route("/relay", methods=["POST"])
def relay_control():
    data = request.get_json() or {}
    cmd = data.get("command")
    if not cmd:
        return jsonify({"success": False, "error": "No command provided"}), 400
    
    success = listen.send_arduino_cmd(cmd)
    if success:
        return jsonify({"success": True, "message": f"Command '{cmd}' sent to Arduino"})
    else:
        return jsonify({"success": False, "error": "Failed to send command or Arduino not connected"}), 500

# ── Mission endpoints ─────────────────────────────────────────────────────────
@app.route("/mission/start", methods=["POST"])
def mission_start():
    global _mission_running, _mission_start_ts, _mission_frames
    global _csv_file, _csv_writer, _rows_written, _last_csv_path

    # Close any previously open file
    with _mission_lock:
        if _csv_file:
            try:
                _csv_file.close()
            except Exception:
                pass

    ts       = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = os.path.join(LOGGER_DIR, f"mission_{ts}.csv")

    f      = open(csv_path, "w", newline="")
    writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    f.flush()

    with _mission_lock:
        _csv_file        = f
        _csv_writer      = writer
        _last_csv_path   = csv_path
        _mission_running = True
        _mission_start_ts= datetime.datetime.now()
        _mission_frames  = 0
        _rows_written    = 0

    print(f"[mission] Started — writing to {csv_path}")
    return jsonify({"status": "started", "csv_path": csv_path})

@app.route("/mission/stop", methods=["POST"])
def mission_stop():
    global _mission_running, _csv_file, _csv_writer

    with _mission_lock:
        _mission_running = False
        f       = _csv_file
        rows    = _rows_written
        frames  = _mission_frames
        path    = _last_csv_path
        _csv_file   = None
        _csv_writer = None

    # Close the file outside the lock
    if f:
        try:
            f.flush()
            f.close()
            print(f"[mission] Stopped — CSV saved: {path} ({rows} rows)")
        except Exception as e:
            print(f"[mission] Error closing CSV: {e}")

    return jsonify({
        "status":       "stopped",
        "csv_path":     path,
        "rows_logged":  rows,
        "frames_saved": frames,
    })

@app.route("/mission/status")
def mission_status():
    with _mission_lock:
        running = _mission_running
        start   = _mission_start_ts
        rows    = _rows_written
        frames  = _mission_frames
        path    = _last_csv_path
    elapsed = round((datetime.datetime.now() - start).total_seconds(), 1) if (running and start) else 0
    return jsonify({
        "running":      running,
        "elapsed_s":    elapsed,
        "rows_logged":  rows,
        "frames_saved": frames,
        "last_csv":     path,
    })

@app.route("/mission/logs")
def mission_logs():
    """Return up to last 200 rows of the saved CSV."""
    path = _last_csv_path
    if not path or not os.path.exists(path):
        return jsonify({"path": "", "rows": [], "columns": CSV_COLUMNS})
    rows = []
    try:
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                rows.append(row)
    except Exception as e:
        return jsonify({"path": path, "rows": [], "columns": CSV_COLUMNS, "error": str(e)})
    return jsonify({"path": path, "columns": CSV_COLUMNS, "rows": rows[-200:]})

@app.route("/mission/save_frame", methods=["POST"])
def save_frame():
    global _mission_frames
    with _mission_lock:
        running = _mission_running
    if not running:
        return jsonify({"saved": False, "reason": "mission not running"})
    data = request.get_data()
    if not data:
        return jsonify({"saved": False, "reason": "no data"})
    ts   = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    path = os.path.join(FRAMES_DIR, f"{ts}.jpeg")
    with open(path, "wb") as f:
        f.write(data)
    with _mission_lock:
        _mission_frames += 1
    return jsonify({"saved": True, "path": path})

if __name__ == "__main__":
    import socket as _socket
    PORT = 8000
    for attempt in range(5):
        try:
            socketio.run(app, host="0.0.0.0", port=PORT, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
            break
        except OSError as e:
            if "10048" in str(e) or "address" in str(e).lower():
                print(f"\n[server] Port {PORT} is already in use (attempt {attempt+1}/5). "
                      f"Waiting 8 seconds for it to free up...\n"
                      f"  -> To fix immediately: close any other terminal running this server,\n"
                      f"    or run:  Stop-Process -Name python* -Force\n")
                time.sleep(8)
            else:
                raise
