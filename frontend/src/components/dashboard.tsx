import { TelemetryPanel } from "./t_panel";
import { ArtificialHorizon } from "./ah";
import { Compass } from "./Compass";
import { BatteryIndicator } from "./BatteryIndicator";
import { VelocityVectors } from "./VelocityVectors";
import { CameraFeed } from "./CameraFeed";
import { ChargingStatusPanel } from "./ChargingStatusPanel";
import { MissionDataPanel } from "./MissionDataPanel";

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
}

export default function CockpitDashboard({ data }: { data: TelemetryData }) {
  return (
    <>
      <CameraFeed />
      <ChargingStatusPanel />
      <MissionDataPanel />
      <div className="cockpit-container">
        <div className="cockpit-grid">
          <div className="attitude-container">
            <ArtificialHorizon
              pitch={data.attitude.pitch}
              roll={data.attitude.roll}
              yaw={data.attitude.yaw}
            >
              {/* Embedded Widgets for Four-Corner Layout */}
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
                <VelocityVectors vz={data.position.z} position="left" />
              </div>

              <div className="widget-corner bottom-right">
                <VelocityVectors vx={data.position.x} vy={data.position.y} position="right" />
              </div>
            </ArtificialHorizon>
          </div>
        </div>

        {/* Bottom Telemetry Strip */}
        <div className="panel" style={{ margin: '0 12px 12px 12px', flex: '0 0 auto' }}>
          <TelemetryPanel data={data} />
        </div>
      </div>
    </>
  );
}