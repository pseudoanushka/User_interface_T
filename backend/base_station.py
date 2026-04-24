import cv2
import numpy as np
import pupil_apriltags as apriltag
import serial
import serial.tools.list_ports
import time
import threading
import json
import socket
import struct
from flask import Flask, jsonify
from flask_cors import CORS

# ── Config ────────────────────────────────────────────────────────────────────
TARGET_IDS = [0]

ZONE_POINTS = np.array([
    [90,  295],
    [95,  250],
    [360, 265],
    [405, 315],
], dtype=np.float32)

SERIAL_PORT = "COM17"
BAUD_RATE   = 9600

HTTP_PORT = 5000

# ── Client (GCS laptop) destination ──────────────────────────────────────────
UDP_TARGET         = "192.168.0.38"   # ← GCS laptop IP
UDP_VIDEO_PORT     = 5006
UDP_TELEMETRY_PORT = 5007
UDP_CHUNK_SIZE     = 60000

FRAME_WIDTH  = 640
FRAME_HEIGHT = 480
JPEG_QUALITY = 60
FPS_LIMIT    = 12

UDP_ERR_COOLDOWN = 10.0
# ─────────────────────────────────────────────────────────────────────────────

_serial_lock = threading.Lock()
ser = None   # initialised in connect_serial()


def ts() -> str:
    """Short timestamp string for console prints."""
    return time.strftime("%H:%M:%S")


# ─────────────────────────────────────────────────────────────────────────────
# SERIAL  — robust connect / reconnect
# ─────────────────────────────────────────────────────────────────────────────

def connect_serial() -> None:
    """
    Try to open SERIAL_PORT.  Retries every 5 s until successful.
    Sets the global `ser` variable so every other thread sees it.
    """
    global ser
    while True:
        try:
            s = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
            time.sleep(2)
            with _serial_lock:
                ser = s
            print(f"[{ts()}][SERIAL] ✓ Connected on {SERIAL_PORT} @ {BAUD_RATE} baud")
            return
        except serial.SerialException as e:
            print(f"[{ts()}][SERIAL] ✗ {e} — retrying in 5 s …")
            time.sleep(5)


def serial_watchdog() -> None:
    """
    Daemon thread: if the serial port disappears (USB unplug etc.),
    keeps trying to reconnect every 5 s.
    """
    global ser
    while True:
        time.sleep(5)
        with _serial_lock:
            alive = ser is not None and ser.is_open
        if not alive:
            print(f"[{ts()}][SERIAL] Port lost — reconnecting …")
            connect_serial()


def serial_write(data: bytes) -> bool:
    """Thread-safe serial write.  Returns True on success."""
    with _serial_lock:
        if ser and ser.is_open:
            try:
                ser.write(data)
                return True
            except serial.SerialException as e:
                print(f"[{ts()}][SERIAL] Write error: {e}")
    return False


# ── UDP sockets ───────────────────────────────────────────────────────────────
_video_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
_video_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

_telemetry_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

_udp_frame_id    = 0
_udp_last_err_ts = 0.0
_udp_skip_count  = 0

# ── Security-gate state ───────────────────────────────────────────────────────
_gate_lock              = threading.Lock()
landed_command_received = False
triggered               = False

# ── Flask ─────────────────────────────────────────────────────────────────────
flask_app = Flask(__name__)
CORS(flask_app)   # allow GCS laptop to reach this from any origin


# ─────────────────────────────────────────────────────────────────────────────
# UDP helpers
# ─────────────────────────────────────────────────────────────────────────────

def stream_frame(jpeg_bytes: bytes) -> None:
    global _udp_frame_id, _udp_last_err_ts, _udp_skip_count

    fid            = _udp_frame_id & 0xFFFF
    _udp_frame_id += 1

    chunks = [jpeg_bytes[i: i + UDP_CHUNK_SIZE]
               for i in range(0, len(jpeg_bytes), UDP_CHUNK_SIZE)]
    total = min(len(chunks), 255)

    send_ok = True
    for idx, chunk in enumerate(chunks[:total]):
        header = struct.pack(">HBB", fid, idx, total)
        try:
            _video_sock.sendto(header + chunk, (UDP_TARGET, UDP_VIDEO_PORT))
        except OSError:
            send_ok = False
            break

    if not send_ok:
        _udp_skip_count += 1
        now = time.time()
        if now - _udp_last_err_ts >= UDP_ERR_COOLDOWN:
            print(f"[{ts()}][UDP-VIDEO] {UDP_TARGET}:{UDP_VIDEO_PORT} unreachable — "
                  f"{_udp_skip_count} frame(s) dropped.")
            _udp_last_err_ts = now
            _udp_skip_count  = 0


