from flask import Flask, render_template, send_from_directory, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import os, csv, json, math, threading, time, datetime
import listen

app = Flask(__name__, static_folder="frontend/dist/assets", static_url_path="/assets", template_folder="frontend/dist")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

PARAMS_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "params")
LOGGER_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datatransfer", "logger")
FRAMES_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datatransfer", "frames")

os.makedirs(LOGGER_DIR, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)

# ── JSON file paths (absolute) ───────────────────────────────────────────────
_ATTITUDE_JSON     = os.path.join(PARAMS_DIR, "ATTITUDE.json")
_BATTERY_JSON      = os.path.join(PARAMS_DIR, "BATTERY_STATUS.json")
_POSITION_JSON     = os.path.join(PARAMS_DIR, "LOCAL_POSITION_NED.json")
_DISTANCE_JSON     = os.path.join(PARAMS_DIR, "DISTANCE_SENSOR.json")
_HEARTBEAT_JSON    = os.path.join(PARAMS_DIR, "HEARTBEAT.json")
_BASE_STATION_JSON = os.path.join(PARAMS_DIR, "BASE_STATION_DATA.json")

def _read_json(path: str) -> dict:
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return {}

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

# Start threads at module level
threading.Thread(target=listen.main, daemon=True).start()
threading.Thread(target=_log_loop,   daemon=True).start()

# ArUco thread removed — not in use

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
    return jsonify({
        "ZIGBEE":  listen.get_data(),
        "ARDUINO": listen.get_arduino_data()
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
            socketio.run(app, host="0.0.0.0", port=PORT, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
            break
        except OSError as e:
            if "10048" in str(e) or "address" in str(e).lower():
                print(f"\n[server] Port {PORT} is already in use (attempt {attempt+1}/5). "
                      f"Waiting 8 seconds for it to free up...\n"
                      f"  → To fix immediately: close any other terminal running this server,\n"
                      f"    or run:  Stop-Process -Name python* -Force\n")
                time.sleep(8)
            else:
                raise
