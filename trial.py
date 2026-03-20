import asyncio
import websockets
import json
from datetime import datetime

# ── Config ───────────────────────────────────────────────────────
SENDER_IP       = "10.95.167.134"   # ← Replace with sender machine's IP
WS_PORT         = 8765
RECONNECT_DELAY = 3                # seconds before reconnect attempt
# ─────────────────────────────────────────────────────────────────


# ── Event router ─────────────────────────────────────────────────
def handle_event(data: dict):
    event = data.get("event")

    if event == "zone_update":
        handle_zone_update(data)

    elif event == "arduino_data":
        handle_arduino_data(data)

    else:
        print(f"[WS] Unknown event type: {event}")
# ─────────────────────────────────────────────────────────────────


# ── Zone update handler ──────────────────────────────────────────
def handle_zone_update(data: dict):
    state         = data.get("state")
    marker        = data.get("marker", {})
    timestamp     = data.get("timestamp", 0)
    readable_time = datetime.fromtimestamp(timestamp).strftime("%H:%M:%S")

    print("\n" + "=" * 45)
    print(f"  Event     : zone_update")
    print(f"  State     : {state}")
    print(f"  Marker ID : {marker.get('id', 'N/A')}")
    print(f"  Position  : cx={marker.get('cx', 'N/A')}, cy={marker.get('cy', 'N/A')}")
    print(f"  Time      : {readable_time}")
    print("=" * 45)

    if state == "IN":
        on_marker_enter(marker)
    elif state == "OUT":
        on_marker_exit(marker)


def on_marker_enter(marker: dict):
    print(f"[ACTION] Marker {marker.get('id')} ENTERED zone.")
    # ── Add your IN logic here ───────────────
    # e.g. trigger relay, send HTTP request, log to DB, etc.
    # ─────────────────────────────────────────


def on_marker_exit(marker: dict):
    print(f"[ACTION] Marker {marker.get('id')} EXITED zone.")
    # ── Add your OUT logic here ──────────────
    # ─────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────


# ── Arduino data handler ─────────────────────────────────────────
def handle_arduino_data(data: dict):
    timestamp     = data.get("timestamp", 0)
    readable_time = datetime.fromtimestamp(timestamp).strftime("%H:%M:%S")

    relay      = data.get("relay",      "?")
    current_A0 = data.get("current_A0", 0.0)
    current_A1 = data.get("current_A1", 0.0)
    voltage_S1 = data.get("voltage_S1", 0.0)
    voltage_S2 = data.get("voltage_S2", 0.0)

    print(
        f"[{readable_time}] "
        f"Relay: {relay:>3}  |  "
        f"A0: {current_A0:.2f} A  |  "
        f"A1: {current_A1:.2f} A  |  "
        f"S1: {voltage_S1:.2f} V  |  "
        f"S2: {voltage_S2:.2f} V"
    )

    # ── Add your sensor logic here ───────────────────────────────
    if current_A1 > 1.0:
        print("[ALERT] High current detected on A1!")

    if voltage_S1 > 5.0:
        print("[ALERT] High voltage detected on S1!")
    # ─────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────


# ── WebSocket listener with auto-reconnect ───────────────────────
async def listen():
    uri = f"ws://{SENDER_IP}:{WS_PORT}"

    while True:
        try:
            print(f"\n[WS] Connecting to {uri} ...")
            async with websockets.connect(
                uri,
                ping_interval=20,
                ping_timeout=10,
            ) as ws:
                print(f"[WS] Connected successfully.\n")

                async for raw_message in ws:
                    try:
                        data = json.loads(raw_message)
                        handle_event(data)

                    except json.JSONDecodeError:
                        print(f"[WS] Bad message (not JSON): {raw_message}")

                    except Exception as e:
                        print(f"[WS] Error handling message: {e}")

        except (websockets.ConnectionClosed, ConnectionRefusedError, OSError) as e:
            print(f"[WS] Connection lost: {e}")
            print(f"[WS] Retrying in {RECONNECT_DELAY}s ...")
            await asyncio.sleep(RECONNECT_DELAY)

        except KeyboardInterrupt:
            print("\n[WS] Stopped by user.")
            break
# ─────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    try:
        asyncio.run(listen())
    except KeyboardInterrupt:
        print("\n[WS] Exiting.")