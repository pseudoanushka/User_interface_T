import { useEffect, useRef, useState } from 'react';
import { getBaseUrl } from '../config';

/* ─── Failsafe thresholds ────────────────────────────────────────────────── */
const FS_THRESHOLDS = {
  batt:   { warn: 25,  crit: 10  },   // battery %
  tilt:   { warn: 30,  crit: 45  },   // degrees
  geo:    { warn: 50,  crit: 80  },   // metres from home
  desc:   { warn: 3,   crit: 5   },   // m/s vertical speed
  link:   { warn: 3,   crit: 5   },   // seconds since last heartbeat
};

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap');

  .fsp-root {
    position: fixed;
    right: 0;
    bottom: 2%;
    width: 29%;
    height: 35%;
    z-index: 50;
    display: flex;
    flex-direction: column;
    background: #020617;
    border: 1px solid #1a3040;
    border-radius: 8px 0 0 8px;
    box-shadow: 0 0 0 1px #0d1f2d, -8px 0 40px rgba(0,0,0,0.6);
    font-family: 'Rajdhani', sans-serif;
    overflow: hidden;
  }

  /* ── Header ── */
  .fsp-header {
    background: #0f0f13ff;
    border-bottom: 1px solid #1a3040;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  .fsp-title {
    font-size: 20px;
    font-weight: bold;
    letter-spacing: 2px;
    color: #ffffff;
    text-transform: uppercase;
  }
  .fsp-summary {
    font-size: 18px;
    letter-spacing: 1px;
    padding: 2px 8px;
    border-radius: 2px;
    text-transform: uppercase;
    font-weight: 600;
  }
  .fsp-summary-ok {
    background: rgba(39,174,96,0.12);
    border: 1px solid #27ae60;
    color: #27ae60;
  }
  .fsp-summary-warn {
    background: rgba(243,156,18,0.12);
    border: 1px solid #f39c12;
    color: #f39c12;
    animation: fsp-blink 1.5s step-start infinite;
  }
  .fsp-summary-crit {
    background: rgba(231,76,60,0.12);
    border: 1px solid #e74c3c;
    color: #e74c3c;
    animation: fsp-blink 0.5s step-start infinite;
  }
  @keyframes fsp-blink { 50% { opacity: 0.3; } }

  /* ── Failsafe rows area ── */
  .fsp-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12px 16px;
    gap: 2px;
  }

  /* ── Individual failsafe row ── */
  .fsp-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    background: #040c14;
    border: 1px solid #0f1e28;
    transition: border-color 0.3s, background 0.3s;
  }
  .fsp-row.fsp-warn-row {
    border-color: rgba(243,156,18,0.3);
    background: rgba(243,156,18,0.04);
  }
  .fsp-row.fsp-crit-row {
    border-color: rgba(231,76,60,0.3);
    background: rgba(231,76,60,0.04);
  }

  /* dot */
  .fsp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.3s;
  }
  .fsp-dot-ok   { background: #27ae60; }
  .fsp-dot-warn { background: #f39c12; animation: fsp-blink 1.5s step-start infinite; }
  .fsp-dot-crit { background: #e74c3c; animation: fsp-blink 0.5s step-start infinite; }

  /* icon */
  .fsp-icon {
    font-size: 16px;
    width: 22px;
    text-align: center;
    flex-shrink: 0;
    color: #ffffff;
  }

  /* label */
  .fsp-label {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 1.5px;
    color: #3a7a8a;
    text-transform: uppercase;
    flex: 1;
  }
  .fsp-label-warn { color: #f39c12; }
  .fsp-label-crit { color: #e74c3c; }

  /* value */
  .fsp-val {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #22a6c0;
    text-align: right;
    min-width: 60px;
    white-space: nowrap;
  }
  .fsp-val-warn { color: #f39c12; }
  .fsp-val-crit { color: #e74c3c; }

  /* status text */
  .fsp-status {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 1px;
    min-width: 36px;
    text-align: center;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 2px;
  }
  .fsp-status-ok   { color: #27ae60; background: rgba(39,174,96,0.08); }
  .fsp-status-warn { color: #f39c12; background: rgba(243,156,18,0.08); }
  .fsp-status-crit { color: #e74c3c; background: rgba(231,76,60,0.08); }

  /* ── Footer ── */
  .fsp-footer {
    border-top: 1px solid #0f1e28;
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    color: #1d4e5f;
    letter-spacing: 1px;
    flex-shrink: 0;
  }
  .fsp-footer-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #27ae60;
    animation: fsp-blink 1s step-start infinite;
  }
  .fsp-footer-txt {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: #2d7a8a;
  }
`;

/* ─── Types ──────────────────────────────────────────────────────────────── */
type FsLevel = 'ok' | 'warn' | 'crit';

interface FsItem {
  id: string;
  icon: string;
  label: string;
  level: FsLevel;
  value: string;
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export function FailsafePanel() {
  const [telemetry, setTelemetry] = useState<any>(null);
  const lastTelTsRef = useRef<number>(Date.now());

  /* ── Parallel polling: params/all (JSON files) + telemetry (RPi/RC) ── */
  useEffect(() => {
    const poll = async () => {
      try {
        const [pr, tr] = await Promise.all([
          fetch(`${getBaseUrl()}/params/all`),
          fetch(`${getBaseUrl()}/telemetry`),
        ]);
        const params = pr.ok ? await pr.json() : {};
        const tdata  = tr.ok ? await tr.json() : {};
        setTelemetry({ ...tdata, PARAMS: params });
        lastTelTsRef.current = Date.now();
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Extract fields ── */
  const params = telemetry?.PARAMS ?? {};
  const rpi    = telemetry?.RPI    ?? {};
  const zigbee = telemetry?.ZIGBEE ?? {};

  const batt = params.BATTERY_STATUS     ?? {};
  const att  = params.ATTITUDE           ?? {};
  const pos  = params.LOCAL_POSITION_NED ?? {};

  // Battery voltage from BATTERY_STATUS.json
  const BATT_MIN_V = 12.0;
  const BATT_MAX_V = 16.8;
  const voltToPct = (v: number) =>
    Math.min(100, Math.max(0, Math.round(((v - BATT_MIN_V) / (BATT_MAX_V - BATT_MIN_V)) * 100)));
  const rawVoltages: number[] = batt.voltages ?? [];
  const battMv      = rawVoltages.find((v: number) => v > 0 && v < 65535) ?? 0;
  const battVoltage = rpi.battery != null
    ? (typeof rpi.battery === 'object' ? (rpi.battery?.voltage ?? battMv / 1000) : battMv / 1000)
    : battMv / 1000;
  const battPct: number = voltToPct(battVoltage);

  // Armed / RC
  const hb      = params.HEARTBEAT ?? {};
  const isArmed: boolean = rpi.armed ?? !!(( hb.base_mode ?? 0) & 0x80);
  const rcAvail: boolean = rpi.rc_available ?? true;

  /* ── Compute failsafes ── */
  const toDeg   = (r: number) => r * (180 / Math.PI);
  const rollDeg  = Math.abs(toDeg(att.roll  || 0));
  const pitchDeg = Math.abs(toDeg(att.pitch || 0));
  const tiltDeg  = Math.sqrt(rollDeg ** 2 + pitchDeg ** 2);
  const homeDistM = Math.sqrt((pos.x || 0) ** 2 + (pos.y || 0) ** 2);
  const vzAbs     = Math.abs((pos.vz || zigbee.velocity?.vz) || 0);
  const telAge    = (Date.now() - lastTelTsRef.current) / 1000;

  const level = (val: number, warn: number, crit: number, invert = false): FsLevel => {
    if (invert) return val <= crit ? 'crit' : val <= warn ? 'warn' : 'ok';
    return val > crit ? 'crit' : val > warn ? 'warn' : 'ok';
  };

  const failsafes: FsItem[] = [
    {
      id: 'armed',
      icon: '🔒',
      label: 'ARMED',
      level: isArmed ? 'warn' : 'ok',
      value: isArmed ? 'ARMED' : 'SAFE',
    },
    {
      id: 'batt',
      icon: '⚡',
      label: 'BATTERY',
      level: level(battPct, FS_THRESHOLDS.batt.warn, FS_THRESHOLDS.batt.crit, true),
      value: `${typeof battPct === 'number' ? battPct.toFixed(1) : battPct}%`,
    },
    // {
    //   id: 'tilt',
    //   icon: '✈',
    //   label: 'TILT',
    //   level: level(tiltDeg, FS_THRESHOLDS.tilt.warn, FS_THRESHOLDS.tilt.crit),
    //   value: `${tiltDeg.toFixed(1)}°`,
    // },
    {
      id: 'geo',
      icon: '◎',
      label: 'GEOFENCE',
      level: level(homeDistM, FS_THRESHOLDS.geo.warn, FS_THRESHOLDS.geo.crit),
      value: `${homeDistM.toFixed(1)}m`,
    },
    {
      id: 'desc',
      icon: '↓',
      label: 'DESCENT',
      level: level(vzAbs, FS_THRESHOLDS.desc.warn, FS_THRESHOLDS.desc.crit),
      value: `${vzAbs.toFixed(1)} m/s`,
    },
    {
      id: 'rc',
      icon: '📡',
      label: 'RC LINK',
      level: rcAvail ? 'ok' : 'crit',
      value: rcAvail ? 'OK' : 'LOST',
    },
    {
      id: 'link',
      icon: '🖧',
      label: 'GCS LINK',
      level: level(telAge, FS_THRESHOLDS.link.warn, FS_THRESHOLDS.link.crit),
      value: telAge > 3 ? `${telAge.toFixed(0)}s AGO` : 'LIVE',
    },
  ];

  /* ── Overall severity ── */
  const worstLevel: FsLevel = failsafes.some(f => f.level === 'crit')
    ? 'crit'
    : failsafes.some(f => f.level === 'warn')
      ? 'warn'
      : 'ok';

  const summaryLabel = worstLevel === 'ok' ? 'ALL NOMINAL' : worstLevel === 'warn' ? '⚠ WARNING' : '⚠ CRITICAL';
  const alertCount = failsafes.filter(f => f.level !== 'ok').length;

  /* ── Render ── */
  return (
    <>
      <style>{styles}</style>
      <div className="fsp-root">

        {/* Header */}
        <div className="fsp-header">
          <div className="fsp-title">FAILSAFE STATUS</div>
          <div className={`fsp-summary fsp-summary-${worstLevel}`}>{summaryLabel}</div>
        </div>

        {/* Failsafe rows */}
        <div className="fsp-body">
          {failsafes.map(fs => (
            <div
              key={fs.id}
              className={`fsp-row${fs.level === 'warn' ? ' fsp-warn-row' : fs.level === 'crit' ? ' fsp-crit-row' : ''}`}
            >
              <div className={`fsp-dot fsp-dot-${fs.level}`} />
              <div className="fsp-icon">{fs.icon}</div>
              <div className={`fsp-label${fs.level !== 'ok' ? ` fsp-label-${fs.level}` : ''}`}>
                {fs.label}
              </div>
              <div className={`fsp-val${fs.level !== 'ok' ? ` fsp-val-${fs.level}` : ''}`}>
                {fs.value}
              </div>
              <div className={`fsp-status fsp-status-${fs.level}`}>
                {fs.level === 'ok' ? 'OK' : fs.level === 'warn' ? 'WARN' : 'CRIT'}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="fsp-footer">
          <div className="fsp-footer-dot" />
          <div className="fsp-footer-txt">
            {alertCount === 0
              ? 'ALL SYSTEMS NOMINAL — MONITORING 5 PARAMETERS'
              : `${alertCount} ALERT${alertCount > 1 ? 'S' : ''} ACTIVE — MONITORING 5 PARAMETERS`}
          </div>
        </div>

      </div>
    </>
  );
}
