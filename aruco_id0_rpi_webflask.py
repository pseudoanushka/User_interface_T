#getting the feed on the flask web server id is 0

import cv2
import cv2.aruco as aruco
import numpy as np
try:
    from picamera2 import Picamera2
    HAS_PICAMERA = True
except ImportError:
    HAS_PICAMERA = False
    print("Picamera2 not found. Falling back to standard OpenCV webcam.")
from flask import Flask, Response, render_template_string
import threading

# --- Flask App ---
app = Flask(__name__)

# --- Shared frame buffer ---
output_frame = None
frame_lock = threading.Lock()

# 1. Camera Calibration Data
camera_matrix = np.array([[800, 0, 320], [0, 800, 240], [0, 0, 1]], dtype=float)
dist_coeffs = np.zeros((5, 1))

# 2. Physical Marker Size (meters)
marker_length = 0.05

TARGET_ID = 1

# --- HTML Page served at "/" ---
HTML_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>ArUco Tracker</title>
    <style>
        body {
            background: #111;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: monospace;
            color: #0f0;
        }
        h1 { margin-bottom: 16px; font-size: 1.4rem; letter-spacing: 2px; }
        img {
            border: 2px solid #0f0;
            border-radius: 6px;
            max-width: 95vw;
        }
        p { margin-top: 12px; font-size: 0.85rem; color: #888; }
    </style>
</head>
<body>
    <h1>📷 ArUco Marker Tracker — ID {{ target_id }}</h1>
    <img src="/video_feed" />
    <p>Live stream from Raspberry Pi Camera</p>
</body>
</html>
"""

def generate_frames():
    global output_frame
    while True:
        with frame_lock:
            if output_frame is None:
                continue
            ret, buffer = cv2.imencode('.jpg', output_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ret:
                continue
            frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    return render_template_string(HTML_PAGE, target_id=TARGET_ID)

@app.route('/video_feed')
def video_feed():
    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

# --- Camera + ArUco Processing Thread ---
def camera_thread():
    global output_frame

    if HAS_PICAMERA:
        picam2 = Picamera2()
        config = picam2.create_preview_configuration(
            main={"format": "RGB888", "size": (640, 480)}
        )
        picam2.configure(config)
        picam2.start()
    else:
        # Standard webcam for Windows running locally
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    aruco_dict = aruco.getPredefinedDictionary(aruco.DICT_4X4_50)
    parameters = aruco.DetectorParameters()
    detector = aruco.ArucoDetector(aruco_dict, parameters)

    obj_points = np.array([
        [-marker_length/2,  marker_length/2, 0],
        [ marker_length/2,  marker_length/2, 0],
        [ marker_length/2, -marker_length/2, 0],
        [-marker_length/2, -marker_length/2, 0]
    ], dtype=np.float32)

    try:
        while True:
            if HAS_PICAMERA:
                frame_rgb = picam2.capture_array()
                frame = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            else:
                ret, frame = cap.read()
                if not ret:
                    print("Could not read frame from webcam.")
                    continue

            h, w = frame.shape[:2]
            center_f_x, center_f_y = w // 2, h // 2

            cv2.drawMarker(frame, (center_f_x, center_f_y), (255, 0, 0), cv2.MARKER_CROSS, 20, 2)

            corners, ids, rejected = detector.detectMarkers(frame)

            if ids is not None:
                target_indices = [i for i, mid in enumerate(ids.flatten()) if mid == TARGET_ID]

                if target_indices:
                    target_corners = [corners[i] for i in target_indices]
                    target_ids = ids[target_indices]
                    aruco.drawDetectedMarkers(frame, target_corners, target_ids)

                    for i in target_indices:
                        _, rvec, tvec = cv2.solvePnP(obj_points, corners[i], camera_matrix, dist_coeffs)
                        rmat, _ = cv2.Rodrigues(rvec)

                        tilt_rad = np.arccos(np.clip(rmat[2, 2], -1.0, 1.0))
                        tilt_deg = 180 - np.degrees(tilt_rad)
                        yaw_deg = np.degrees(np.arctan2(rmat[1, 0], rmat[0, 0]))

                        marker_corners = corners[i][0]
                        m_center_x = int(np.mean(marker_corners[:, 0]))
                        m_center_y = int(np.mean(marker_corners[:, 1]))

                        dev_x = m_center_x - center_f_x
                        dev_y = center_f_y - m_center_y

                        cv2.line(frame, (center_f_x, center_f_y), (m_center_x, m_center_y), (0, 255, 255), 2)
                        cv2.circle(frame, (m_center_x, m_center_y), 5, (0, 0, 255), -1)

                        distance = np.linalg.norm(tvec)
                        dist_text  = f"Dist: {distance:.2f}m"
                        angle_text = f"Tilt: {tilt_deg:.1f}deg  Yaw: {yaw_deg:.1f}deg"
                        dev_text   = f"X: {dev_x}  Y: {dev_y}"

                        cv2.putText(frame, dist_text, (m_center_x + 20, m_center_y),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                        cv2.putText(frame, angle_text, (w - 350, h - 20),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                        cv2.rectangle(frame, (0, h - 40), (250, h), (0, 0, 0), -1)
                        cv2.putText(frame, dev_text, (10, h - 15),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                        cv2.drawFrameAxes(frame, camera_matrix, dist_coeffs, rvec, tvec, 0.03)
                else:
                    cv2.putText(frame, f"Searching for ID {TARGET_ID}...", (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 100, 255), 2)
            else:
                cv2.putText(frame, f"Searching for ID {TARGET_ID}...", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 100, 255), 2)

            # Update shared frame
            with frame_lock:
                output_frame = frame.copy()

    finally:
        if HAS_PICAMERA:
            picam2.stop()
        else:
            cap.release()

# --- Entry Point ---
if __name__ == '__main__':
    # Start camera processing in background thread
    t = threading.Thread(target=camera_thread, daemon=True)
    t.start()

    # Start Flask on all interfaces so it's accessible via RPi's IP
    # Access via: http://<your-rpi-ip>:5000
    app.run(host='0.0.0.0', port=5000, threaded=True)  

    