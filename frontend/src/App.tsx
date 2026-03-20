import { useState, useEffect } from "react";
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
  temperature: 0, // Using default if not provided
  linkQuality: 0, // Using default
  storage: 0, // Default
  cpuLoad: 0, // Default
  mode: "UNKNOWN",
  armed: false
};

export default function App() {
  const [data, setData] = useState<typeof defaultData>(defaultData);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const fetchData = async () => {
      try {
        const response = await fetch(`${getBaseUrl()}/telemetry`);
        if (response.ok && isMounted) {
          const json = await response.json();
          const zigbee = json.ZIGBEE ?? json; // fallback to json directly if old format
          setData({
            ...defaultData,
            ...zigbee,
            battery: typeof zigbee.battery === 'object' ? zigbee.battery : { percent: zigbee.battery ?? 0, voltage: 0, current: 0 },
            temperature: zigbee.temperature ?? 45,
            linkQuality: zigbee.linkQuality ?? 95,
            storage: zigbee.storage ?? 50,
            cpuLoad: zigbee.cpuLoad ?? 20
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