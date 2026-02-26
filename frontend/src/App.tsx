import { useState, useEffect } from "react";
import CockpitDashboard from "./components/dashboard";

const defaultData = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { vx: 0, vy: 0, vz: 0 },
  attitude: { pitch: 0, roll: 0, yaw: 0 },
  battery: 0,
  temperature: 0, // Using default if not provided
  linkQuality: 0, // Using default
  storage: 0, // Default
  cpuLoad: 0, // Default
  mode: "UNKNOWN",
  armed: false
};

export default function App() {
  const [data, setData] = useState<any>(defaultData);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("http://localhost:8000/telemetry");
        if (response.ok) {
          const json = await response.json();
          // Merge incoming data with our required defaults
          setData({
            ...defaultData,
            ...json,
            // Ensure battery object is unpacked correctly if it comes as nested
            battery: json.battery?.percent ?? 0,
            temperature: json.temperature ?? 45, // Placeholder dummy values since listen.py doesn't provide these
            linkQuality: json.linkQuality ?? 95,
            storage: json.storage ?? 50,
            cpuLoad: json.cpuLoad ?? 20
          });
        }
      } catch (error) {
        console.error("Failed to fetch telemetry:", error);
      }
    };

    // Polling at 50Hz (20ms) to match backend data rate
    const interval = setInterval(fetchData, 5);
    return () => clearInterval(interval);
  }, []);

  return <CockpitDashboard data={data} />;
}