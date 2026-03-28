import React, { useState, useEffect } from "react";
import CockpitDashboard from "./components/dashboard";
import { io } from "socket.io-client";
import { getWsUrl, getBaseUrl } from "./config";
import { initBaseStationWS, sendBaseStationCommand } from "./useBaseStationWS";

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
};

export default function App() {
  const [data, setData] = useState<typeof defaultData>(defaultData);
  const hasSentLandedRef = React.useRef(false);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const fetchData = async () => {
      try {
        const response = await fetch(`${getBaseUrl()}/telemetry`);
        if (response.ok && isMounted) {
          const json = await response.json();

          // ── ZIGBEE / MAVLink source (Pixhawk → GCS directly) ────────────────
          const zigbee = json.ZIGBEE ?? json;

          // ── RPi source (Pixhawk → RPi → GCS) ────────────────────────────────
          // Keys from RPi telemetry dict:
          //   n, e, d        → NED position in metres
          //   yaw            → heading in degrees
          //   armed          → bool
          //   battery        → remaining % (0–100 float)
          //   connected      → bool (FC link)
          //   rc_available   → bool
          const rpi = json.RPI && Object.keys(json.RPI).length > 0 ? json.RPI : null;

          // NED position: prefer RPi values (processed by MAVSDK) when available
          const posX = rpi ? (rpi.n ?? zigbee.position?.x ?? 0) : (zigbee.position?.x ?? 0);
          const posY = rpi ? (rpi.e ?? zigbee.position?.y ?? 0) : (zigbee.position?.y ?? 0);
          const posZ = rpi ? (rpi.d ?? zigbee.position?.z ?? 0) : (zigbee.position?.z ?? 0);

          // Yaw: prefer RPi
          const yawDeg = rpi ? (rpi.yaw ?? zigbee.attitude?.yaw ?? 0) : (zigbee.attitude?.yaw ?? 0);

          // Trigger "landed" command to Base Station if we just landed
          if (rpi?.landed && !hasSentLandedRef.current) {
            hasSentLandedRef.current = true;
            sendBaseStationCommand("landed");
            console.log("[App] Drone landed! Sent 'landed' to base station WS.");
          } else if (rpi && !rpi.landed) {
            // Reset if drone takes off again
            hasSentLandedRef.current = false;
          }

          // Armed: prefer RPi (it controls the FC)
          const isArmed = rpi ? (rpi.armed ?? zigbee.armed ?? false) : (zigbee.armed ?? false);

          // Battery: RPi gives %, ZIGBEE may give object or number
          let battery: { percent: number; voltage: number; current: number };
          if (rpi && rpi.battery != null) {
            const pct = typeof rpi.battery === "number" ? rpi.battery : rpi.battery;
            const zigBatt = zigbee.battery;
            battery = {
              percent: pct,
              voltage: typeof zigBatt === "object" ? (zigBatt?.voltage ?? 0) : 0,
              current: typeof zigBatt === "object" ? (zigBatt?.current ?? 0) : 0,
            };
          } else {
            const b = zigbee.battery;
            battery = typeof b === "object"
              ? { percent: b?.percent ?? 0, voltage: b?.voltage ?? 0, current: b?.current ?? 0 }
              : { percent: b ?? 0, voltage: 0, current: 0 };
          }

          setData({
            ...defaultData,
            // Velocity always from ZIGBEE/MAVLink (more granular, direct link)
            velocity: {
              vx: zigbee.velocity?.vx ?? 0,
              vy: zigbee.velocity?.vy ?? 0,
              vz: zigbee.velocity?.vz ?? 0,
            },
            // Attitude: merge yaw from RPi, pitch/roll from ZIGBEE
            attitude: {
              pitch: zigbee.attitude?.pitch ?? 0,
              roll:  zigbee.attitude?.roll  ?? 0,
              yaw:   yawDeg,
            },
            position: { x: posX, y: posY, z: posZ },
            battery,
            armed:        isArmed,
            connected:    rpi ? (rpi.connected    ?? false) : false,
            rc_available: rpi ? (rpi.rc_available  ?? true)  : true,
            temperature:  zigbee.temperature ?? 45,
            linkQuality:  zigbee.linkQuality  ?? 95,
            storage:      zigbee.storage      ?? 50,
            cpuLoad:      zigbee.cpuLoad      ?? 20,
            mode:         zigbee.mode         ?? "UNKNOWN",
          });
        }
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