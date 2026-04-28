import os
import json
import time
import math
import socket
import serial
import urllib.request
from dataclasses import dataclass
from typing import Optional
from pymavlink import mavutil
from threading import Lock
import threading

BS_UDP_IP = "0.0.0.0"
BS_UDP_PORT = 5007

# Base station IP for HTTP REST calls (new base station Flask API on port 5000)
# ⚠ This must be the IP of the MACHINE running the base station code (AprilTag detector),
#   NOT the laptop IP. Run `ipconfig` on the base station machine to find it.
BS_HTTP_IP   = "192.168.0.42"    # ← base station machine IP
BS_HTTP_PORT = 5000
# Project root is one level above backend/
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_STATION_JSON = os.path.join(_BASE_DIR, "public", "params", "BASE_STATION_DATA.json")

arduino_lock = Lock()
arduino_data = {"raw": "No data yet"}
arduino_ser = None

def _flush_bs_json() -> None:
    """Write the current arduino_data snapshot to BASE_STATION_DATA.json (caller holds no lock)."""
    with arduino_lock:
        snap = dict(arduino_data)
    out = {
        "relay":           str(snap.get("relay", "UNKNOWN")).upper(),
        "currentA0":       float(snap.get("currentA0", 0.0)),
        "currentA1":       float(snap.get("currentA1", 0.0)),
        "voltageS1":       float(snap.get("voltageS1", 0.0)),
        "voltageS2":       float(snap.get("voltageS2", 0.0)),
        "zone_state":      snap.get("zone_state", "OUT"),
        "zone_marker":     snap.get("zone_marker", {}),
        "relay_armed":     bool(snap.get("relay_armed", False)),
        "relay_triggered": bool(snap.get("relay_triggered", False)),
        "last_event":      snap.get("last_event", ""),
        "raw":             snap.get("raw", ""),
    }
    payload = json.dumps(out, indent=4)
    try:
        with open(BASE_STATION_JSON, "w", encoding="utf-8") as f:
            f.write(payload)
    except Exception as e:
        print(f"[BS-JSON] Write error: {e}")


def arduino_udp_listener():
    """
    Loop to listen for all base station telemetry events on UDP port 5007.

    New base station sends multiple event types:
      - arduino_data   : relay state + current/voltage readings
      - zone_update    : marker IN/OUT of landing zone
      - relay_armed    : /drone-landed was called, relay is armed
      - relay_triggered: relay fired (marker confirmed in zone)
      - relay_disarmed : /drone-reset was called
    """
    global arduino_data
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((BS_UDP_IP, BS_UDP_PORT))
    print(f"[ARDUINO-UDP] Listening for base station telemetry on UDP {BS_UDP_IP}:{BS_UDP_PORT}")

    while True:
        try:
            data, _ = sock.recvfrom(65535)
            raw_message = data.decode('utf-8', errors='replace')
            parsed = json.loads(raw_message)
            event = parsed.get("event", "")

            with arduino_lock:
                arduino_data["raw"] = raw_message
                arduino_data["last_event"] = event

            if event == "arduino_data":
                with arduino_lock:
                    arduino_data.update({
                        "relay":      str(parsed.get("relay", arduino_data.get("relay", "UNKNOWN"))).upper(),
                        "currentA0":  float(parsed.get("current_A1", parsed.get("current_A0", 0.0))),
                        "currentA1":  float(parsed.get("current_A2", parsed.get("current_A1", 0.0))),
                        "voltageS1":  float(parsed.get("voltage_S1", 0.0)),
                        "voltageS2":  float(parsed.get("voltage_S2", 0.0)),
                    })

            elif event == "zone_update":
                state   = parsed.get("state", "OUT")
                marker  = parsed.get("marker", {})
                armed   = parsed.get("armed", False)
                trig    = parsed.get("triggered", False)
                with arduino_lock:
                    arduino_data["zone_state"]       = state
                    arduino_data["zone_marker"]      = marker
                    arduino_data["relay_armed"]      = armed
                    arduino_data["relay_triggered"]  = trig
                print(f"[BS-ZONE] Marker {state} | armed={armed} | triggered={trig}")

            elif event == "relay_armed":
                with arduino_lock:
                    arduino_data["relay_armed"]     = True
                    arduino_data["relay_triggered"] = False
                print("[BS-RELAY] Armed — waiting for marker in zone")

            elif event == "relay_triggered":
                with arduino_lock:
                    arduino_data["relay_triggered"] = True
                    arduino_data["relay"]           = "ON"
                print("[BS-RELAY] TRIGGERED — relay ON")

            elif event == "relay_disarmed":
                with arduino_lock:
                    arduino_data["relay_armed"]     = False
                    arduino_data["relay_triggered"] = False
                print("[BS-RELAY] Disarmed")

            # Flush current state to disk after every event
            _flush_bs_json()

        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            print(f"[ARDUINO-UDP] Bad packet ignored: {e}")
        except Exception as e:
            print(f"[ARDUINO-UDP] Unexpected error: {e}")

