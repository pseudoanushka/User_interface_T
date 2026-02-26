import React from 'react';

export const ResultantVelocityWidget: React.FC<{ vx: number; vy: number; vh: number }> = ({ vx, vy, vh }) => {
    const [hovered, setHovered] = React.useState(false);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`ah-rv-widget ${hovered ? 'hovered' : ''}`}
        >
            {!hovered ? (
                <div className="ah-rv-initial">
                    <span className="ah-rv-initial-label">Vr:</span>
                    <span className="ah-rv-initial-val">{Math.abs(vh).toFixed(2)} m/s</span>
                </div>
            ) : (
                <div className="ah-rv-hover">
                    <div className="ah-rv-title">
                        Resultant Velocity Vector
                    </div>
                    <div className="ah-rv-row">
                        <span>vX Component:</span>
                        <span className="ah-rv-val-blue">{vx.toFixed(2)} m/s</span>
                    </div>
                    <div className="ah-rv-row ah-rv-row-mb">
                        <span>vY Component:</span>
                        <span className="ah-rv-val-blue">{vy.toFixed(2)} m/s</span>
                    </div>

                    <div className="ah-rv-grid">
                        <div className="ah-rv-grid-bg" />
                        <div className="ah-rv-vec-x" style={{ width: `${Math.min(100, Math.abs(vx) * 10)}%` }} />
                        <div className="ah-rv-vec-y" style={{ height: `${Math.min(100, Math.abs(vy) * 10)}%` }} />
                        <div className="ah-rv-vec-r" style={{
                            width: `${Math.min(100, Math.abs(vh) * 10)}%`,
                            transform: `rotate(${-Math.atan2(Math.abs(vy), Math.abs(vx)) * (180 / Math.PI)}deg)`
                        }} />
                    </div>

                    <div className="ah-rv-footer">
                        <span className="ah-rv-footer-label">Resultant Velocity (Vr):</span>
                        <span className="ah-rv-footer-val">{Math.abs(vh).toFixed(2)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
