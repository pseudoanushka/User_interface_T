import { useEffect, useState } from 'react';

const MAX_CURRENT = 4.0;
const MIN_VOLTAGE = 12.0;
const MAX_VOLTAGE = 16.5;

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
    font-size: 28px;
    letter-spacing: 3px;
    color: #e7edeeff;
    text-transform: uppercase;
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
    justify-content: center;
    text-align: center;
    gap: 4px;
    width: 50%;
  }
  .csp-header-right {
    border-left: 1px solid #1a3040;
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
    gap: 30px;
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
`;

interface ArduinoData {
  relay: string;
  currentA0: number;
  currentA1: number;
  voltageS1: number;
  voltageS2: number;
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

export function ChargingStatusPanel() {
  const [data, setData] = useState<ArduinoData>({
    relay: 'UNKNOWN', currentA0: 0, currentA1: 0, voltageS1: 0, voltageS2: 0,
  });

  useEffect(() => {
    const onArduinoData = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d) return;
      setData({
        relay:      d.relay      ?? 'UNKNOWN',
        currentA0:  d.current_A0 ?? 0,
        currentA1:  d.current_A1 ?? 0,
        voltageS1:  d.voltage_S1 ?? 0,
        voltageS2:  d.voltage_S2 ?? 0,
      });
    };
    window.addEventListener('bs:arduino_data', onArduinoData);
    return () => window.removeEventListener('bs:arduino_data', onArduinoData);
  }, []);

  const relaying = data.relay === 'ON';
  const overCurrent = data.currentA0 > MAX_CURRENT || data.currentA1 > MAX_CURRENT;
  const lowVoltage  = (data.voltageS1 > 0 && data.voltageS1 < MIN_VOLTAGE) ||
                      (data.voltageS2 > 0 && data.voltageS2 < MIN_VOLTAGE);

  // Battery health: average of non-zero voltages, scaled MIN→MAX
  const voltages = [data.voltageS1, data.voltageS2].filter(v => v > 0);
  const avgVoltage = voltages.length > 0 ? voltages.reduce((a,b) => a+b, 0) / voltages.length : 0;
  const healthPct = avgVoltage > 0
    ? Math.round(Math.min(100, Math.max(0, ((avgVoltage - MIN_VOLTAGE) / (MAX_VOLTAGE - MIN_VOLTAGE)) * 100)))
    : null;
  const healthClass = healthPct === null ? '' : healthPct >= 60 ? 'csp-health-green' : healthPct >= 30 ? 'csp-health-orange' : 'csp-health-red';

  return (
    <>
      <style>{styles}</style>
      <div className="csp-root">
        <div className="csp-header">
          {/* Left: State of Charge */}
          <div className="csp-header-left">
            <span className="csp-title">STATE OF CHARGE</span>
            {data.relay !== 'UNKNOWN' && (
              <span className={`csp-relay-badge csp-relay-${data.relay.toLowerCase()}`}>
                {relaying ? 'CHARGING INITIATED' : 'CHARGING NOT INITIATED'}
              </span>
            )}
          </div>
          {/* Right: Battery Health */}
          <div className="csp-header-right">
            <span className="csp-health-label">BATTERY HEALTH</span>
            <span className={`csp-health-value ${healthClass}`}>
              {healthPct !== null ? `${healthPct}%` : '-- %'}
            </span>
          </div>
        </div>

        <div className="csp-body">
          {/* Current */}
          <CurrentRow label="CURRENT" value={data.currentA0} />

          <div className="csp-divider" />

          {/* Voltage */}
          <VoltageRow label="VOLTAGE S1" value={data.voltageS1} />
          <VoltageRow label="VOLTAGE S2" value={data.voltageS2} />

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