def read_arduino_thread():
    """Entry point to run the UDP listener in a background thread."""
    arduino_udp_listener()

def send_base_station_landed() -> bool:
    """
    POST to the base station Flask REST API to arm the relay trigger.
    Called when the drone lands (GCS detects rpi.landed == True).
    Returns True on success.
    """
    import urllib.request
    url = f"http://{BS_HTTP_IP}:{BS_HTTP_PORT}/drone-landed"
    try:
        req = urllib.request.Request(url, method="POST", data=b"{}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=3) as resp:
            body = json.loads(resp.read().decode())
            print(f"[BS-HTTP] POST /drone-landed → {body}")
            return True
    except Exception as e:
        print(f"[BS-HTTP] POST /drone-landed failed: {e}")
        return False

def send_base_station_reset() -> bool:
    """POST /drone-reset to disarm the relay after the drone departs."""
    import urllib.request
    url = f"http://{BS_HTTP_IP}:{BS_HTTP_PORT}/drone-reset"
    try:
        req = urllib.request.Request(url, method="POST", data=b"{}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=3) as resp:
            body = json.loads(resp.read().decode())
            print(f"[BS-HTTP] POST /drone-reset → {body}")
            return True
    except Exception as e:
        print(f"[BS-HTTP] POST /drone-reset failed: {e}")
        return False

def send_arduino_cmd(cmd: str) -> bool:
    """Compatibility shim — routes 'landed'/'reset' to base station REST API."""
    if cmd == "landed":
        return send_base_station_landed()
    if cmd in ("reset", "disarmed"):
        return send_base_station_reset()
    print(f"[BS-WS-BACKEND] Unknown command '{cmd}' — ignored.")
    return False

def get_arduino_data():
    """Return current base station data snapshot (thread-safe copy)."""
    with arduino_lock:
        snap = dict(arduino_data)

    return {
        "relay":           snap.get("relay",           "UNKNOWN"),
        "currentA0":       snap.get("currentA0",       0.0),
        "currentA1":       snap.get("currentA1",       0.0),
        "voltageS1":       snap.get("voltageS1",       0.0),
        "voltageS2":       snap.get("voltageS2",       0.0),
        "zone_state":      snap.get("zone_state",      "OUT"),
        "zone_marker":     snap.get("zone_marker",     {}),
        "relay_armed":     snap.get("relay_armed",     False),
        "relay_triggered": snap.get("relay_triggered", False),
        "last_event":      snap.get("last_event",      ""),
        "raw":             snap.get("raw",             ""),
    }






lock = Lock()
latest_data = {
    "mode": "UNKNOWN",
    "armed": False,
    "battery": { "voltage": 0.0, "current": 0.0, "percent": 0 },
    "attitude": { "roll": 0.0, "pitch": 0.0, "yaw": 0.0 },
    "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
    "velocity": { "vx": 0.0, "vy": 0.0, "vz": 0.0 },
    "distance": 0.0,
    "flow_q": 0,
    "temperature": 45,
    "linkQuality": 95,
    "storage": 67,
    "cpuLoad": 42
}

# ================= CONFIG =================
COM_PORT = "COM11"
BAUD = 115200
PARAMS_DIR = os.path.join(_BASE_DIR, "public", "params")

# Messages you want saved as JSON
LOG_MESSAGE_TYPES = {
    "ATTITUDE",
    "AHRS",
    "AHRS2",
    "BATTERY_STATUS",
    "HEARTBEAT",
    "DISTANCE_SENSOR",
    "GLOBAL_POSITION_INT",
    "RANGEFINDER",
    "RAW_IMU",
    "SCALED_IMU2",
    "LOCAL_POSITION_NED",
    "STATUSTEXT",
}

os.makedirs(PARAMS_DIR, exist_ok=True)

# global latest_data 
# ================= TELEMETRY MODEL =================
@dataclass
class Tel:
    armed: bool = False
    flight_mode: str = "UNKNOWN"

    batt_v: Optional[float] = None
    batt_a: Optional[float] = None
    batt_pct: Optional[int] = None

    drop_rate_comm: Optional[int] = None
    errors_comm: Optional[int] = None

    roll_deg: Optional[float] = None
    pitch_deg: Optional[float] = None
    yaw_deg: Optional[float] = None

    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
    vx: Optional[float] = None
    vy: Optional[float] = None
    vz: Optional[float] = None

    ox: Optional[float] = None
    oy: Optional[float] = None
    oz: Optional[float] = None

    flow_q: Optional[int] = None
    flow_int_x: Optional[float] = None
    flow_int_y: Optional[float] = None
    flow_dt_ms: Optional[float] = None

    dist_m: Optional[float] = None

    last_msg: str = ""
    last_msg_time: float = 0.0


# ================= HELPERS =================

def _safe_float(val, fallback: float = 0.0) -> float:
    """Return val as float, replacing NaN/Inf/None with fallback."""
    try:
        f = float(val)
        return f if math.isfinite(f) else fallback
    except (TypeError, ValueError):
        return fallback

def save_message_to_json(msg):
    try:
        file_path = os.path.join(PARAMS_DIR, f"{msg.get_type()}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            msg_dict = msg.to_dict()
            for k, v in msg_dict.items():
                if isinstance(v, (bytes, bytearray)):
                    try:
                        msg_dict[k] = v.decode('utf-8')
                    except Exception:
                        msg_dict[k] = list(v)
            json.dump(msg_dict, f, indent=4)
    except Exception as e:
        print(f"JSON save error ({msg.get_type()}): {e}")


def request_message_hz(master, msg_id, hz):
    interval_us = int(1e6 / hz) if hz > 0 else -1
    master.mav.command_long_send(
        master.target_system,
        master.target_component,
        mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
        0,
        msg_id,
        interval_us,
        0, 0, 0, 0, 0
    )


def decode_px4_mode(hb):
    px4_main = (hb.custom_mode >> 16) & 0xFF
    px4_sub = hb.custom_mode & 0xFFFF

    main_map = {
        1: "MANUAL",
        2: "ALTCTL",
        3: "POSCTL",
        4: "AUTO",
        5: "ACRO",
        6: "OFFBOARD",
        7: "STABILIZED",
        8: "RATTITUDE",
    }

    main = main_map.get(px4_main, f"PX4_{px4_main}")

    if main == "AUTO":
        auto_sub = {
            2: "AUTO.TAKEOFF",
            3: "AUTO.LOITER",
            4: "AUTO.MISSION",
            5: "AUTO.RTL",
            6: "AUTO.LAND",
            9: "AUTO.PRECLAND",
        }
        return auto_sub.get(px4_sub, f"AUTO.SUB_{px4_sub}")

    return main


def fmt(v, w=6, p=2):
    if v is None:
        return "nan".rjust(w)
    return f"{v:{w}.{p}f}"
def get_data():
    with lock:
        return latest_data.copy()

# global master instance for external triggers
global_master = None

# ================= MAIN =================
def trigger_takeoff(altitude=10.0):
    global global_master
    if global_master:
        print(f"Triggering takeoff to {altitude}m...")
        global_master.mav.command_long_send(
            global_master.target_system,
            global_master.target_component,
            mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
            0,
            0, 0, 0, 0, 0, 0, altitude
        )
        return True
    print("Takeoff failed: MAVLink master not connected")
    return False

# ══════════════════════════════════════════════════════════════════════════════
# ZIGBEE CUSTOM TELEMETRY  (primary source)
# Fallback: udp_telem_reciever.run_udp_only() — activated on serial failure.
# _telem_source is the single gate: only the matching source writes JSON.
# ══════════════════════════════════════════════════════════════════════════════

ZIGBEE_COM_PORT  = "COM11"
ZIGBEE_BAUD_RATE = 115200
ZIGBEE_TIMEOUT   = 2.0      # serial read timeout (s); empty readline → failover

_TELEM_ATTITUDE_JSON = os.path.join(_BASE_DIR, "public", "params", "ATTITUDE.json")
_TELEM_POSITION_JSON = os.path.join(_BASE_DIR, "public", "params", "LOCAL_POSITION_NED.json")
_TELEM_BATTERY_JSON  = os.path.join(_BASE_DIR, "public", "params", "BATTERY_STATUS.json")
_TELEM_DISTANCE_JSON = os.path.join(_BASE_DIR, "public", "params", "DISTANCE_SENSOR.json")

_telem_source      = "zigbee"   # "zigbee" → listen.py writes  |  "udp" → udp_telem_reciever writes
_telem_source_lock = Lock()
_telem_json_lock   = Lock()

_TELEM_CODES = ["A", "B", "D"]


def _parse_telem_packet(raw: str):
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


def _write_telem_json(path: str, data: dict) -> None:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with _telem_json_lock:
            with open(path, "w") as f:
                json.dump(data, f, indent=4)
    except Exception as e:
        print(f"[TELEM-JSON] Write failed {path}: {e}")


def process_telem_packet(code: str, values: list, source: str) -> None:
    """
    Write telemetry JSON. Gate: only the active source may write.
      source="zigbee" → called by zigbee_telem_thread (this file)
      source="udp"    → called by udp_telem_reciever.run_udp_only
    """
    with _telem_source_lock:
        active = _telem_source
    if source != active:
        return   # other source is active — skip

    if code == "A" and len(values) == 9:
        _write_telem_json(_TELEM_ATTITUDE_JSON, {
            "mavpackettype": "ATTITUDE",
            "roll":       math.radians(values[0]),
            "pitch":      math.radians(values[1]),
            "yaw":        math.radians(values[2]),
            "rollspeed":  0.0, "pitchspeed": 0.0, "yawspeed": 0.0,
        })
        _write_telem_json(_TELEM_POSITION_JSON, {
            "mavpackettype": "LOCAL_POSITION_NED",
            "x":  values[3], "y":  values[4], "z":  values[5],
            "vx": values[6], "vy": values[7], "vz": values[8],
        })
    elif code == "B" and len(values) == 3:
        _write_telem_json(_TELEM_BATTERY_JSON, {
            "mavpackettype":     "BATTERY_STATUS",
            "voltages":          [int(_safe_float(values[0]) * 1000)] + [65535] * 9,
            "current_battery":   int(_safe_float(values[2]) * 100),
            "battery_remaining": int(_safe_float(values[1])),
        })
    elif code == "D" and len(values) == 3:
        _write_telem_json(_TELEM_DISTANCE_JSON, {
            "mavpackettype":    "DISTANCE_SENSOR",
            "current_distance": int(_safe_float(values[0]) * 100),
            "rpi_temp":         round(_safe_float(values[1]), 1),
            "imu_temp":         round(_safe_float(values[2]), 1),
        })


_udp_fallback_started = False
_udp_fallback_lock    = Lock()


def _ensure_udp_fallback_running() -> None:
    global _udp_fallback_started
    with _udp_fallback_lock:
        if _udp_fallback_started:
            return   # already running — UDP thread keeps looping in background
        _udp_fallback_started = True
    import udp_telem_reciever
    threading.Thread(
        target=udp_telem_reciever.run_udp_only,
        daemon=True,
        name="udp-telem-fallback",
    ).start()
    print("[TELEM] UDP fallback activated")


def zigbee_telem_thread() -> None:
    """
    Primary telemetry source. Reads [CODE$$...##] from Zigbee serial.
    On timeout or error: sets _telem_source="udp" and starts UDP fallback.
    On reconnect: reclaims _telem_source="zigbee" from UDP automatically.
    """
    global _telem_source
    while True:
        ser = None
        try:
            ser = serial.Serial(ZIGBEE_COM_PORT, ZIGBEE_BAUD_RATE, timeout=ZIGBEE_TIMEOUT)
            print(f"[ZIGBEE] Opened {ZIGBEE_COM_PORT} — Zigbee telemetry active")
            with _telem_source_lock:
                _telem_source = "zigbee"

            while True:
                line = ser.readline()
                if not line:
                    # readline timeout — no packet within ZIGBEE_TIMEOUT seconds
                    print("[ZIGBEE] Packet timeout — handing over to UDP")
                    with _telem_source_lock:
                        _telem_source = "udp"
                    _ensure_udp_fallback_running()
                    continue   # keep polling; reclaim when signal returns

                # packet received — reclaim permission if UDP was active
                with _telem_source_lock:
                    if _telem_source == "udp":
                        print("[ZIGBEE] Signal restored — reclaiming from UDP")
                        _telem_source = "zigbee"

                text = line.decode("utf-8", errors="replace").strip()
                code, values = _parse_telem_packet(text)
                if code in _TELEM_CODES:
                    process_telem_packet(code, values, "zigbee")

        except serial.SerialException as e:
            print(f"[ZIGBEE] Serial error: {e} — handing over to UDP, retrying in 3s")
            with _telem_source_lock:
                _telem_source = "udp"
            _ensure_udp_fallback_running()
            time.sleep(3)
        except Exception as e:
            print(f"[ZIGBEE] Unexpected error: {e} — retrying in 3s")
            with _telem_source_lock:
                _telem_source = "udp"
            _ensure_udp_fallback_running()
            time.sleep(3)
        finally:
            if ser and ser.is_open:
                ser.close()


def main():
    global global_master
    # Arduino data thread (WebSocket receiver)
    threading.Thread(target=read_arduino_thread, daemon=True).start()
    # Zigbee telemetry thread (primary; falls over to UDP automatically on failure)
    threading.Thread(target=zigbee_telem_thread, daemon=True, name="zigbee-telem").start()
    print(f"Attempting to connect to MAVLink hardware on {COM_PORT}...")
    while True:
        try:
            master = mavutil.mavlink_connection(
                COM_PORT,
                baud=BAUD,
                autoreconnect=True,
                robust_parsing=True
            )
            global_master = master
            break
        except Exception as e:
            print(f"Failed to connect to {COM_PORT}: {e}. Retrying in 5s...")
            time.sleep(5)

    while True:
        print("Waiting for heartbeat...")
        if master.wait_heartbeat(timeout=30):
            print("Heartbeat OK:", master.target_system, master.target_component)
            break
        print("Timeout waiting for heartbeat. Please check hardware connection. Retrying...")

    # Request telemetry rates
    request_message_hz(master, mavutil.mavlink.MAVLINK_MSG_ID_ATTITUDE, 10)
    request_message_hz(master, mavutil.mavlink.MAVLINK_MSG_ID_LOCAL_POSITION_NED, 5)
    request_message_hz(master, mavutil.mavlink.MAVLINK_MSG_ID_SYS_STATUS, 5)
    request_message_hz(master, mavutil.mavlink.MAVLINK_MSG_ID_BATTERY_STATUS, 5)
    # request_message_hz(master, mavutil.mavlink.MAVLINK_MSG_ID_ODOMETRY, 20)
    request_message_hz(master, mavutil.mavlink.MAVLINK_MSG_ID_OPTICAL_FLOW_RAD, 5)
    request_message_hz(master, mavutil.mavlink.MAVLINK_MSG_ID_DISTANCE_SENSOR, 5)
    
    # MAVLINK_MSG_ID_STATUSTEXT (253) doesn't stream via SET_MESSAGE_INTERVAL
    # But we can try explicitly requesting a single one via REQUEST_MESSAGE (512)
    print("Requesting a one-time STATUSTEXT emission...")
    master.mav.command_long_send(
        master.target_system,
        master.target_component,
        mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
        0,
        mavutil.mavlink.MAVLINK_MSG_ID_STATUSTEXT,
        0, 0, 0, 0, 0, 0
    )

    tel = Tel()
    last_print = 0.0

    bad_data_count = 0

    # ── Autonomous landing detection ──────────────────────────────────────────
    # Fires send_base_station_landed() when MAVLink detects: armed→disarmed
    # while altitude is near ground.  ArUco security check is enforced
    # downstream in base_station.py (relay only fires if marker is in zone).
    _auto_land_fired = False   # one-shot per landing event
    _prev_armed      = False   # tracks previous armed state

    while True:
        msg = master.recv_match(blocking=True, timeout=0.1)
        if msg is None:
            continue
        
        mtype = msg.get_type()
        
        if mtype == "BAD_DATA":
            bad_data_count += 1
            if bad_data_count % 100 == 1:
                print(f"Skipped {bad_data_count} Bad data packets")
            continue

        # Save selected messages to JSON
        if mtype in LOG_MESSAGE_TYPES:
            save_message_to_json(msg)
            pass

        # ---- Message Handlers ----
        if mtype == "HEARTBEAT":
            tel.armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
            tel.flight_mode = decode_px4_mode(msg)

        elif mtype == "SYS_STATUS":
            tel.drop_rate_comm = msg.drop_rate_comm
            tel.errors_comm = msg.errors_comm

            if msg.voltage_battery != 65535:
                tel.batt_v = _safe_float(msg.voltage_battery / 1000.0)
            if msg.current_battery != -1:
                tel.batt_a = _safe_float(msg.current_battery / 100.0)
            if msg.battery_remaining != -1:
                tel.batt_pct = max(0, min(100, int(msg.battery_remaining)))

        elif mtype == "ATTITUDE":
            tel.roll_deg  = _safe_float(math.degrees(msg.roll))
            tel.pitch_deg = _safe_float(math.degrees(msg.pitch))
            raw_yaw       = _safe_float(math.degrees(msg.yaw))
            tel.yaw_deg   = (raw_yaw + 360) % 360
            save_message_to_json(msg)

        elif mtype == "LOCAL_POSITION_NED":
            tel.x  = _safe_float(msg.x)
            tel.y  = _safe_float(msg.y)
            tel.z  = _safe_float(msg.z)
            tel.vx = _safe_float(msg.vx)
            tel.vy = _safe_float(msg.vy)
            tel.vz = _safe_float(msg.vz)

        elif mtype == "ODOMETRY":
            tel.ox = _safe_float(msg.x)
            tel.oy = _safe_float(msg.y)
            tel.oz = _safe_float(msg.z)

        elif mtype == "OPTICAL_FLOW_RAD":
            tel.flow_q     = int(msg.quality)
            tel.flow_int_x = _safe_float(msg.integrated_x)
            tel.flow_int_y = _safe_float(msg.integrated_y)
            tel.flow_dt_ms = _safe_float(msg.integration_time_us) / 1000.0

        elif mtype == "DISTANCE_SENSOR":
            tel.dist_m = _safe_float(msg.current_distance / 100.0)
            
        elif mtype == "STATUSTEXT":
            print(f"RAW STATUSTEXT RECEIVED: {msg}")
            try:
                # The text attribute can come in as a string or byte array
                raw_text = getattr(msg, 'text', '')
                if isinstance(raw_text, (bytes, bytearray)):
                    raw_text = raw_text.decode('utf-8', errors='ignore')
                elif isinstance(raw_text, list):
                    raw_text = "".join([chr(c) for c in raw_text if c != 0])
                
                # Also strip any trailing null bytes
                tel.last_msg = str(raw_text).strip('\x00').strip()
                tel.last_msg_time = time.time()
                print(f"PARSED TEXT: {tel.last_msg}")
            except Exception as e:
                print(f"Error processing STATUSTEXT: {e}") 
        elif mtype == "FLIGHTMODE":
            tel.flight_mode = msg.mode
            save_message_to_json(msg)
            print(msg)



        with lock:
            latest_data.update({
                "mode": tel.flight_mode,
                "armed": tel.armed,

                "battery": {
                    "voltage": tel.batt_v,
                    "current": tel.batt_a,
                    "percent": tel.batt_pct if tel.batt_pct is not None else 0
                },

                "attitude": {
                    "roll": tel.roll_deg if tel.roll_deg is not None else 0.0,
                    "pitch": tel.pitch_deg if tel.pitch_deg is not None else 0.0,
                    "yaw": tel.yaw_deg if tel.yaw_deg is not None else 0.0
                },

                "position": {
                    "x": tel.x if tel.x is not None else 0.0,
                    "y": tel.y if tel.y is not None else 0.0,
                    "z": tel.z if tel.z is not None else 0.0
                },

                "velocity": {
                    "vx": tel.vx if tel.vx is not None else 0.0,
                    "vy": tel.vy if tel.vy is not None else 0.0,
                    "vz": tel.vz if tel.vz is not None else 0.0
                },

                "distance": tel.dist_m if tel.dist_m is not None else 0.0,
                "flow_q": tel.flow_q if tel.flow_q is not None else 0,
                "statusText": tel.last_msg
            })

        # ── Autonomous landing detection ──────────────────────────────────────
        # Condition: drone was armed, is now disarmed, AND altitude is near
        # ground (distance sensor < 0.35 m OR NED-Z within 0.20 m of origin).
        # Security: base_station.py will only fire the relay once ArUco marker
        # is confirmed inside the zone polygon — this check is preserved.
        just_disarmed = _prev_armed and not tel.armed
        near_ground   = (
            (tel.dist_m is not None and tel.dist_m < 0.35) or
            (tel.z is not None and abs(tel.z) < 0.20)
        )

        if just_disarmed and near_ground and not _auto_land_fired:
            _auto_land_fired = True
            print("[AUTO-LAND] Landing detected (disarmed + near ground) "
                  "-> arming relay (ArUco check enforced at base station)")
            threading.Thread(
                target=send_base_station_landed,
                daemon=True,
                name="auto-land-relay"
            ).start()

        # Reset one-shot flag when drone re-arms for the next flight
        if tel.armed and not _prev_armed:
            _auto_land_fired = False
            print("[AUTO-LAND] Drone re-armed — landing one-shot reset")

        _prev_armed = tel.armed

        with lock:
            # ---- Dashboard Print @5Hz ----
            now = time.time()
            if now - last_print > 0.2:
                last_print = now
if __name__ == "__main__":
    main()