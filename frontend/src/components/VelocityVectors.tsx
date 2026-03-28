import React from 'react';

interface VelocityVectorsProps {
    vx?: number;
    vy?: number;
    vz?: number;
    position?: 'left' | 'right';
}

// ─── Scientific Calibration ──────────────────────────────────────────────────
//
// From real flight CSV data (mission_20260328_085206.csv):
//   • Ground idle:  vz ≈ ±0.003 m/s  (pure sensor noise)
//   • Initial lift: vz ≈ -0.52 m/s   (first detectable takeoff in AUTO mode)
//   • Cruise climb: vz ≈ -0.05–0.20 m/s
//   • Descent:      vz ≈ +0.05–0.18 m/s
//   • Horizontal:   speed_h ≈ 0.04–0.26 m/s nominal, up to 0.55 m/s
//
// Arrow length mapping uses square-root compression:
//   length = min(MAX_PX, sqrt(|v| / REF) * MAX_PX)
//
// This gives:
//   |v| = 0         → 0 px  (no motion, arrow hidden)
//   |v| = REF * 0.1 → ~32% deflection  (very slow movement visible)
//   |v| = REF       → 100% deflection  (design full-scale speed)
//   |v| > REF       → clamped at MAX_PX (over-speed shown at max)
//
// Vv REF = 0.5 m/s  → takeoff at -0.52 m/s gives ~100% deflection
// Vh REF = 0.3 m/s  → cruise at 0.25 m/s gives ~91% deflection
//
// Dead-zone = 0.005 m/s to suppress sensor noise at rest.
// ─────────────────────────────────────────────────────────────────────────────

const DEAD_ZONE = 0.005;   // m/s – below this, arrow is invisible
const MAX_PX = 72;         // maximum arrow shaft length in pixels

// Square-root-compressed normalised scale: √(|v| / ref), clamped [0,1]
function sqrtScale(v: number, ref: number): number {
    return Math.min(1, Math.sqrt(Math.abs(v) / ref));
}

export const VelocityVectors: React.FC<VelocityVectorsProps> = ({
    vx = 0,
    vy = 0,
    vz = 0,
    position = 'right',
}) => {

    // ── Left gauge: Vv (vertical velocity) ────────────────────────────────────
    // NED convention: vz < 0 → ascending (arrow points UP = -90°)
    //                 vz > 0 → descending (arrow points DOWN = +90°)
    // Ref = 0.5 m/s gives full deflection at takeoff (~0.52 m/s observed).
    const VV_REF = 0.5;

    // ── Right gauge: Vh (horizontal velocity) ─────────────────────────────────
    // Direction: atan2(vy, vx) in ENU-style screen coords.
    // Note: rotate by -90° so "forward" (+x) maps to "up" on the gauge circle.
    // Ref = 0.3 m/s gives near-full deflection at typical cruise speed.
    const VH_REF = 0.3;

    let angle: number;
    let vMag: number;
    let arrowLength: number;

    if (position === 'left') {
        // ── Vv gauge ──────────────────────────────────────────────────────────
        vMag = Math.abs(vz);
        arrowLength = vMag < DEAD_ZONE ? 0 : sqrtScale(vz, VV_REF) * MAX_PX;
        // UP = ascending (vz < 0),  DOWN = descending (vz > 0)
        angle = vz <= 0 ? -90 : 90;
    } else {
        // ── Vh gauge ──────────────────────────────────────────────────────────
        vMag = Math.sqrt(vx * vx + vy * vy);
        arrowLength = vMag < DEAD_ZONE ? 0 : sqrtScale(vMag, VH_REF) * MAX_PX;
        // atan2(vy, vx) gives mathematical angle; subtract 90° so North (+x) → up
        angle = Math.atan2(vy, vx) * (180 / Math.PI) - 90;
    }

    const isMoving = arrowLength > 0;

    return (
        <div
            className={position === 'left' ? 'ah-rv-widget' : 'ah-vv-box'}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
            {/* Circular gauge */}
            <div style={{
                position: 'relative',
                width: '200px',
                height: '200px',
                borderRadius: '50%',
                border: '2px dashed rgba(34,211,238,0.8)',
                boxShadow: 'inset 0 0 20px rgba(34,211,238,0.3), 0 0 15px rgba(34,211,238,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(2,6,23,0.5)',
                backdropFilter: 'blur(4px)',
            }}>
                {/* Crosshairs */}
                {position !== 'left' && (
                    <div style={{
                        position: 'absolute',
                        width: '1px',
                        height: '100%',
                        background: 'rgba(100, 116, 139, 0.4)',
                    }} />
                )}
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '1px',
                    background: 'rgba(100, 116, 139, 0.4)',
                }} />

                {/* Center dot */}
                <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#22d3ee',
                    borderRadius: '50%',
                    zIndex: 2,
                    boxShadow: '0 0 5px #22d3ee',
                }} />

                {/* Arrow shaft — only rendered when velocity exceeds dead-zone */}
                {isMoving && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: `${arrowLength}px`,
                        height: '2px',
                        backgroundColor: '#991b1b',
                        transformOrigin: '0% 50%',
                        transform: `translateY(-50%) rotate(${angle}deg)`,
                        // 80 ms ease-out: fast initial response, no lag on slow changes
                        transition: 'width 80ms ease-out, transform 80ms ease-out',
                        zIndex: 3,
                        boxShadow: '0 0 6px #991b1b',
                    }}>
                        {/* Arrowhead */}
                        <svg
                            width="30"
                            height="30"
                            viewBox="0 0 24 24"
                            fill="#991b1b"
                            style={{
                                position: 'absolute',
                                right: '-9px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                transition: 'opacity 80ms ease-out',
                                filter: 'drop-shadow(0 0 4px #991b1b)',
                            }}
                        >
                            <path d="M3 21l6-9-6-9 18 9-18 9z" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Label with live value */}
            <div style={{
                marginTop: '8px',
                color: '#22d3ee',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                textShadow: '0 0 8px rgba(34,211,238,0.8)',
                textAlign: 'center',
                lineHeight: '1.4',
            }}>
                <div>{position === 'left' ? 'Vv' : 'Vh'}</div>
            </div>
        </div>
    );
};
