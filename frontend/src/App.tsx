import React, { useState, useEffect } from "react";
import CockpitDashboard from "./components/dashboard";
import { io } from "socket.io-client";
import { getWsUrl, getBaseUrl } from "./config";
import { initBaseStationWS } from "./useBaseStationWS";

// Start base station WebSocket singleton (handles arduino_data + camera feed)
initBaseStationWS();

// Global WebSocket connection for sending commands (like takeoff)
const socket = io(getWsUrl());

const defaultData = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { vx: 0, vy: 0, vz: 0 },
  attitude: { pitch: 0, roll: 0, yaw: 0 },
  battery: { percent: 0, voltage: 0, current: 0 },
  temperature: 0,
  linkQuality: 0,
  storage: 0,
  cpuLoad: 0,
  mode: "UNKNOWN",
  armed: false,
  connected: false,
  rc_available: true,
  arduino: { relay: "UNKNOWN", currentA0: 0, currentA1: 0, voltageS1: 0, voltageS2: 0, raw: "" },
};

export default function App() {
  const [data, setData] = useState<typeof defaultData>(defaultData);
  const hasSentLandedRef = React.useRef(false);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const fetchData = async () => {
      try {
        // ── Fetch both endpoints in parallel ─────────────────────────────────
        const [paramsRes, telRes] = await Promise.all([
          fetch(`${getBaseUrl()}/params/all`),
          fetch(`${getBaseUrl()}/telemetry`),
        ]);

        if (!isMounted) return;

        const params = paramsRes.ok ? await paramsRes.json() : {};
        const tel    = telRes.ok    ? await telRes.json()    : {};

        // ── Raw JSON param files (ground truth) ───────────────────────────────
        const batt    = params.BATTERY_STATUS     ?? {};
        const att     = params.ATTITUDE           ?? {};
        const pos     = params.LOCAL_POSITION_NED ?? {};
        const hb      = params.HEARTBEAT          ?? {};
        const ard_raw = params.BASE_STATION_DATA  ?? {};

        // ── RPi source (Pixhawk → RPi → GCS) ─────────────────────────────────
        const rpi = tel.RPI && Object.keys(tel.RPI).length > 0 ? tel.RPI : null;

        // ── Battery from BATTERY_STATUS.json ─────────────────────────────────
        // voltages[] in mV; pick first valid cell (< 65535)
        const rawVoltages: number[] = batt.voltages ?? [];
        const battMv = rawVoltages.find((v: number) => v > 0 && v < 65535) ?? 0;
        const battV  = battMv / 1000.0;

        // 4S LiPo curve: 12.0 V = 0 %, 16.8 V = 100 %
        const BATT_MIN_V = 12.0;
        const BATT_MAX_V = 16.8;
        const voltToPct = (v: number) =>
          Math.min(100, Math.max(0, Math.round(((v - BATT_MIN_V) / (BATT_MAX_V - BATT_MIN_V)) * 100)));

        const battA = (batt.current_battery != null && batt.current_battery !== -1)
          ? batt.current_battery / 100.0
          : 0;

        let battery: { percent: number; voltage: number; current: number };
        if (rpi && rpi.battery != null) {
          // RPi may send voltage directly; compute % from it
          const rBatt  = rpi.battery;
          const rVolt  = typeof rBatt === "object" ? (rBatt?.voltage ?? battV) : battV;
          const rCurr  = typeof rBatt === "object" ? (rBatt?.current ?? battA) : battA;
          battery = { percent: voltToPct(rVolt), voltage: rVolt, current: rCurr };
        } else {
          battery = { percent: voltToPct(battV), voltage: battV, current: battA };
        }

        // ── Attitude from ATTITUDE.json (radians) ─────────────────────────────
        const toDeg = (r: number) => r * (180 / Math.PI);
        const rollDeg  = toDeg(att.roll  ?? 0);
        const pitchDeg = toDeg(att.pitch ?? 0);
        // Yaw: normalise to 0–360; prefer RPi when available
        const yawRad   = att.yaw ?? 0;
        const yawDeg   = rpi?.yaw ?? (((toDeg(yawRad)) % 360 + 360) % 360);

        // ── Position / velocity from LOCAL_POSITION_NED.json ─────────────────
        const posX = rpi ? (rpi.n ?? pos.x ?? 0) : (pos.x ?? 0);
        const posY = rpi ? (rpi.e ?? pos.y ?? 0) : (pos.y ?? 0);
        const posZ = rpi ? (rpi.d ?? pos.z ?? 0) : (pos.z ?? 0);

        // ── Armed / mode from HEARTBEAT.json ─────────────────────────────────
        const baseMode   = hb.base_mode ?? 0;
        const isArmed    = rpi ? (rpi.armed ?? !!(baseMode & 0x80)) : !!(baseMode & 0x80);
        const flightMode = tel.ZIGBEE?.mode ?? tel.ZIGBEE?.flight_mode ?? "UNKNOWN";

        // ── Arduino / Base Station ────────────────────────────────────────────
        const arduino = {
          relay:     ard_raw.relay     ?? "UNKNOWN",
          currentA0: ard_raw.currentA0 ?? 0,
          currentA1: ard_raw.currentA1 ?? 0,
          voltageS1: ard_raw.voltageS1 ?? 0,
          voltageS2: ard_raw.voltageS2 ?? 0,
          raw:       ard_raw.raw       ?? "",
        };

        // ── Landed → trigger base station charging relay ──────────────────────
        if (rpi?.landed && !hasSentLandedRef.current) {
          hasSentLandedRef.current = true;
          fetch(`${getBaseUrl()}/bs/landed`, { method: "POST" })
            .then(() => console.log("[App] Drone landed! POST /bs/landed sent."))
            .catch((e) => console.error("[App] /bs/landed failed:", e));
        } else if (rpi && !rpi.landed) {
          hasSentLandedRef.current = false;
        }

        setData({
          ...defaultData,
          position: { x: posX, y: posY, z: posZ },
          velocity: {
            vx: pos.vx ?? 0,
            vy: pos.vy ?? 0,
            vz: pos.vz ?? 0,
          },
          attitude: { pitch: pitchDeg, roll: rollDeg, yaw: yawDeg },
          battery,
          armed:        isArmed,
          connected:    rpi ? (rpi.connected    ?? false) : false,
          rc_available: rpi ? (rpi.rc_available  ?? true)  : true,
          temperature:  tel.ZIGBEE?.temperature  ?? 45,
          linkQuality:  tel.ZIGBEE?.linkQuality   ?? 95,
          storage:      tel.ZIGBEE?.storage       ?? 50,
          cpuLoad:      tel.ZIGBEE?.cpuLoad       ?? 20,
          mode:         flightMode,
          arduino,
        });
      } catch (error) {
        console.error("Failed to fetch telemetry:", error);
      }

      if (isMounted) {
        timeoutId = setTimeout(fetchData, 200);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  return <CockpitDashboard data={data} socket={socket} />;
}