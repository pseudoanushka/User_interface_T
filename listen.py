import os
import json
import time
import math
import random
from dataclasses import dataclass
from typing import Optional
from pymavlink import mavutil
from threading import Lock
import datetime

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
PARAMS_DIR = os.path.join("public", "params")

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
def save_message_to_json(msg):
    try:
        file_path = os.path.join(PARAMS_DIR, f"{msg.get_type()}.json")
        with open(file_path, "w") as f:
            # Some MAVLink messages (like STATUSTEXT) contain bytearrays in their dictionary representation.
            # We must convert byte arrays to strings so json.dump doesn't crash!
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

def main():
    global global_master
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
                tel.batt_v = msg.voltage_battery / 1000.0
            if msg.current_battery != -1:
                tel.batt_a = msg.current_battery / 100.0
            if msg.battery_remaining != -1:
                tel.batt_pct = int(msg.battery_remaining)

        elif mtype == "ATTITUDE":
            tel.roll_deg = math.degrees(msg.roll)
            tel.pitch_deg = math.degrees(msg.pitch)
            tel.yaw_deg = (math.degrees(msg.yaw) + 360) % 360
            save_message_to_json(msg)

        elif mtype == "LOCAL_POSITION_NED":
            tel.x, tel.y, tel.z = msg.x, msg.y, msg.z
            tel.vx, tel.vy, tel.vz = msg.vx, msg.vy, msg.vz

        elif mtype == "ODOMETRY":
            tel.ox, tel.oy, tel.oz = msg.x, msg.y, msg.z

        elif mtype == "OPTICAL_FLOW_RAD":
            tel.flow_q = int(msg.quality)
            tel.flow_int_x = float(msg.integrated_x)
            tel.flow_int_y = float(msg.integrated_y)
            tel.flow_dt_ms = float(msg.integration_time_us) / 1000.0

        elif mtype == "DISTANCE_SENSOR":
            tel.dist_m = msg.current_distance / 100.0
            
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
            # ---- Dashboard Print @5Hz ----
            now = time.time()
            if now - last_print > 0.2:
                last_print = now
if __name__ == "__main__":
    main()