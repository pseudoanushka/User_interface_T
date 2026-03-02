import React from 'react';

export const ResultantVelocityWidget: React.FC<{ vx: number; vy: number; vh: number }> = ({ vh }) => {
    return (
        <div className="ah-rv-widget" style={{ color: '#22d3ee', textShadow: '0 0 8px rgba(34,211,238,0.5)' }}>
            <div className="ah-rv-initial">
                <span className="ah-rv-initial-label">Vr:</span>
                <span className="ah-rv-initial-val" style={{ color: '#22d3ee' }}>{Math.abs(vh).toFixed(2)} m/s</span>
            </div>
        </div>
    );
};
