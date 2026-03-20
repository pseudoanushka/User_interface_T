"""
drone_frame_receiver.py  —  Client-side frame receiver + saver
===============================================================
Connects to the drone's WebSocket, receives JPEG frames, and
saves them to a local folder whenever the server signals `record: true`.

Usage:
    python drone_frame_receiver.py --host 192.168.1.10 --port 8000 --out ./drone_frames

    # Or start recording immediately without waiting for /start_recording:
    python drone_frame_receiver.py --host 192.168.1.10 --record-always

Install deps (once):
    pip install websockets opencv-python
"""

import argparse
import asyncio
import json
import os
import struct
import time
from pathlib import Path

import cv2
import numpy as np

try:
    import websockets
except ImportError:
    raise SystemExit("Missing dependency — run:  pip install websockets")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_HOST    = "192.168.0.97"   # ← change to your Raspberry Pi IP
DEFAULT_PORT    = 8000
DEFAULT_OUT_DIR = "./drone_frames"
RECORD_FPS      = 5                # max frames saved per second (client-side throttle)
SHOW_PREVIEW    = True             # set False to skip the cv2 window (headless)

# ---------------------------------------------------------------------------
# Frame saver
# ---------------------------------------------------------------------------

class FrameSaver:
    """Saves JPEG frames to <out_dir>/<session>/frame_XXXXXX.jpg"""

    def __init__(self, out_dir: str):
        self.base = Path(out_dir)
        self.session_dir: Path | None = None
        self.saved = 0
        self._start_session()

    def _start_session(self):
        ts = time.strftime("%Y%m%d_%H%M%S")
        self.session_dir = self.base / f"session_{ts}"
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.saved = 0
        print(f"[SAVER] Saving frames to: {self.session_dir}")

    def save(self, frame_id: int, jpeg_bytes: bytes):
        filename = self.session_dir / f"frame_{frame_id:06d}.jpg"
        filename.write_bytes(jpeg_bytes)
        self.saved += 1

    def summary(self):
        print(f"[SAVER] Session ended — {self.saved} frames saved to {self.session_dir}")

# ---------------------------------------------------------------------------
# WebSocket receiver
# ---------------------------------------------------------------------------

async def receive_frames(host: str, port: int, out_dir: str, record_always: bool):
    uri = f"ws://{host}:{port}/ws/video"
    saver = FrameSaver(out_dir)

    # Client-side rate limiter for saving
    save_interval   = 1.0 / RECORD_FPS
    last_save_time  = 0.0

    print(f"[CLIENT] Connecting to {uri} …")

    async with websockets.connect(uri, max_size=10 * 1024 * 1024) as ws:
        print("[CLIENT] Connected. Receiving frames …")
        print("         Press Ctrl-C to stop.")

        try:
            while True:
                raw = await ws.recv()

                # ── Unpack framing ──────────────────────────────────────────
                # [4 bytes LE]  header_len
                # [N bytes]     JSON header
                # [M bytes]     JPEG payload
                if len(raw) < 4:
                    continue

                header_len = struct.unpack_from("<I", raw, 0)[0]   # little-endian uint32
                header_end = 4 + header_len

                if len(raw) < header_end:
                    continue

                try:
                    header = json.loads(raw[4:header_end])
                except json.JSONDecodeError:
                    continue

                jpeg_bytes = raw[header_end:]

                frame_id    = header.get("frame_id", 0)
                timestamp   = header.get("timestamp", 0.0)
                should_save = header.get("record", False) or record_always

                # ── Optional live preview ───────────────────────────────────
                if SHOW_PREVIEW:
                    arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
                    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if img is not None:
                        status = "REC" if should_save else "LIVE"
                        label  = f"[{status}] frame={frame_id}  ts={timestamp:.2f}"
                        cv2.putText(img, label, (10, 24),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                        cv2.imshow("Drone Feed", img)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            print("[CLIENT] 'q' pressed — stopping.")
                            break

                # ── Save frame (client-side FPS throttle) ──────────────────
                if should_save:
                    now = time.monotonic()
                    if now - last_save_time >= save_interval:
                        saver.save(frame_id, jpeg_bytes)
                        last_save_time = now
                        print(f"[SAVER] Saved frame {frame_id:06d}  "
                              f"({saver.saved} total)")

        except websockets.ConnectionClosed:
            print("[CLIENT] Connection closed by server.")
        except KeyboardInterrupt:
            print("[CLIENT] Interrupted by user.")
        finally:
            cv2.destroyAllWindows()
            saver.summary()

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Drone frame receiver & saver")
    parser.add_argument("--host",          default=DEFAULT_HOST,    help="Raspberry Pi IP")
    parser.add_argument("--port",          default=DEFAULT_PORT,    type=int)
    parser.add_argument("--out",           default=DEFAULT_OUT_DIR, help="Output directory")
    parser.add_argument("--record-always", action="store_true",
                        help="Save every frame regardless of server record flag")
    args = parser.parse_args()

    asyncio.run(receive_frames(
        host=args.host,
        port=args.port,
        out_dir=args.out,
        record_always=args.record_always,
    ))

if __name__ == "__main__":
    main()
