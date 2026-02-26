import { TelemetryPanel } from "./t_panel";
import { ArtificialHorizon } from "./ah";

interface TelemetryData {
  position: { x: number; y: number; z: number };
  velocity: { vx: number; vy: number; vz: number };
  attitude: { pitch: number; roll: number; yaw: number };
  battery: number;
  temperature: number;
  linkQuality: number;
  storage: number;
  cpuLoad: number;
  mode?: string;
  armed?: boolean;
}

export default function CockpitDashboard({ data }: { data: TelemetryData }) {
  return (
    <div style={{ width: '640px', height: '550px', overflow: 'hidden', backgroundColor: '#020617', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Intelligently scaled wrapper: retains natural component styling while avoiding scrollbars */}
      <div style={{
        width: '800px',
        height: '1000px',
        display: 'flex',
        flexDirection: 'column',
        gap: '26px',
        padding: '16px',
        transform: 'scale(0.35)', /* 1000px height * 0.35 = 350px (fits nicely into 360px) */
        transformOrigin: 'center center'
      }}>

        {/* TOP: PRIMARY FLIGHT DISPLAY (Artificial Horizon) */}
        <div>
          <ArtificialHorizon
            pitch={data.attitude.pitch}
            roll={data.attitude.roll}
            yaw={data.attitude.yaw}
            vx={data.velocity.vx}
            vy={data.velocity.vy}
            vz={data.velocity.vz}
            batteryPercent={typeof data.battery === 'number' ? data.battery : (data.battery as any)?.percent}
            batteryV={(data.battery as any)?.voltage}
            batteryA={(data.battery as any)?.current}
            mode={data.mode}
            armed={data.armed}
          />
        </div>

        {/* BOTTOM: TELEMETRY PANEL */}
        <div className="panel">
          <TelemetryPanel data={data} />
        </div>

      </div>
    </div>
  );
}