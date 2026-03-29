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

  _ws.onmessage = async (ev: MessageEvent) => {
    // ── Binary frame → base station camera JPEG ────────────────────────────
    if (!(ev.data instanceof Blob)) return;
    try {
      if (ev.data.size < 4) return;
      const headerBuffer = await ev.data.slice(0, 4).arrayBuffer();
      const view = new DataView(headerBuffer);
      const headerLen = view.getUint32(0, true);
      // Sanity-check: JSON header should never exceed 4 KB
      if (headerLen > 4096) return;
      const headerEnd = 4 + headerLen;
      if (ev.data.size < headerEnd) return;
      const jpegBlob = ev.data.slice(headerEnd, ev.data.size, 'image/jpeg');
      dispatch("bs:camera_frame", jpegBlob);
    } catch { /* malformed frame — skip silently */ }
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