def send_telemetry_udp(payload: dict) -> None:
    try:
        _telemetry_sock.sendto(
            json.dumps(payload).encode(),
            (UDP_TARGET, UDP_TELEMETRY_PORT)
        )
    except OSError as e:
        print(f"[{ts()}][UDP-TELEMETRY] Send error: {e}")


def send_zone_update(state: str, marker_data: dict) -> None:
    with _gate_lock:
        armed = landed_command_received
        trig  = triggered
    send_telemetry_udp({
        "event":     "zone_update",
        "state":     state,
        "marker":    marker_data,
        "armed":     armed,
        "triggered": trig,
        "timestamp": time.time(),
    })


# ─────────────────────────────────────────────────────────────────────────────
# SERIAL READER
# ─────────────────────────────────────────────────────────────────────────────

def read_serial_continuously() -> None:
    while True:
        with _serial_lock:
            port_ready = ser and ser.is_open and ser.in_waiting > 0
        if not port_ready:
            time.sleep(0.01)
            continue
        try:
            with _serial_lock:
                line = ser.readline().decode(errors="ignore").strip()
            if not line:
                continue

            print(f"[{ts()}][Arduino] {line}")

            payload: dict = {"event": "arduino_data", "timestamp": time.time()}
            for part in (p.strip() for p in line.split("|")):
                if part.startswith("Relay:"):
                    payload["relay"]      = part.split(":", 1)[1].strip()
                elif part.startswith("Current A0:"):
                    payload["current_A1"] = float(part.split(":", 1)[1].replace("A", ""))
                elif part.startswith("Current A1:"):
                    payload["current_A2"] = float(part.split(":", 1)[1].replace("A", ""))
                elif part.startswith("Voltage S1:"):
                    payload["voltage_S1"] = float(part.split(":", 1)[1].replace("V", ""))
                elif part.startswith("Voltage S2:"):
                    payload["voltage_S2"] = float(part.split(":", 1)[1].replace("V", ""))

            send_telemetry_udp(payload)

        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# FLASK ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@flask_app.route("/drone-landed", methods=["POST"])
