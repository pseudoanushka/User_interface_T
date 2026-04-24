import cv2
import numpy as np
import time
import threading
import requests

TARGET_IDS = [0]

ZONE_POINTS = np.array([
    [105, 220],
    [190, 210],
    [435, 290],
    [280, 350]
], dtype=np.float32)

# Instead of serial, we send the command to the dashboard's API
SERVER_URL = "http://localhost:8000/relay"

def draw_zone(frame, pts, filled=False):
    overlay = frame.copy()
    if filled:
        cv2.fillPoly(overlay, [pts], (0, 255, 0))
        cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, frame)
        cv2.polylines(frame, [pts], isClosed=True, color=(0, 255, 0), thickness=2)
    else:
        cv2.line(frame, tuple(pts[0]), tuple(pts[1]), (0, 255, 255), 2)
        cv2.line(frame, tuple(pts[1]), tuple(pts[2]), (0, 255, 255), 2)
        cv2.line(frame, tuple(pts[2]), tuple(pts[3]), (0, 255, 255), 2)
        cv2.line(frame, tuple(pts[3]), tuple(pts[0]), (0, 255, 255), 2)

def main():
    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    aruco_params = cv2.aruco.DetectorParameters()
    detector = cv2.aruco.ArucoDetector(aruco_dict, aruco_params)

    cap = cv2.VideoCapture(1)
    if not cap.isOpened():
        print("Error: Could not open camera.")
        return

    triggered = False  # Send "on" only once

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        pts = ZONE_POINTS.astype(np.int32)
        corners, ids, _ = detector.detectMarkers(frame)

        marker_in_zone = False

        if ids is not None:
            for i, marker_corners in enumerate(corners):
                marker_id = int(ids[i][0])
                if marker_id not in TARGET_IDS:
                    continue

                mpts = marker_corners[0]
                cx = int(np.mean(mpts[:, 0]))
                cy = int(np.mean(mpts[:, 1]))

                inside = cv2.pointPolygonTest(pts, (cx, cy), False) >= 0

                if inside:
                    marker_in_zone = True
                    cv2.polylines(frame, [mpts.astype(np.int32)], isClosed=True, color=(0, 255, 0), thickness=2)
                    cv2.putText(frame, "IN", (cx - 15, cy), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 3)

        # Send "on" only once via HTTP when marker is first detected in zone
        if marker_in_zone and not triggered:
            try:
                rx = requests.post(SERVER_URL, json={"command": "on"}, timeout=2)
                if rx.status_code == 200:
                    print("Sent API request: Turn relay ON")
                else:
                    print(f"API Error: {rx.text}")
            except Exception as e:
                print(f"Failed to connect to server: {e}")
            triggered = True  # Locked forever

        draw_zone(frame, pts, filled=marker_in_zone)

        cv2.imshow("ArUco Zone Detector", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
