


interface TelemetryData {
  position: { x: number; y: number; z: number };
  velocity: { vx: number; vy: number; vz: number };
  attitude: { pitch: number; roll: number; yaw: number };
  battery: { percent: number; voltage: number; current: number } | number;
  temperature: number;
  distance: number;
  rpi_temp: number;
  imu_temp: number;
  linkQuality: number;
  storage: number;
  cpuLoad: number;
  mode?: string;
  armed?: boolean;
}

interface TelemetryPanelProps {
  data: TelemetryData;
}

export function TelemetryPanel({ data }: TelemetryPanelProps) {

  return (
    <div className="tpanel-container">
      {/* Position */}
      <div className="tpanel-section">
        <div className="tpanel-section-title">RELATIVE POSITION (m)</div>
        <div className="tpanel-grid">
          <div>
            <span className="tpanel-label">X:</span>
            <span className="tpanel-val-green">{data.position.x.toFixed(2)}</span>
          </div>
          <div>
            <span className="tpanel-label">Y:</span>
            <span className="tpanel-val-green">{data.position.y.toFixed(2)}</span>
          </div>
          <div>
            <span className="tpanel-label">Z:</span>
            <span className="tpanel-val-green">{data.position.z.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Velocity */}
      <div className="tpanel-section">
        <div className="tpanel-section-title">VELOCITY (m/s)</div>
        <div className="tpanel-grid">
          <div>
            <span className="tpanel-label">Vx:</span>
            <span className="tpanel-val-blue">{data.velocity.vx.toFixed(2)}</span>
          </div>
          <div>
            <span className="tpanel-label">Vy:</span>
            <span className="tpanel-val-blue">{data.velocity.vy.toFixed(2)}</span>
          </div>
          <div>
            <span className="tpanel-label">Vz:</span>
            <span className="tpanel-val-blue">{data.velocity.vz.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Attitude */}
      <div className="tpanel-section">
        <div className="tpanel-section-title">ATTITUDE (deg)</div>
        <div className="tpanel-grid">
          <div>
            <span className="tpanel-label">Pitch:</span>
            <span className="tpanel-val-purple">{data.attitude.pitch.toFixed(1)}</span>
          </div>
          <div>
            <span className="tpanel-label">Roll:</span>
            <span className="tpanel-val-purple">{data.attitude.roll.toFixed(1)}</span>
          </div>
          <div>
            <span className="tpanel-label">Yaw:</span>
            <span className="tpanel-val-purple">{data.attitude.yaw.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Distance & Sensors */}
      <div className="tpanel-section">
        <div className="tpanel-section-title">SENSORS</div>
        <div className="tpanel-grid">
          <div>
            <span className="tpanel-label">Distance:</span>
            <span className="tpanel-val-cyan">{data.distance.toFixed(2)} m</span>
          </div>
          <div>
            <span className="tpanel-label">RPi Temp:</span>
            <span className="tpanel-val-orange">{data.rpi_temp.toFixed(1)}°C</span>
          </div>
          <div>
            <span className="tpanel-label">IMU Temp:</span>
            <span className="tpanel-val-orange">{data.imu_temp.toFixed(1)}°C</span>
          </div>
        </div>
      </div>

    </div>
  );
}
