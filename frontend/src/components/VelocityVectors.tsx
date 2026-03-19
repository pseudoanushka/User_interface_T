import React from 'react';

interface VelocityVectorsProps {
    vx?: number;
    vy?: number;
    vz?: number;
    position?: 'left' | 'right';
}

export const VelocityVectors: React.FC<VelocityVectorsProps> = ({ vx = 0, vy = 0, vz = 0, position = 'right' }) => {
    // For the right gauge (Vh), vMax is the resultant of vx and vy
    // For the left gauge (Vv), vMax is simply the absolute value of vz
    const vMax = position === 'left' ? Math.abs(vz) : Math.sqrt(vx * vx + vy * vy);

    // Calculate angle based on joystick (vx, vy) for the right gauge.
    let angle = Math.atan2(vy, vx) * (180 / Math.PI) - 90;

    if (position === 'left') {
        // For the left gauge (Vertical Velocity):
        // If vz is positive, point UP (but since it's inverted, we swap the angles)
        angle = vz >= 0 ? 90 : -90;
    }

    // The length of the arrow should map to Vmax, scaling as it increases/decreases
    // Max reference value is set to 10 so it grows proportionally for values like 7.8 without immediately hitting max.
    const maxReference = 3; // Arrow reaches max length at 3m / 3 m/s
    const arrowLength = Math.min(58, vMax * (58 / maxReference));

    // The head of the arrow should not increase in size, only the tail.
    const arrowScale = 1;

    return (
        <div className={position === 'left' ? "ah-rv-widget" : "ah-vv-box"} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Simple gauge with only one arrow */}
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
                backdropFilter: 'blur(4px)'
            }}>
                {/* Crosshairs */}
                {position !== 'left' && (
                    <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(100, 116, 139, 0.4)' }} />
                )}
                <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(100, 116, 139, 0.4)' }} />

                {/* Center dot */}
                <div style={{ width: '4px', height: '4px', background: '#22d3ee', borderRadius: '50%', zIndex: 2, boxShadow: '0 0 5px #22d3ee' }} />

                {/* The single arrow */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${arrowLength}px`,
                    height: '2px',
                    backgroundColor: '#991b1b',
                    transformOrigin: '0% 50%',
                    transform: `translateY(-50%) rotate(${angle}deg)`,
                    transition: 'all 0.1s linear',
                    zIndex: 3,
                    boxShadow: '0 0 6px #991b1b'
                }}>
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="#991b1b"
                        style={{
                            position: 'absolute',
                            right: '-9px',
                            top: '50%',
                            transform: `translateY(-50%) scale(${arrowScale})`,
                            transition: 'all 0.1s linear',
                            filter: 'drop-shadow(0 0 4px #991b1b)'
                        }}
                    >
                        <path d="M3 21l6-9-6-9 18 9-18 9z" />
                    </svg>
                </div>
            </div>

            {/* External Gauge Label */}
            <div style={{
                marginTop: '12px',
                color: '#22d3ee',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                textShadow: '0 0 8px rgba(34,211,238,0.8)'
            }}>
                {position === 'left' ? 'Vv' : 'Vh'}
            </div>
        </div>
    );
};
