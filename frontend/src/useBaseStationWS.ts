/**
 * useBaseStationWS.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton WebSocket connection to the base station sender machine.
 * The same WS line carries:
 *   • TEXT frames  → JSON events  { event: "arduino_data" | "zone_update", ... }
 *   • BINARY frames → raw JPEG bytes for the base-station camera feed
 *
 * Components subscribe via window CustomEvents:
 *   window.addEventListener("bs:arduino_data", (e: CustomEvent) => { ... e.detail ... })
 *   window.addEventListener("bs:zone_update",  (e: CustomEvent) => { ... e.detail ... })
 *   window.addEventListener("bs:camera_frame", (e: CustomEvent<Blob>) => { ... e.detail ... })
 *
 * Call `initBaseStationWS()` once at app startup (e.g. in main.tsx or App.tsx).
 * Subsequent calls are no-ops (singleton guard).
 */

import { getBaseStationWsUrl } from "./config";

const RECONNECT_DELAY_MS = 3000;

let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _alive = false;

function dispatch(name: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function connect() {
  if (_ws && (_ws.readyState === WebSocket.CONNECTING || _ws.readyState === WebSocket.OPEN)) {
    return; // already alive
  }

  const url = getBaseStationWsUrl();
  console.log(`[BS-WS] Connecting to ${url} …`);
  _ws = new WebSocket(url);
  _ws.binaryType = "blob"; // keep camera frames as Blob

  _ws.onopen = () => {
    console.log("[BS-WS] Connected.");
    _alive = true;
    if (_reconnectTimer !== null) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
  };

  _ws.onmessage = (ev: MessageEvent) => {
    if (typeof ev.data === "string") {
      // ── JSON event ──────────────────────────────────────────────────────
      try {
        const data = JSON.parse(ev.data);
        const event = data?.event as string | undefined;
        if (event === "arduino_data") {
          dispatch("bs:arduino_data", data);
        } else if (event === "zone_update") {
          dispatch("bs:zone_update", data);
        } else {
          console.warn("[BS-WS] Unknown event:", event, data);
        }
      } catch {
        console.warn("[BS-WS] Non-JSON text frame:", ev.data);
      }
    } else {
      // ── Binary frame → camera JPEG ───────────────────────────────────────
      dispatch("bs:camera_frame", ev.data); // ev.data is already a Blob
    }
  };

  _ws.onclose = (ev) => {
    console.warn(`[BS-WS] Connection closed (code ${ev.code}). Retrying in ${RECONNECT_DELAY_MS / 1000}s …`);
    _ws = null;
    scheduleReconnect();
  };

  _ws.onerror = (err) => {
    console.error("[BS-WS] Error:", err);
    _ws?.close();
  };
}

function scheduleReconnect() {
  if (!_alive) return; // don't reconnect if never explicitly started
  if (_reconnectTimer !== null) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

/** Call once to start the singleton connection. */
export function initBaseStationWS() {
  if (_alive) return;
  _alive = true;
  connect();
}

/** Call to permanently stop (e.g. on app unmount — rarely needed). */
export function destroyBaseStationWS() {
  _alive = false;
  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  _ws?.close();
  _ws = null;
}

/** Send a raw text command to the base station server (e.g., "landed") */
export function sendBaseStationCommand(cmd: string) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(cmd);
    console.log(`[BS-WS] Sent command: ${cmd}`);
  } else {
    console.warn(`[BS-WS] Cannot send command '${cmd}' — WebSocket not open`);
  }
}
