import { useState, useEffect } from "react";
import { TelemetryPanel } from "./t_panel";
import { ArtificialHorizon } from "./ah";
import { Compass } from "./Compass";
import { BatteryIndicator } from "./BatteryIndicator";
import { VelocityVectors } from "./VelocityVectors";
import { CameraFeed } from "./CameraFeed";
import { MissionDataPanel } from "./MissionDataPanel";
import { DroneControlMiniPanel } from "./DroneControlMiniPanel";
import { FailsafePanel } from "./FailsafePanel";
import titansLogo from "./Titans_logo_white.png";
import { getBaseUrl } from "../config";

interface TelemetryData {
  position: { x: number; y: number; z: number };
  velocity: { vx: number; vy: number; vz: number };
  attitude: { pitch: number; roll: number; yaw: number };
  battery: { percent: number; voltage: number; current: number } | number;
  temperature: number;
  linkQuality: number;
  storage: number;
  cpuLoad: number;
  mode?: string;
  armed?: boolean;
  connected?: boolean;
  rc_available?: boolean;
  arduino: { relay: string; currentA0: number; currentA1: number; voltageS1: number; voltageS2: number; raw?: string };
}

export default function CockpitDashboard({ data, socket: _socket }: { data: TelemetryData; socket?: unknown }) {
  const [dronePhase, setDronePhase] = useState("STANDBY");

  // Poll /rpi/phase every 500ms via the GCS server proxy
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/rpi/phase`);
        if (res.ok && mounted) {
          const json = await res.json();
          setDronePhase(json.phase ?? "STANDBY");
        }
      } catch {
        // RPi offline — keep last known phase
      }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <>
      <div className="camera-feed-stack">
        <div className="camera-top-row">
          <MissionDataPanel compact />
          <DroneControlMiniPanel />
        </div>
        <CameraFeed />
      </div>

      {/* Logos & Overlays in remaining 1/3 viewport space */}
      <div style={{
          position: 'fixed',
          right: 0,
          top: '2%',
          width: '29%',
          height: '30%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 50
      }}>
        <img src={titansLogo} alt="Titans Logo" style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain', opacity: 0.95 }} />
      </div>

      <div className="cockpit-container">
        <div className="cockpit-grid">
          <div className="attitude-container">
            <ArtificialHorizon
              pitch={data.attitude.pitch}
              roll={data.attitude.roll}
              yaw={data.attitude.yaw}
              z={data.position.z}
              dronePhase={dronePhase}
            >
              {/* Embedded Widgets for Four-Corner Layout */}
              <FailsafePanel />

              <div className="widget-corner top-left">
                <Compass heading={data.attitude.yaw} />
              </div>

              <div className="widget-corner top-right">
                <BatteryIndicator
                  batteryPercent={typeof data.battery === 'number' ? data.battery : (data.battery as { percent?: number })?.percent}
                  batteryV={(data.battery as { voltage?: number })?.voltage}
                  batteryA={(data.battery as { current?: number })?.current}
                />
              </div>

              <div className="widget-corner bottom-left">
                <VelocityVectors vz={data.velocity.vz} position="left" />
              </div>

              <div className="widget-corner bottom-right">
                <VelocityVectors vx={data.velocity.vx} vy={data.velocity.vy} position="right" />
              </div>
            </ArtificialHorizon>
          </div>
        </div>

        {/* Bottom Telemetry Strip */}
        <div className="panel" style={{ margin: '0 8px 8px', flex: '0 0 auto' }}>
          <TelemetryPanel data={data} />
        </div>
      </div>
    </>
  );
}

