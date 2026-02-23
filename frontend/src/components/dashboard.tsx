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
    <div className="min-h-screen bg-slate-950 text-white p-4 flex flex-col gap-4">

      {/* HEADER */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-6 py-3 flex justify-between items-center font-mono text-sm">

        <div className="flex gap-6">
          <div>
            <span className="text-slate-400">MODE:</span>{" "}
            <span className="text-cyan-400">{data.mode ?? "POSCTL"}</span>
          </div>

          <div>
            <span className="text-slate-400">ARM:</span>{" "}
            <span className={data.armed ? "text-green-400" : "text-red-400"}>
              {data.armed ? "ARMED" : "DISARMED"}
            </span>
          </div>
        </div>

        <div className="text-slate-500">ASCEND FLIGHT CONSOLE</div>
      </div>


      {/* MAIN COCKPIT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 flex-1">

        {/* LEFT PANEL */}
        <div className="order-2 xl:order-1">
          <TelemetryPanel data={data} />
        </div>


        {/* CENTER — PRIMARY FLIGHT DISPLAY */}
        <div className="order-1 xl:order-2 flex justify-center items-center">
          <ArtificialHorizon
            pitch={data.attitude.pitch}
            roll={data.attitude.roll}
            yaw={data.attitude.yaw}
          />
        </div>


        {/* RIGHT PANEL — SYSTEM */}
        <div className="order-3 space-y-4 font-mono text-sm">

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-3">
            <div className="text-cyan-400 border-b border-slate-700 pb-2">
              SYSTEM HEALTH
            </div>

            <Stat label="Battery" value={`${data.battery.toFixed(1)} %`} />
            <Stat label="Temp" value={`${data.temperature.toFixed(1)} °C`} />
            <Stat label="Link" value={`${data.linkQuality.toFixed(0)} %`} />
            <Stat label="Storage" value={`${data.storage.toFixed(1)} %`} />
            <Stat label="CPU Load" value={`${data.cpuLoad.toFixed(0)} %`} />
          </div>

        </div>
      </div>


      {/* FOOTER STRIP */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-6 py-3 font-mono text-xs flex justify-between">

        <div>
          POS → X:{data.position.x.toFixed(1)}  Y:{data.position.y.toFixed(1)}  Z:{data.position.z.toFixed(1)}
        </div>

        <div>
          VEL → Vx:{data.velocity.vx.toFixed(1)}  Vy:{data.velocity.vy.toFixed(1)}  Vz:{data.velocity.vz.toFixed(1)}
        </div>

      </div>
    </div>
  );
}


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-green-400">{value}</span>
    </div>
  );
}