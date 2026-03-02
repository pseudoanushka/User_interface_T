import asyncio
import websockets

connected_friends = set()

async def chat_hub(websocket):
    # 1. Add the new connection to our list
    connected_friends.add(websocket)
    print("Someone joined the chat!")
    
    try:
        # 2. Listen for messages and broadcast them
        async for message in websocket:
            for friend in connected_friends:
                if friend != websocket:
                    await friend.send(message)
    finally:
        # 3. Remove them if they disconnect
        connected_friends.remove(websocket)
        print("Someone left the chat.")

async def main():
    # Start the server. "0.0.0.0" means it will accept connections from other computers.
    async with websockets.serve(chat_hub, "0.0.0.0", 8765):
        print("Headquarters is open! Waiting for walkie-talkies...")
        await asyncio.Future()  # Keeps the server running forever

if __name__ == "__main__":
    asyncio.run(main())