def client_reported_landed():
    global landed_command_received, triggered
    try:
        with _gate_lock:
            landed_command_received = True
            triggered               = False

        # ── PRINT 1: land command received ───────────────────────────────────
        print(f"[{ts()}][HTTP] ✈  LAND COMMAND RECEIVED — relay gate ARMED")
        print(f"[{ts()}][HTTP]    Waiting for AprilTag marker to enter zone …")

        send_telemetry_udp({
            "event":     "relay_armed",
            "message":   "Drone landed signal received.Initiating Charging...",
            "timestamp": time.time(),
        })

        return jsonify({"success": True, "message": "Relay armed."}), 200

    except Exception as e:
        print(f"[{ts()}][HTTP] /drone-landed error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@flask_app.route("/drone-reset", methods=["POST"])
def client_reported_reset():
    global landed_command_received, triggered
    with _gate_lock:
        landed_command_received = False
        triggered               = False
    print(f"[{ts()}][HTTP] ↺  RESET — relay disarmed, ready for next landing")
    send_telemetry_udp({
        "event":     "relay_disarmed",
        "message":   "Reset acknowledged.",
        "timestamp": time.time(),
    })
    return jsonify({"success": True, "message": "Relay disarmed and reset."}), 200


@flask_app.route("/status", methods=["GET"])
def status():
    with _gate_lock:
        armed = landed_command_received
        trig  = triggered
    with _serial_lock:
        serial_ok = ser is not None and ser.is_open
    return jsonify({
        "landed_command_received": armed,
        "triggered":               trig,
        "serial_connected":        serial_ok,
        "udp_target":              UDP_TARGET,
        "udp_video_port":          UDP_VIDEO_PORT,
        "udp_telemetry_port":      UDP_TELEMETRY_PORT,
        "timestamp":               time.time(),
    }), 200


def start_flask() -> None:
    print(f"[{ts()}][HTTP]  REST API → http://0.0.0.0:{HTTP_PORT}")
    print(f"[{ts()}][HTTP]  Endpoints: POST /drone-landed | POST /drone-reset | GET /status")
    flask_app.run(host="0.0.0.0", port=HTTP_PORT, debug=False, use_reloader=False)


# ─────────────────────────────────────────────────────────────────────────────
# DRAW ZONE
# ─────────────────────────────────────────────────────────────────────────────

def draw_zone(frame, pts, filled: bool = False) -> None:
    if filled:
        overlay = frame.copy()
        cv2.fillPoly(overlay, [pts], (0, 255, 0))
        cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, frame)
        cv2.polylines(frame, [pts], isClosed=True, color=(0, 255, 0), thickness=2)
    else:
        for i in range(len(pts)):
            cv2.line(frame, tuple(pts[i]), tuple(pts[(i + 1) % len(pts)]),
                     (0, 255, 255), 2)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    global triggered, landed_command_received

    with _gate_lock:
        landed_command_received = False
        triggered               = False

    # ── Serial: connect then watch ────────────────────────────────────────────
    connect_serial()
    threading.Thread(target=serial_watchdog,         daemon=True).start()

    # ── Background threads ────────────────────────────────────────────────────
    threading.Thread(target=read_serial_continuously, daemon=True).start()
    threading.Thread(target=start_flask,              daemon=True).start()

    # ── AprilTag detector ─────────────────────────────────────────────────────
    detector = apriltag.Detector(
        families="tag36h11",
        nthreads=1,
        quad_decimate=2.0,
        quad_sigma=0.0,
        refine_edges=1,
        decode_sharpening=0.25,
    )

    # ── Camera: open with reconnect loop ─────────────────────────────────────
    def open_camera():
        while True:
            cap = cv2.VideoCapture(0)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
            if cap.isOpened():
                print(f"[{ts()}][CAM] ✓ Camera opened")
                return cap
            cap.release()
            print(f"[{ts()}][CAM] ✗ Camera not found — retrying in 3 s …")
            time.sleep(3)

    cap = open_camera()

    last_state      = None
    last_frame_time = 0.0
    FRAME_INTERVAL  = 1.0 / FPS_LIMIT
    consecutive_fails = 0

    print(f"\n[{ts()}][MAIN] ══════════════════════════════════════════")
    print(f"[{ts()}][MAIN]  Base station running — press q to quit")
    print(f"[{ts()}][MAIN]  Video     → udp://{UDP_TARGET}:{UDP_VIDEO_PORT}")
    print(f"[{ts()}][MAIN]  Telemetry → udp://{UDP_TARGET}:{UDP_TELEMETRY_PORT}")
    print(f"[{ts()}][MAIN] ══════════════════════════════════════════\n")

    while True:
        now = time.time()
        if now - last_frame_time < FRAME_INTERVAL:
            continue
        last_frame_time = now

        ret, frame = cap.read()
        if not ret:
            consecutive_fails += 1
            if consecutive_fails >= 10:
                print(f"[{ts()}][CAM] ✗ Feed lost — reopening camera …")
                cap.release()
                cap = open_camera()
                consecutive_fails = 0
            continue
        consecutive_fails = 0

        pts  = ZONE_POINTS.astype(np.int32)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        detections     = detector.detect(gray)
        marker_in_zone = False
        marker_data: dict = {}

        for detection in detections:
            if detection.tag_id not in TARGET_IDS:
                continue

            mpts = detection.corners.astype(np.int32)
            cx   = int(detection.center[0])
            cy   = int(detection.center[1])
            inside = cv2.pointPolygonTest(pts, (cx, cy), False) >= 0

            if inside:
                marker_in_zone = True
                marker_data    = {"id": detection.tag_id, "cx": cx, "cy": cy}
                cv2.polylines(frame, [mpts], isClosed=True, color=(0, 255, 0), thickness=2)
                cv2.putText(frame, "IN", (cx - 15, cy),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 3)
            else:
                cv2.polylines(frame, [mpts], isClosed=True, color=(0, 0, 255), thickness=2)
                cv2.putText(frame, f"ID:{detection.tag_id}", (cx - 15, cy),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        # ── One-shot relay trigger ────────────────────────────────────────────
        with _gate_lock:
            armed  = landed_command_received
            trig   = triggered

        if marker_in_zone and armed and not trig:
            ok = serial_write(b"on\n")

            # ── PRINT 2: relay fired ──────────────────────────────────────────
            print(f"[{ts()}][RELAY] ⚡ FIRING — marker ID {marker_data.get('id')} confirmed in zone")
            print(f"[{ts()}][RELAY]    ser.write('on') → {'OK' if ok else 'FAILED (serial disconnected)'}")

            with _gate_lock:
                triggered = True

            send_telemetry_udp({
                "event":     "relay_triggered",
                "message":   "Relay ON — marker confirmed in zone after landing signal",
                "marker":    marker_data,
                "timestamp": time.time(),
            })

        # ── Zone-state telemetry (transition only) ────────────────────────────
        state = "IN" if marker_in_zone else "OUT"
        if state != last_state:
            send_zone_update(state, marker_data)
            print(f"[{ts()}][ZONE]  Marker → {state}")
            last_state = state

        draw_zone(frame, pts, filled=marker_in_zone)

        ok, jpeg = cv2.imencode(
            ".jpg", frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
        )
        if ok:
            stream_frame(jpeg.tobytes())

        cv2.imshow("AprilTag Zone Detector", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    # ── Cleanup ───────────────────────────────────────────────────────────────
    cap.release()
    cv2.destroyAllWindows()
    _video_sock.close()
    _telemetry_sock.close()
    with _serial_lock:
        if ser:
            ser.close()


if __name__ == "__main__":
    main()
