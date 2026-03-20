# Walkthrough - Fixes for `numpy` and IP Configuration

I have resolved the issues regarding the missing `numpy` dependency and the incorrect IP configuration that was preventing the camera feed from loading.

## Summary of Changes

### 1. Fixed Missing Dependencies
The `numpy` import error was due to missing packages in the virtual environment (`venv`). I have installed the following:
- `numpy`
- `opencv-python`
- `websockets`

I verified the fix by running the [reciever.py](file:///c:/Users/DELL/Downloads/UserInterface_Titans_Video_Submission/reciever.py) script's help command from the `venv`:
```powershell
.\venv\Scripts\python.exe reciever.py --help
```
The script now runs successfully without any import errors.

### 2. Updated IP Configuration
I have updated the IP addresses to `192.168.0.97` in both the frontend and backend to ensure correct communication with the Raspberry Pi/Base Station.

- **Frontend**: Updated `RPI_IP` and `BASE_STATION_IP` in [config.ts](file:///c:/Users/DELL/Downloads/UserInterface_Titans_Video_Submission/frontend/src/config.ts).
- **Backend**: Updated `BS_WS_URI` in [listen.py](file:///c:/Users/DELL/Downloads/UserInterface_Titans_Video_Submission/listen.py) to `ws://192.168.0.97:8765`.

## Next Steps
- Restart your backend server (`npm run dev` or `python server.py`) to apply the changes.
- Verify that the camera feed is now visible in the Ground Control Station UI.
