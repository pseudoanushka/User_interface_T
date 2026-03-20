import { useEffect, useRef, useState, useCallback } from 'react';

import { getBaseUrl } from "../config";
const MISSION_DURATION = 8 * 60; // 8 minutes in seconds

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap');

  .mdp-root {
    position: fixed;
    right: 0;
    top: 1.5%;
    width: 29%;
    height: 23%;
    z-index: 50;
    display: flex;
    flex-direction: column;
    background: #020617;
    border: 1px solid #1a3040;
    border-radius: 8px 0 0 8px;
    box-shadow: 0 0 0 1px #0d1f2d, -8px 0 40px rgba(0,0,0,0.6);
    font-family: 'Rajdhani', sans-serif;
    overflow: hidden;

  /* ── Header ── */
  .mdp-header {
    background: #020617;
    border-bottom: 1px solid #1a3040;
    padding: 7px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .mdp-title {
    font-size: 28px;
    letter-spacing: 3px;
    align-items: center;
    color: #dbecf0;
    text-transform: uppercase;
  }
  .mdp-badge {
    font-size: 13px;
    letter-spacing: 2px;
    padding: 2px 8px;
    border-radius: 2px;
    text-transform: uppercase;
    transition: all 0.3s;
  }
  .mdp-badge-idle    { background: rgba(26,48,64,0.4); border: 1px solid #1a3040; color: #1d4e5f; }
  .mdp-badge-running { background: rgba(39,174,96,0.12); border: 1px solid #27ae60; color: #27ae60; animation: mdp-blink 1.2s step-start infinite; }
  .mdp-badge-stopped { background: rgba(192,57,43,0.12); border: 1px solid #c0392b; color: #c0392b; }
  @keyframes mdp-blink { 50% { opacity: 0.3; } }

  /* ── Timer block ── */
  .mdp-timer-block {
    padding: 14px 12px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid #0f1e28;
    flex-shrink: 0;
  }
  .mdp-timer-label {
    font-size: 12px;
    letter-spacing: 3px;
    color: #1d4e5f;
    text-transform: uppercase;
  }
  .mdp-timer-display {
    font-family: 'Rajdhani', sans-serif;
    font-size: 64px;
    letter-spacing: 6px;
    transition: color 0.4s;
    line-height: 1;
  }
  .mdp-timer-ok      { color: #22a6c0; }
  .mdp-timer-low     { color: #e67e22; }
  .mdp-timer-critical{ color: #c0392b; animation: mdp-blink 0.6s step-start infinite; }
  .mdp-timer-stopped { color: #1d4e5f; }

  .mdp-btn-row {
    display: flex;
    gap: 12px;
    width: 100%;
  }
  .mdp-btn {
    flex: 1;
    padding: 10px 0;
    border-radius: 4px;
    border: 1px solid;
    font-family: 'Rajdhani', sans-serif;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
    overflow: hidden;
  }
  .mdp-btn::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: currentColor;
    opacity: 0.4;
  }
  .mdp-btn-start {
    background: rgba(39,174,96,0.08);
    border-color: #27ae60;
    color: #27ae60;
  }
  .mdp-btn-start:hover:not(:disabled) { background: rgba(39,174,96,0.18); }
  .mdp-btn-stop {
    background: rgba(192,57,43,0.08);
    border-color: #c0392b;
    color: #c0392b;
  }
  .mdp-btn-stop:hover:not(:disabled)  { background: rgba(192,57,43,0.18); }
  .mdp-btn:disabled { opacity: 0.25; cursor: not-allowed; }

  /* ── Live stats strip ── */
  .mdp-stats-strip {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 8px 12px;
    border-bottom: 1px solid #0f1e28;
    flex-shrink: 0;
    gap: 8px;
  }
  .mdp-stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .mdp-stat-val {
    font-size: 22px;
    letter-spacing: 1px;
    color: #22a6c0;
  }
  .mdp-stat-key {
    font-size: 10px;
    letter-spacing: 2px;
    color: #1d4e5f;
    text-transform: uppercase;
  }
  .mdp-stat-sep {
    width: 1px;
    height: 32px;
    background: #0f1e28;
  }

  /* ── Metrics grid ── */
  .mdp-metrics {
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    border-bottom: 1px solid #0f1e28;
    flex-shrink: 0;
  }
  .mdp-metric-card {
    background: #040c14;
    border: 1px solid #0f1e28;
    border-radius: 4px;
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;
    overflow: hidden;
  }
  .mdp-metric-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: var(--mc, #22a6c0);
    opacity: 0.5;
  }
  .mdp-metric-key {
    font-size: 10px;
    letter-spacing: 2px;
    color: #1d4e5f;
    text-transform: uppercase;
  }
  .mdp-metric-val {
    font-size: 22px;
    letter-spacing: 1.5px;
    color: var(--mc, #22a6c0);
  }
  .mdp-metric-unit {
    font-size: 11px;
    color: #1d4e5f;
    letter-spacing: 1px;
  }

  /* ── Log viewer ── */
  .mdp-log-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .mdp-log-header {
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    border-bottom: 1px solid #0f1e28;
  }
  .mdp-log-title {
    font-size: 13px;
    letter-spacing: 3px;
    color: #1d4e5f;
    text-transform: uppercase;
  }
  .mdp-csv-path {
    font-size: 10px;
    letter-spacing: 1px;
    color: #27ae60;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .mdp-log-table-wrap {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: #1a3040 #020617;
  }
  .mdp-log-table-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
  .mdp-log-table-wrap::-webkit-scrollbar-track { background: #020617; }
  .mdp-log-table-wrap::-webkit-scrollbar-thumb { background: #1a3040; border-radius: 2px; }

  .mdp-log-table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  .mdp-log-table th {
    position: sticky;
    top: 0;
    background: #040c14;
    color: #1d4e5f;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 1.5px;
    padding: 5px 8px;
    border-bottom: 1px solid #0f1e28;
    white-space: nowrap;
    font-weight: normal;
  }
  .mdp-log-table td {
    color: #2d7a8a;
    padding: 4px 8px;
    border-bottom: 1px solid #07101a;
    white-space: nowrap;
  }
  .mdp-log-table tr:hover td { background: #051018; color: #22a6c0; }
  .mdp-log-table tr:nth-child(even) td { background: #030a12; }

  .mdp-log-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #1a3040;
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .mdp-log-empty-icon { font-size: 28px; opacity: 0.15; }

  /* ── Ticker at very bottom ── */
  .mdp-ticker {
    flex-shrink: 0;
    border-top: 1px solid #0f1e28;
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #1d4e5f;
    letter-spacing: 1px;
  }
  .mdp-ticker-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #1a3040;
    flex-shrink: 0;
  }
  .mdp-ticker-dot.running { background: #27ae60; animation: mdp-blink 1s step-start infinite; }
  .mdp-ticker-txt { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #2d7a8a; }
`;

/* ─── Types ──────────────────────────────────────────────────────────────── */
type MissionState = 'idle' | 'running' | 'stopped';

interface StatusResp {
  running: boolean;
  elapsed_s: number;
  rows_logged: number;
  frames_saved: number;
  last_csv: string;
}

interface LogsResp {
  path: string;
  columns: string[];
  rows: Record<string, string>[];
}

/* ─── Key columns to show in the log table ─── */
const TABLE_COLS = [
  "timestamp", "mode", "armed",
  "roll_deg", "pitch_deg", "yaw_deg",
  "speed_h", "altitude_agl",
  "battery_pct", "battery_v",
  "relay", "distance_m"
];

/* ─── Component ─────────────────────────────────────────────────────────── */
export function MissionDataPanel() {
  const [state, setState] = useState<MissionState>('idle');
  const [remaining, setRemaining] = useState(MISSION_DURATION);
  const [rowsLogged, setRowsLogged] = useState(0);
  const [framesSaved, setFramesSaved] = useState(0);
  const [csvPath, setCsvPath] = useState('');
  const [logRows, setLogRows] = useState<Record<string, string>[]>([]);
  const [ticker, setTicker] = useState('GCS LINK ESTABLISHED');
  const [telemetry, setTelemetry] = useState<any>(null);

  const timerRafRef = useRef<number | null>(null);       // requestAnimationFrame handle
  const lastSecRef = useRef<number>(-1);                 // last displayed second (avoid redundant setState)
  const startTimeRef = useRef<number>(0);                  // wall-clock ms when mission started
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const telPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunningRef = useRef<boolean>(false);             // sync flag for rAF loop termination

  /* ── Telemetry polling ── */
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${getBaseUrl()}/telemetry`);
        const j = await r.json();
        setTelemetry(j);
      } catch { /* ignore */ }
    };
    poll();
    telPollRef.current = setInterval(poll, 1000);
    return () => { if (telPollRef.current) clearInterval(telPollRef.current); };
  }, []);

  /* ── Derived metrics from telemetry ── */
  const tel = telemetry?.ZIGBEE ?? {};
  const ard = telemetry?.ARDUINO ?? {};
  const att = tel.attitude ?? {};
  const pos = tel.position ?? {};
  const vel = tel.velocity ?? {};
  const batt = typeof tel.battery === 'object' ? tel.battery : { percent: 0, voltage: 0, current: 0 };

  const speedH = Math.sqrt((vel.vx || 0) ** 2 + (vel.vy || 0) ** 2).toFixed(2);
  const altAGL = (-(pos.z || 0)).toFixed(2);
  const tilt = Math.sqrt((att.roll || 0) ** 2 + (att.pitch || 0) ** 2).toFixed(2);
  const chargePow = ((ard.voltageS1 || 0) * (ard.currentA0 || 0)).toFixed(1);

  /* ── Timer class ── */
  const timerClass = () => {
    if (state === 'stopped') return 'mdp-timer-stopped';
    if (remaining <= 30) return 'mdp-timer-critical';
    if (remaining <= 60) return 'mdp-timer-low';
    return 'mdp-timer-ok';
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  /* ── Start mission ── */
  const handleStart = useCallback(async () => {
    try {
      await fetch(`${getBaseUrl()}/mission/start`, { method: 'POST' });
    } catch { /* server may be stopping */ }

    setState('running');
    setRemaining(MISSION_DURATION);
    setRowsLogged(0);
    setFramesSaved(0);
    setCsvPath('');
    setLogRows([]);
    setTicker('MISSION STARTED — LOGGING TELEMETRY');

    // ── Smooth wall-clock countdown via requestAnimationFrame ──
    // Only calls setState when the displayed second actually changes → no flicker
    startTimeRef.current = Date.now();
    lastSecRef.current = MISSION_DURATION;
    isRunningRef.current = true;

    const tick = () => {
      if (!isRunningRef.current) return; // Exit loop if stopped

      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const left = Math.max(0, MISSION_DURATION - elapsed);

      if (left !== lastSecRef.current) {
        lastSecRef.current = left;
        setRemaining(left);
        if (left === 0) {
          handleStop();
          return;
        }
      }
      timerRafRef.current = requestAnimationFrame(tick);
    };
    timerRafRef.current = requestAnimationFrame(tick);

    // ── Live log polling — shows rows as they come in (CSV flushed every 1s) ──
    const pollLogs = async () => {
      try {
        const r = await fetch(`${getBaseUrl()}/mission/logs`);
        const j: LogsResp = await r.json();
        if (j.rows.length > 0) setLogRows(j.rows);
      } catch { /* ignore */ }
    };
    logPollRef.current = setInterval(pollLogs, 3000);

    // Status polling
    statusPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${getBaseUrl()}/mission/status`);
        const j: StatusResp = await r.json();
        setRowsLogged(j.rows_logged);
        setFramesSaved(j.frames_saved);
        setTicker(`ROWS: ${j.rows_logged} | FRAMES: ${j.frames_saved} | ELAPSED: ${j.elapsed_s}s`);
      } catch { /* ignore */ }
    }, 1500);

    // Frame capture every 5s
    frameTimerRef.current = setInterval(() => {
      captureFrame();
    }, 5000);

  }, []); // eslint-disable-line

  /* ── Capture a frame from the camera and POST to backend ── */
  const captureFrame = () => {
    // We use a hidden canvas to grab the img element drawn in CameraFeed
    const camImg = document.querySelector('.gcs-feed img') as HTMLImageElement | null;
    if (!camImg || !camImg.src || camImg.src.startsWith('data:') === false && camImg.naturalWidth === 0) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = camImg.naturalWidth || 320;
      canvas.height = camImg.naturalHeight || 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(camImg, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) return;
        fetch(`${getBaseUrl()}/mission/save_frame`, {
          method: 'POST',
          body: blob,
          headers: { 'Content-Type': 'image/jpeg' }
        }).catch(() => { /* ignore */ });
      }, 'image/jpeg', 0.85);
    } catch { /* cross-origin frames may block canvas taint */ }
  };

  /* ── Stop mission ── */
  const handleStop = useCallback(async () => {
    isRunningRef.current = false; // synchronously halt the rAF loop

    // Cancel animation frame + all intervals
    if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    if (logPollRef.current) clearInterval(logPollRef.current);
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);

    setState('stopped');
    setTicker('MISSION STOPPED — FLUSHING CSV…');

    try {
      const r = await fetch(`${getBaseUrl()}/mission/stop`, { method: 'POST' });
      const j = await r.json();
      setCsvPath(j.csv_path ?? '');
      setRowsLogged(j.rows_logged ?? 0);
      setFramesSaved(j.frames_saved ?? 0);
      setTicker(`CSV SAVED: ${j.csv_path ?? 'N/A'}`);
    } catch {
      setTicker('STOP ERROR — CHECK SERVER');
    }

    // Wait 400 ms for the file to close, then fetch final log
    await new Promise(res => setTimeout(res, 400));
    try {
      const r = await fetch(`${getBaseUrl()}/mission/logs`);
      const j: LogsResp = await r.json();
      setLogRows(j.rows);
    } catch { /* ignore */ }

  }, []);  // eslint-disable-line

  /* ── Cleanup on unmount ── */
  useEffect(() => () => {
    if (timerRafRef.current) cancelAnimationFrame(timerRafRef.current);
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    if (logPollRef.current) clearInterval(logPollRef.current);
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
  }, []);

  /* ─── Render ─────────────────────────────────────────────────────────── */
  const badgeCls = state === 'idle' ? 'mdp-badge-idle' : state === 'running' ? 'mdp-badge-running' : 'mdp-badge-stopped';
  const badgeLabel = state === 'idle' ? 'STANDBY' : state === 'running' ? '● RECORDING' : 'MISSION COMPLETE';

  return (
    <>
      <style>{styles}</style>
      <div className="mdp-root">

        {/* Header */}
        <div className="mdp-header">
          <div className="mdp-title">MISSION TIMER</div>
          <div className={`mdp-badge ${badgeCls}`}>{badgeLabel}</div>
        </div>

        {/* Mission Timer */}
        <div className="mdp-timer-block">
          <div className="mdp-timer-label">MISSION TIMER — MAX 08:00</div>
          <div className={`mdp-timer-display ${timerClass()}`}>{fmt(remaining)}</div>
          <div className="mdp-btn-row">
            <button
              id="mission-start-btn"
              className="mdp-btn mdp-btn-start"
              disabled={state === 'running'}
              onClick={handleStart}
            >
              ▶ START
            </button>
            <button
              id="mission-stop-btn"
              className="mdp-btn mdp-btn-stop"
              disabled={state !== 'running'}
              onClick={handleStop}
            >
              ■ STOP
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
