import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  Radio,
} from 'lucide-react';
import { getBaseUrl } from '../config';

const FS_THRESHOLDS = {
  batt: { warn: 25, crit: 10 },
};

const styles = `
  .fsp-root {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 12;
    display: flex;
    gap: 8px;
    pointer-events: none;
  }

  @keyframes fsp-blink { 50% { opacity: 0.25; } }

  .fsp-icon-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .fsp-icon-tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    color: #27ae60;
  }

  .fsp-icon-tile svg {
    width: 21px;
    height: 21px;
    stroke-width: 1.8;
    filter: drop-shadow(0 0 6px currentColor);
  }

  .fsp-icon-tile.fsp-warn {
    color: #f39c12;
    animation: fsp-blink 1.2s step-start infinite;
  }

  .fsp-icon-tile.fsp-crit {
    color: #e74c3c;
    animation: fsp-blink 0.45s step-start infinite;
  }
`;

type FsLevel = 'ok' | 'warn' | 'crit';

interface FsItem {
  id: string;
  label: string;
  level: FsLevel;
  value: string;
}

function iconFor(id: string, level: FsLevel) {
  if (level === 'crit') return <AlertTriangle />;

  switch (id) {
    case 'batt':
      return <Battery />;
    case 'rc':
      return <Radio />;
    default:
      return <AlertTriangle />;
  }
}

export function FailsafePanel() {
  const [telemetry, setTelemetry] = useState<any>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const [pr, tr] = await Promise.all([
          fetch(`${getBaseUrl()}/params/all`),
          fetch(`${getBaseUrl()}/telemetry`),
        ]);
        const params = pr.ok ? await pr.json() : {};
        const tdata = tr.ok ? await tr.json() : {};
        setTelemetry({ ...tdata, PARAMS: params });
      } catch {
        // Keep previous telemetry if polling fails.
      }
    };

    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  const params = telemetry?.PARAMS ?? {};
  const rpi = telemetry?.RPI ?? {};
  const batt = params.BATTERY_STATUS ?? {};

  const rawVoltages: number[] = batt.voltages ?? [];
  const battMv = rawVoltages.find((v: number) => v > 0 && v < 65535) ?? 0;
  const battVoltage = rpi.battery != null
    ? (typeof rpi.battery === 'object' ? (rpi.battery?.voltage ?? battMv / 1000) : battMv / 1000)
    : battMv / 1000;
  const battPct = Math.min(100, Math.max(0, Math.round(((battVoltage - 12.0) / (16.8 - 12.0)) * 100)));

  const rcAvail: boolean = rpi.rc_available ?? true;

  const batteryLevel = battPct <= FS_THRESHOLDS.batt.crit
    ? 'crit'
    : battPct <= FS_THRESHOLDS.batt.warn
      ? 'warn'
      : 'ok';

  const failsafes: FsItem[] = [
    { id: 'batt', label: 'Battery Failsafe', level: batteryLevel, value: `${battPct.toFixed(0)}%` },
    { id: 'rc', label: 'RC Link', level: rcAvail ? 'ok' : 'crit', value: rcAvail ? 'OK' : 'LOST' },
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="fsp-root" aria-label="Failsafe icon status panel">
        <div className="fsp-icon-grid">
          {failsafes.map(fs => (
            <div
              key={fs.id}
              className={`fsp-icon-tile fsp-${fs.level}`}
              title={`${fs.label}: ${fs.value} (${fs.level.toUpperCase()})`}
              aria-label={`${fs.label}: ${fs.value} ${fs.level}`}
            >
              {iconFor(fs.id, fs.level)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
