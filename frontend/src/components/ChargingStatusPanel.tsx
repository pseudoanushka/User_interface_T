import { useEffect, useState } from 'react';
import { getBaseUrl } from '../config';

const MAX_CURRENT = 4.0;
const MIN_VOLTAGE = 12.0;
const MAX_VOLTAGE = 16.4;

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap');

  .csp-root {
    position: fixed;
    left: 40%;
    top: calc(3.5% + 68% + 10px);
    width: 30%;
    height: 27.5%;
    z-index: 50;
    background: #020617;
    border: 1px solid #1a3040;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 0 0 1px #0d1f2d, 0 8px 40px rgba(0,0,0,0.7);
    font-family: 'Rajdhani', sans-serif;
    overflow: hidden;
  }

  .csp-header {
    background: #020617;
    border-bottom: 1px solid #1a3040;
    padding: 15px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .csp-title {
    font-size: clamp(25px, 1.3vw, 24px);
    letter-spacing: 2px;
    color: #e7edeeff;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: -55px;
  }

  .csp-relay-badge {
    font-size: 20px;
    letter-spacing: 2px;
    padding: 2px 8px;
    border-radius: 2px;
    text-transform: uppercase;
    font-weight: bold;
    transition: all 0.3s;
  }
  .csp-relay-on {
    background: rgba(225, 243, 232, 0.98);
    border: 1px solid #27ae60;
    color: #27ae60;
    animation: csp-pulse 1.2s step-start infinite;
  }
  .csp-relay-off {
    background: rgba(26,48,64,0.4);
    border: 1px solid #1a3040;
    color: #1d4e5f;
  }
  .csp-relay-unknown {
    background: rgba(26,48,64,0.4);
    border: 1px solid #1a3040;
    color: #1d4e5f;
  }
  @keyframes csp-pulse { 50% { opacity: 0.3; } }

  /* Header split into two halves */
  .csp-header-left, .csp-header-right {
    display: flex;
    flex-direction: column;
    align-items: center;
    top: 1.5%
    justify-content: center;
    text-align: center;
    gap: 4px;
    width: 50%;
  }
  .csp-header-right {
    border-left: 1px solid #dfe9f0;
    padding-left: 12px;
  }
  .csp-header-left {
    padding-right: 12px;
  }
  .csp-health-label {
    font-size: 28px;
    letter-spacing: 2px;
    align: align-center;
    color: #e7edeeff;
    text-transform: uppercase;
  }
  .csp-health-value {
    font-size: 28px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .csp-health-green  { color: #27ae60; }
  .csp-health-orange { color: #e67e22; }
  .csp-health-red    { color: #c0392b; animation: csp-pulse 0.8s step-start infinite; }

  .csp-body {
    padding: 15px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .csp-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .csp-label {
    font-size: 20px;
    letter-spacing: 1.5px;
    color: #e3eef1ff;
    text-transform: uppercase;
    width: 120px;
    flex-shrink: 0;
  }

  .csp-bar-track {
    flex: 1;
    height: 10px;
    background: #0a1118;
    border-radius: 2px;
    border: 1px solid #0f1e28;
    overflow: hidden;
  }

  .csp-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.4s ease, background 0.4s;
  }

  .csp-bar-fill.current-ok     { background: #22a6c0; }
  .csp-bar-fill.current-slow   { background: #e67e22; }
  .csp-bar-fill.current-alarm  { background: #c0392b; animation: csp-pulse 0.4s step-start infinite; }
  .csp-bar-fill.voltage-ok     { background: #27ae60; }
  .csp-bar-fill.voltage-low    { background: #c0392b; animation: csp-pulse 0.8s step-start infinite; }

  .csp-value {
    font-size: 20px;
    letter-spacing: 1px;
    width: 80px;
    text-align: right;
    flex-shrink: 0;
  }

  .csp-value.ok     { color: #22a6c0; }
  .csp-value.slow   { color: #e67e22; }
  .csp-value.alarm  { color: #c0392b; }
  .csp-value.low    { color: #c0392b; }
  .csp-value.good   { color: #27ae60; }

  /* slow charging indicator dots */
  .csp-slow-dots {
    display: flex;
    gap: 3px;
    align-items: center;
  }
  .csp-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #e67e22;
    animation: csp-pulse 0.8s step-start infinite;
  }
  .csp-dot:nth-child(2) { animation-delay: 0.2s; }

  .csp-alarm-banner {
    background: rgba(192,57,43,0.12);
    border: 1px solid #c0392b;
    border-radius: 2px;
    padding: 4px 8px;
    font-size: 20px;
    letter-spacing: 2px;
    color: #c0392b;
    text-transform: uppercase;
    text-align: center;
    animation: csp-pulse 0.4s step-start infinite;
  }

  .csp-warn-banner {
    background: rgba(192,57,43,0.08);
    border: 1px solid #8e3028;
    border-radius: 2px;
    padding: 4px 8px;
    font-size: 20px;
    letter-spacing: 2px;
    color: #e07060;
    text-transform: uppercase;
    text-align: center;
  }

  .csp-divider {
    height: 1px;
    background: #0f1e28;
    margin: 2px 0;
  }

  .csp-mission-badge {
    font-size: 16px;
    letter-spacing: 2px;
    padding: 2px 8px;
    border-radius: 2px;
    text-transform: uppercase;
    font-weight: bold;
  }
  .csp-mission-safe {
    background: rgba(231, 240, 234, 0.95);
    border: 1px solid #27ae60;
    color: #27ae60;
  }
  .csp-mission-abort {
    background: rgba(192,57,43,0.12);
    border: 1px solid #c0392b;
    color: #c0392b;
    animation: csp-pulse 0.4s step-start infinite;
  }
  .csp-soh-meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 16px;
    letter-spacing: 1px;
    color: #6a8fa0;
  }
  .csp-soh-meta-row span:last-child {
    color: #a0c8d8;
  }

`;

interface ArduinoData {
  relay: string;
  currentA0: number;
  currentA1: number;
  voltageS1: number;
  voltageS2: number;
}

interface ChargingStatus {
  charging: boolean;
  landed: boolean;
  source: string | null;
  timestamp: string | null;
  relay_armed: boolean;
  relay_triggered: boolean;
}

function currentClass(a: number) {
  if (a > MAX_CURRENT) return 'alarm';
  if (a >= 1 && a <= 2) return 'slow';
  return 'ok';
}

function voltageClass(v: number) {
  if (v > 0 && v < MIN_VOLTAGE) return 'low';
  return 'good';
}

function CurrentRow({ label, value }: { label: string; value: number }) {
  const cls = currentClass(value);
  const pct = Math.min(100, (value / MAX_CURRENT) * 100);
  return (
    <div className="csp-row">
      <span className="csp-label">{label}</span>
      <div className="csp-bar-track">
        <div className={`csp-bar-fill current-${cls}`} style={{ width: `${pct}%` }} />
      </div>
      {cls === 'slow' && (
        <div className="csp-slow-dots"><div className="csp-dot" /><div className="csp-dot" /></div>
      )}
      <span className={`csp-value ${cls}`}>{value.toFixed(2)} A</span>
    </div>
  );
}

function VoltageRow({ label, value }: { label: string; value: number }) {
  const cls = voltageClass(value);
  const pct = Math.min(100, (value / MAX_VOLTAGE) * 100);
  return (
    <div className="csp-row">
      <span className="csp-label">{label}</span>
      <div className="csp-bar-track">
        <div className={`csp-bar-fill voltage-${cls === 'low' ? 'low' : 'ok'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`csp-value ${cls}`}>{value.toFixed(2)} V</span>
    </div>
  );
}

interface SOHData {
  soh:            number | null;
  r_int_ohm:      number | null;
  r_int_samples:  number;
  c_used_mah:     number;
  v_cell_delta_v: number | null;
  mission_safe:   boolean;
}

export function ChargingStatusPanel({ data }: { data: ArduinoData }) {
  const relaying    = data.relay === 'ON';
  const overCurrent = data.currentA0 > MAX_CURRENT || data.currentA1 > MAX_CURRENT;
  const lowVoltage  = (data.voltageS1 > 0 && data.voltageS1 < MIN_VOLTAGE) ||
                      (data.voltageS2 > 0 && data.voltageS2 < MIN_VOLTAGE);

  const [sohData, setSohData] = useState<SOHData | null>(null);
  const [chargingStatus, setChargingStatus] = useState<ChargingStatus | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${getBaseUrl()}/battery/soh`);
        setSohData(await r.json());
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${getBaseUrl()}/charging-status`);
        setChargingStatus(await r.json());
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  const soh         = sohData?.soh ?? null;
  const missionSafe = sohData?.mission_safe ?? true;
  const sohClass    = soh === null ? '' : soh >= 60 ? 'csp-health-green' : soh >= 30 ? 'csp-health-orange' : 'csp-health-red';
  const rIntLabel   = sohData?.r_int_ohm != null
    ? `${(sohData.r_int_ohm * 1000).toFixed(1)} mΩ`
    : (sohData?.r_int_samples === 0 ? 'ESTIMATING…' : '--');

  const isCharging      = chargingStatus?.charging      ?? false;
  const isLanded        = chargingStatus?.landed         ?? false;
  const isRelayArmed    = chargingStatus?.relay_armed    ?? false;
  const isRelayTriggered = chargingStatus?.relay_triggered ?? false;
  const chargingSource  = chargingStatus?.source         ?? null;
  const chargingTs      = chargingStatus?.timestamp      ?? null;

  // Derive charging badge text: prefer live charging-status over arduino relay
  const hasVoltage       = data.voltageS1 > 1.0 || data.voltageS2 > 1.0;
  const chargingBadgeOn  = isCharging || relaying;
  const chargingBadgeText = isCharging
    ? (isRelayTriggered ? 'CHARGING ACTIVE' : isRelayArmed ? 'RELAY ARMED' : 'CHARGING INITIATED')
    : (relaying && hasVoltage ? 'CHARGING INITIATED' : 'CHARGING NOT INITIATED');

  return (
    <>
      <style>{styles}</style>
      <div className="csp-root">
        <div className="csp-header">
          {/* Left: State of Charge */}
          <div className="csp-header-left">
            <span className="csp-title">STATE OF CHARGE</span>
            <span className={`csp-relay-badge csp-relay-${chargingBadgeOn ? 'on' : 'off'}`}>
              {chargingBadgeText}
            </span>
          </div>
          {/* Right: Battery SOH */}
          <div className="csp-header-right">
            <span className="csp-health-label">BATTERY SOH</span>
            <span className={`csp-health-value ${sohClass}`}>
              {soh !== null ? `${soh}%` : '-- %'}
            </span>
            {soh !== null && soh < 20 ? (
              <span className="csp-mission-badge csp-mission-abort">⚠ DANGER — LOW SOH</span>
            ) : (
              <span className={`csp-mission-badge csp-mission-${missionSafe ? 'safe' : 'abort'}`}>
                {missionSafe ? '● MISSION SAFE' : '⚠ ABORT'}
              </span>
            )}
          </div>
        </div>

        <div className="csp-body">
          {/* Current */}
          <CurrentRow label="CURRENT I1" value={data.currentA0} />
          <CurrentRow label="CURRENT I2" value={data.currentA1} />

          <div className="csp-divider" />

          {/* Voltage */}
          <VoltageRow label="VOLTAGE S1" value={data.voltageS1} />
          <VoltageRow label="VOLTAGE S2" value={data.voltageS2} />

          <div className="csp-divider" />

          {/* Charging status fields from CHARGING_STATUS.json */}
          <div className="csp-soh-meta-row">
            <span>LANDED</span>
            <span style={{ color: isLanded ? '#27ae60' : '#6a8fa0' }}>{isLanded ? 'YES' : 'NO'}</span>
          </div>
          <div className="csp-soh-meta-row">
            <span>RELAY</span>
            <span style={{ color: isRelayTriggered ? '#27ae60' : isRelayArmed ? '#e67e22' : '#6a8fa0' }}>
              {isRelayTriggered ? 'TRIGGERED' : isRelayArmed ? 'ARMED' : 'OFF'}
            </span>
          </div>
          {chargingSource && (
            <div className="csp-soh-meta-row">
              <span>SOURCE</span>
              <span style={{ color: '#a0c8d8' }}>{chargingSource.toUpperCase()}</span>
            </div>
          )}
          {chargingTs && (
            <div className="csp-soh-meta-row">
              <span>UPDATED</span>
              <span style={{ color: '#6a8fa0', fontSize: '14px' }}>{chargingTs.slice(11, 19)}</span>
            </div>
          )}

          <div className="csp-divider" />

          {/* SOH metrics */}
          <div className="csp-soh-meta-row">
            <span>R_INT</span>
            <span>{rIntLabel}</span>
          </div>
          <div className="csp-soh-meta-row">
            <span>CONSUMED</span>
            <span>{sohData ? `${sohData.c_used_mah.toFixed(0)} mAh` : '--'}</span>
          </div>
          {sohData?.v_cell_delta_v != null && (
            <div className="csp-soh-meta-row">
              <span>CELL Δ</span>
              <span style={{ color: sohData.v_cell_delta_v > 0.2 ? '#e67e22' : '#27ae60' }}>
                {(sohData.v_cell_delta_v * 1000).toFixed(0)} mV
              </span>
            </div>
          )}

          {/* Alarm / Warning banners */}
          {overCurrent && (
            <div className="csp-alarm-banner">⚠ OVERCURRENT — CHARGING HALTED</div>
          )}
          {lowVoltage && (
            <div className="csp-warn-banner">⚠ LOW BATTERY — BELOW {MIN_VOLTAGE}V</div>
          )}
        </div>
      </div>
    </>
  );
}
