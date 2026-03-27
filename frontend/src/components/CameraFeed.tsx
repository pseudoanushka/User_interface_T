import { useEffect, useRef, useState, useCallback } from 'react';

import { getRpiWsUrl, getRpiUrl, BACKEND_IP } from "../config";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap');

  .gcs-root {
    position: fixed;
    left: 40%;
    top: 1.5%;
    width: 30%;
    height: 68%;
    z-index: 50;
    display: flex;
    flex-direction: column;
    border-radius: 0 0 0 8px;
    overflow: hidden;
    background: #020617;
    border: 1px solid #1a3040;
    box-shadow: 0 0 0 1px #0d1f2d, 0 8px 40px rgba(0,0,0,0.7);
  }

  /* ── Header ── */
  .gcs-header {
    background: #020617;
    border-bottom: 1px solid #1a3040;
    padding: 7px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .gcs-title {
    font-family: 'Rajdhani', sans-serif;
    font-size: clamp(16px, 1.5vw, 28px);
    letter-spacing: 2px;
    color: #dbecf0ff;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gcs-meta {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .gcs-stat {
    font-family: 'Rajdhani', sans-serif;
    font-size: 14px;
    letter-spacing: 1.5px;
    color: #1d4e5f;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .gcs-stat span {
    color: #22a6c0;
  }

  .link-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #1a6632;
    transition: background 0.3s;
  }
  .link-dot.armed   { background: #c0392b; animation: blink 0.9s step-start infinite; }
  .link-dot.airborne{ background: #2980b9; animation: blink 1.4s step-start infinite; }
  .link-dot.ok      { background: #27ae60; }

  @keyframes blink { 50% { opacity: 0.2; } }

  /* ── Camera feed ── */
  .gcs-feed {
    flex: 1;
    position: relative;
    background: #000;
    overflow: hidden;
  }

  .gcs-feed img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Swappable Feed Containers ── */
  .feed-container {
    position: absolute;
    background: #000;
    overflow: hidden;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .feed-container.main {
    inset: 0;
    z-index: 1;
  }

  .feed-container.pip {
    bottom: 10px;
    right: 10px;
    width: 28%;
    aspect-ratio: 16 / 9;
    border: 1px solid rgba(34,166,192,0.4);
    border-radius: 4px;
    z-index: 20;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,0,0,0.8);
  }
  .feed-container.pip:hover {
    border-color: #22a6c0;
    transform: scale(1.02);
  }

  .feed-tag {
    position: absolute;
    top: 6px;
    left: 8px;
    font-family: 'Rajdhani', sans-serif;
    font-size: 8px;
    letter-spacing: 1.5px;
    color: rgba(34,166,192,0.8);
    text-transform: uppercase;
    pointer-events: none;
    z-index: 5;
    background: rgba(2,6,23,0.6);
    padding: 1px 4px;
    border-radius: 2px;
  }
  .feed-container.main .feed-tag {
    font-size: 10px;
    top: 10px;
    left: 26px;
    background: transparent;
  }

  .swap-hint {
    position: absolute;
    bottom: 6px;
    right: 8px;
    font-family: 'Rajdhani', sans-serif;
    font-size: 7px;
    color: rgba(34,166,192,0.5);
    text-transform: uppercase;
    display: none;
  }
  .feed-container.pip .swap-hint { display: block; }

  /* HUD overlays */
  .hud-corner {
    position: absolute;
    width: 14px;
    height: 14px;
    border-color: rgba(34,166,192,0.5);
    border-style: solid;
    pointer-events: none;
  }
  .hud-corner.tl { top: 8px; left: 8px;  border-width: 1px 0 0 1px; }
  .hud-corner.tr { top: 8px; right: 8px; border-width: 1px 1px 0 0; }
  .hud-corner.bl { bottom: 8px; left: 8px;  border-width: 0 0 1px 1px; }
  .hud-corner.br { bottom: 8px; right: 8px; border-width: 0 1px 1px 0; }

  .hud-label {
    position: absolute;
    font-family: 'Rajdhani', sans-serif;
    font-size: 9px;
    letter-spacing: 1.5px;
    color: rgba(34,166,192,0.55);
    pointer-events: none;
    text-transform: uppercase;
  }
  .hud-label.tl { top: 10px; left: 26px; }
  .hud-label.br { bottom: 10px; right: 26px; }

  .hud-crosshair {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .hud-crosshair svg { opacity: 0.25; }

  .no-signal {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: 'Rajdhani', sans-serif;
    font-size: 10px;
    letter-spacing: 2px;
    color: #1a3040;
    text-transform: uppercase;
  }
  .no-signal-icon {
    font-size: 28px;
    opacity: 0.15;
  }

  /* ── Overlay Controls ── */
  .feed-overlay-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 140px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    background: rgba(2, 6, 23, 0.6);
    border: 1px solid rgba(34, 166, 192, 0.3);
    border-radius: 4px;
    padding: 8px 6px;
    backdrop-filter: blur(2px);
    pointer-events: auto;
  }
  .overlay-btn-group {
    display: flex;
    gap: 4px;
    justify-content: center;
  }
  .overlay-btn {
    flex: 1;
    background: rgba(34, 166, 192, 0.1);
    border: 1px solid rgba(34, 166, 192, 0.3);
    color: #dbecf0;
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px;
    padding: 6px 0;
    cursor: pointer;
    border-radius: 2px;
    text-transform: uppercase;
    transition: all 0.2s;
    font-weight: 600;
    text-align: center;
  }
  .overlay-btn:hover {
    background: rgba(34, 166, 192, 0.4);
    border-color: #22a6c0;
  }
  .overlay-btn:active {
    transform: scale(0.95);
  }
  .overlay-btn.danger {
    background: rgba(192, 57, 43, 0.15);
    border-color: rgba(192, 57, 43, 0.4);
    color: #e74c3c;
  }
  .overlay-btn.danger:hover {
    background: rgba(192, 57, 43, 0.4);
    border-color: #c0392b;
  }
  .overlay-label {
    font-family: 'Rajdhani', sans-serif;
    font-size: 9px;
    color: rgba(34, 166, 192, 0.8);
    text-align: center;
    margin-bottom: 4px;
    letter-spacing: 1px;
    border-bottom: 1px solid rgba(34, 166, 192, 0.2);
    padding-bottom: 2px;
  }
  .overlay-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  /* ── Control strip ── */
  .gcs-controls {
    background: #020617;
    border-top: 1px solid #1a3040;
    padding: 10px;
    flex-shrink: 0;
  }

  .btn-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .gcs-btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 10px 8px 8px;
    background: #0a1118;
    border: 1px solid #192530;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Rajdhani', sans-serif;
    transition: background 0.1s, border-color 0.15s;
    overflow: hidden;
  }

  .gcs-btn::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: var(--acc);
    opacity: 0.5;
  }

  .gcs-btn:hover {
    background: #0d1820;
    border-color: var(--acc);
  }

  .gcs-btn:active {
    transform: scale(0.97);
    background: color-mix(in srgb, var(--acc) 10%, #0a1118);
  }

  .gcs-btn.btn-active {
    border-color: var(--acc);
    background: color-mix(in srgb, var(--acc) 8%, #0a1118);
  }

  .btn-label {
    font-size: clamp(14px, 1.3vw, 25px);
    font-weight: 700;
    letter-spacing: 2px;
    color: #b0bec8;
    text-transform: uppercase;
  }

  .btn-sub {
    font-family: 'Rajdhani', sans-serif;
    font-size: clamp(10px, 1vw, 20px);
    letter-spacing: 1px;
    color: var(--acc);
    opacity: 0.6;
    text-transform: uppercase;
  }

  /* confirm dialog inside ARM button */
  .confirm-layer {
    display: none;
    position: absolute;
    inset: 0;
    background: rgba(6,11,16,0.95);
    border-radius: 4px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    z-index: 5;
  }
  .confirm-layer.show { display: flex; }
  .confirm-prompt {
    font-family: 'Rajdhani', sans-serif;
    font-size: 20px;
    letter-spacing: 1.5px;
    color: #c0392b;
    text-transform: uppercase;
  }
  .confirm-row { display: flex; gap: 5px; }
  .confirm-yes, .confirm-no {
    font-family: 'Rajdhani', sans-serif;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 3px 10px;
    border-radius: 2px;
    border: none;
    cursor: pointer;
    text-transform: uppercase;
  }
  .confirm-yes { background: #7b1d1d; color: #ffb4ab; }
  .confirm-no  { background: #0d1820; color: #4a8fa8; border: 1px solid #1a3040; }

  /* log */
  .gcs-log {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Rajdhani', sans-serif;
    font-size: 20px;
    color: #1d4e5f;
    border-top: 1px solid #0f1e28;
    padding-top: 7px;
  }
  .log-ts  { color: #1a3a2a; }
  .log-txt { color: #2d7a8a; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;

export function CameraFeed() {
    const imgRef    = useRef<HTMLImageElement>(null);
    const pipImgRef = useRef<HTMLImageElement>(null);

    const [armed, setArmed] = useState(false);
    const [status, setStatus] = useState<'ok' | 'armed' | 'airborne'>('ok');
    const [logMsg, setLogMsg] = useState('GCS LINK ESTABLISHED');
    const [logTs, setLogTs] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);
    const [bsCamActive, setBsCamActive] = useState(false);   // got at least one BS frame
    const [rpiCamActive, setRpiCamActive] = useState(false); // got at least one RPI frame
    const [isSwapped, setIsSwapped] = useState(false);       // swap main/pip feeds

    const now = () => {
        const d = new Date();
        return [d.getHours(), d.getMinutes(), d.getSeconds()]
            .map(n => String(n).padStart(2, '0')).join(':');
    };

    const log = (msg: string) => {
        setLogTs(now());
        setLogMsg(msg);
    };

    // ── RPi camera feed (binary WS frames) ─────────────────────────────────
    useEffect(() => {
        let active = true;
        setLogTs(now());
        const socket = new WebSocket(getRpiWsUrl());
        console.log("Connecting to video via UDP Bridge:", getRpiWsUrl());
        
        socket.onmessage = async (event) => {
            if (!active) return;
            if (!(event.data instanceof Blob)) return;
            
            const buffer = await event.data.arrayBuffer();
            if (buffer.byteLength < 4) return;
            
            const view = new DataView(buffer);
            const headerLen = view.getUint32(0, true); // true for little-endian
            const headerEnd = 4 + headerLen;
            
            if (buffer.byteLength < headerEnd) return;
            
            const jpegBuffer = buffer.slice(headerEnd);
            const jpegBlob = new Blob([jpegBuffer], { type: 'image/jpeg' });
            
            if (!rpiCamActive) setRpiCamActive(true);
            
            if (imgRef.current) {
                const url = URL.createObjectURL(jpegBlob);
                const oldUrl = imgRef.current.src;
                imgRef.current.src = url;
                if (oldUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(oldUrl);
                }
            }
        };

        socket.onopen = () => console.log("RPi Video WS Connected");
        socket.onerror = (err) => console.error("RPi Video WS Error:", err);
        socket.onclose = () => console.log("RPi Video WS Closed");

        return () => {
            active = false;
            socket.close();
        };
    }, []); // Only connect once on mount

    // ── Base-station camera feed (bs:camera_frame custom events) ───────────
    const onBsFrame = useCallback((e: Event) => {
        const blob = (e as CustomEvent<Blob>).detail;
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        if (pipImgRef.current) pipImgRef.current.src = url;
        setBsCamActive(true);
    }, []);

    useEffect(() => {
        window.addEventListener('bs:camera_frame', onBsFrame);
        return () => window.removeEventListener('bs:camera_frame', onBsFrame);
    }, [onBsFrame]);


    const cmd = async (action: string) => {
        await fetch(`${getRpiUrl()}/${action}`, {
            method: 'GET'
        })
            .then(() => console.log(`Command ${action} sent to RPi`))
            .catch(() => alert('Connection to RPi Failed'));
    };

    const cmdAction = (action: string, displayName: string) => {
        cmd(action);
        log(`CMD: ${displayName}`);
    };

    const handleArm = () => { if (!armed) setShowConfirm(true); };

    const doArm = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowConfirm(false);
        setArmed(true);
        setStatus('armed');
        log('ARMED — motors enabled, clear prop area');
        cmd('arm');
    };

    const cancelArm = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowConfirm(false);
        log('ARM cancelled by operator');
    };

    const handleTakeoff = () => {
        setStatus('airborne');
        log('TAKEOFF initiated — climbing to altitude');
        cmd('takeoff');
        window.dispatchEvent(new Event('mission:start'));
    };

    const handleLand = () => {
        setStatus('ok');
        log('LAND initiated — auto-descent active');
        cmd('land');
        window.dispatchEvent(new Event('mission:stop'));
    };

    const handleDisarm = () => {
        setArmed(false);
        setStatus('ok');
        log('DISARMED — motors disabled');
        cmd('disarm');
        window.dispatchEvent(new Event('mission:stop'));
    };

    const statusLabels = { ok: 'STANDBY', armed: 'ARMED', airborne: 'AIRBORNE' };

    return (
        <>
            <style>{styles}</style>
            <div className="gcs-root">
                {/* Header */}
                <div className="gcs-header">
                    <div className="gcs-title">GROUND CONTROL STATION</div>
                    <div className="gcs-meta">
                        <div className="gcs-stat">
                            IP <span>{BACKEND_IP}</span>
                        </div>
                        <div className="gcs-stat">
                            <div className={`link-dot ${status}`} />
                            <span>{statusLabels[status]}</span>
                        </div>
                    </div>
                </div>

                {/* Camera feed */}
                <div className="gcs-feed">
                    {/* Primary Feed (Drone RPi) */}
                    <div 
                        className={`feed-container ${isSwapped ? 'pip' : 'main'}`}
                        onClick={isSwapped ? () => setIsSwapped(false) : undefined}
                    >
                        <img 
                            ref={imgRef} 
                            alt="RPi Camera Feed" 
                            style={{ display: rpiCamActive ? 'block' : 'none' }} 
                        />
                        {!rpiCamActive && (
                            <div className="no-signal">
                                <div className="no-signal-icon">⊘</div>
                                CAM-01 NO SIGNAL
                            </div>
                        )}
                        <span className="feed-tag">CAM-01 / RGB</span>
                        <span className="swap-hint">⇋ SWAP</span>
                    </div>

                    {/* Secondary Feed (Base Station) */}
                    <div 
                        className={`feed-container ${!isSwapped ? 'pip' : 'main'}`}
                        onClick={!isSwapped ? () => setIsSwapped(true) : undefined}
                    >
                        {bsCamActive 
                            ? <img ref={pipImgRef} alt="Base Station Feed" />
                            : <div className="no-signal">
                                <div className="no-signal-icon">⊘</div>
                                CAM-02 NO SIGNAL
                              </div>
                        }
                        <span className="feed-tag">CAM-02 / BASE</span>
                        <span className="swap-hint">⇋ SWAP</span>
                    </div>

                    {/* Static HUD overlays */}
                    <div className="hud-corner tl" />
                    <div className="hud-corner tr" />
                    <div className="hud-corner bl" />
                    <div className="hud-corner br" />
                    <div className="hud-label br">REC ● LIVE</div>

                    <div className="hud-crosshair">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22a6c0" strokeWidth="0.8">
                            <line x1="12" y1="0" x2="12" y2="9" />
                            <line x1="12" y1="15" x2="12" y2="24" />
                            <line x1="0" y1="12" x2="9" y2="12" />
                            <line x1="15" y1="12" x2="24" y2="12" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </div>

                    {/* Additional RPi Functions Overlay */}
                    <div className="feed-overlay-controls">
                        <div className="overlay-label">FLIGHT MODES</div>
                        <div className="overlay-btn-group">
                            <button className="overlay-btn" onClick={() => cmdAction('auto', 'AUTO ALIGN')}>AUTO</button>
                            <button className="overlay-btn" onClick={() => cmdAction('cancel', 'CANCEL AUTO')}>CANCEL</button>
                            <button className="overlay-btn danger" onClick={() => cmdAction('kill', 'KILL SWITCH')}>KILL</button>
                        </div>
                        
                        <div className="overlay-label" style={{marginTop: '6px'}}>RECORDING</div>
                        <div className="overlay-btn-group">
                            <button className="overlay-btn" onClick={() => cmdAction('start_recording', 'REC START')}>ON</button>
                            <button className="overlay-btn" onClick={() => cmdAction('stop_recording', 'REC STOP')}>OFF</button>
                        </div>

                        <div className="overlay-label" style={{marginTop: '6px'}}>NUDGE & YAW</div>
                        <div className="overlay-grid">
                            <button className="overlay-btn" onClick={() => cmdAction('yaw/l', 'YAW LEFT')}>↶</button>
                            <button className="overlay-btn" onClick={() => cmdAction('nudge/w', 'NUDGE FWD')}>W</button>
                            <button className="overlay-btn" onClick={() => cmdAction('yaw/r', 'YAW RIGHT')}>↷</button>
                            
                            <button className="overlay-btn" onClick={() => cmdAction('nudge/a', 'NUDGE LEFT')}>A</button>
                            <button className="overlay-btn" onClick={() => cmdAction('recenter', 'RECENTER')}>●</button>
                            <button className="overlay-btn" onClick={() => cmdAction('nudge/d', 'NUDGE RIGHT')}>D</button>
                            
                            <button className="overlay-btn" onClick={() => cmdAction('nudge/dn', 'NUDGE DOWN')}>▼</button>
                            <button className="overlay-btn" onClick={() => cmdAction('nudge/s', 'NUDGE BWD')}>S</button>
                            <button className="overlay-btn" onClick={() => cmdAction('nudge/up', 'NUDGE UP')}>▲</button>
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="gcs-controls">
                    <div className="btn-grid">
                        {/* ARM */}
                        <button
                            className={`gcs-btn${armed ? ' btn-active' : ''}`}
                            style={{ '--acc': '#27ae60' } as React.CSSProperties}
                            onClick={handleArm}
                        >
                            <div className="btn-label">ARM</div>
                            <div className="btn-sub">PRE-FLIGHT</div>
                            <div className={`confirm-layer${showConfirm ? ' show' : ''}`}>
                                <div className="confirm-prompt">CONFIRM ARM?</div>
                                <div className="confirm-row">
                                    <button className="confirm-yes" onClick={doArm}>CONFIRM</button>
                                    <button className="confirm-no" onClick={cancelArm}>CANCEL</button>
                                </div>
                            </div>
                        </button>

                        {/* TAKEOFF */}
                        <button
                            className="gcs-btn"
                            style={{ '--acc': '#2980b9' } as React.CSSProperties}
                            onClick={handleTakeoff}
                        >
                            <div className="btn-label">TAKEOFF</div>
                            <div className="btn-sub">VTOL ASCENT</div>
                        </button>

                        {/* LAND */}
                        <button
                            className="gcs-btn"
                            style={{ '--acc': '#e67e22' } as React.CSSProperties}
                            onClick={handleLand}
                        >
                            <div className="btn-label">LAND</div>
                            <div className="btn-sub">AUTO-LAND</div>
                        </button>

                        {/* DISARM */}
                        <button
                            className="gcs-btn"
                            style={{ '--acc': '#c0392b' } as React.CSSProperties}
                            onClick={handleDisarm}
                        >
                            <div className="btn-label">DISARM</div>
                            <div className="btn-sub">SAFE MODE</div>
                        </button>
                    </div>

                    {/* Log bar */}
                    <div className="gcs-log">
                        <span className="log-ts">{logTs}</span>
                        <span className="log-txt">// {logMsg}</span>
                    </div>
                </div>
            </div>
        </>
    );
}