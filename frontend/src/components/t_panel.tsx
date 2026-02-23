import { Battery, Thermometer, Wifi, HardDrive, Cpu } from 'lucide-react';


interface TelemetryData {
  position: { x: number; y: number; z: number };
  velocity: { vx: number; vy: number; vz: number };
  attitude: { pitch: number; roll: number; yaw: number };
  battery: number;
  temperature: number;
  linkQuality: number;
  storage: number;
  cpuLoad: number;
}

interface TelemetryPanelProps {
  data: TelemetryData;
}

export function TelemetryPanel({ data }: TelemetryPanelProps) {
  const getBatteryColor = (level: number) => {
    if (level > 50) return 'text-green-400';
    if (level > 20) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getTempColor = (temp: number) => {
    if (temp < 50) return 'text-green-400';
    if (temp < 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getLinkColor = (quality: number) => {
    if (quality > 70) return 'text-green-400';
    if (quality > 40) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4 font-mono text-sm">
      <div className="text-cyan-400 border-b border-slate-700 pb-2">
        TELEMETRY DATA
      </div>

      {/* Position */}
      <div className="space-y-1">
        <div className="text-slate-400 text-xs">RELATIVE POSITION (m)</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-slate-500">X:</span>
            <span className="text-green-400 ml-2">{data.position.x.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-500">Y:</span>
            <span className="text-green-400 ml-2">{data.position.y.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-500">Z:</span>
            <span className="text-green-400 ml-2">{data.position.z.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Velocity */}
      <div className="space-y-1">
        <div className="text-slate-400 text-xs">VELOCITY (m/s)</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-slate-500">Vx:</span>
            <span className="text-blue-400 ml-2">{data.velocity.vx.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-500">Vy:</span>
            <span className="text-blue-400 ml-2">{data.velocity.vy.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-500">Vz:</span>
            <span className="text-blue-400 ml-2">{data.velocity.vz.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Attitude */}
      <div className="space-y-1">
        <div className="text-slate-400 text-xs">ATTITUDE (deg)</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-slate-500">Pitch:</span>
            <span className="text-purple-400 ml-2">{data.attitude.pitch.toFixed(1)}°</span>
          </div>
          <div>
            <span className="text-slate-500">Roll:</span>
            <span className="text-purple-400 ml-2">{data.attitude.roll.toFixed(1)}°</span>
          </div>
          <div>
            <span className="text-slate-500">Yaw:</span>
            <span className="text-purple-400 ml-2">{data.attitude.yaw.toFixed(1)}°</span>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="space-y-2 pt-2 border-t border-slate-700">
        <div className="text-slate-400 text-xs">SYSTEM STATUS</div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Battery className="w-4 h-4" />
            <span className="text-slate-400">Battery</span>
          </div>
          <span className={getBatteryColor(data.battery)}>{data.battery.toFixed(1)}%</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4" />
            <span className="text-slate-400">Temp</span>
          </div>
          <span className={getTempColor(data.temperature)}>{data.temperature.toFixed(1)}°C</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            <span className="text-slate-400">Link</span>
          </div>
          <span className={getLinkColor(data.linkQuality)}>{data.linkQuality.toFixed(0)}%</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            <span className="text-slate-400">Storage</span>
          </div>
          <span className="text-cyan-400">{data.storage.toFixed(1)}%</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            <span className="text-slate-400">CPU</span>
          </div>
          <span className="text-cyan-400">{data.cpuLoad.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
