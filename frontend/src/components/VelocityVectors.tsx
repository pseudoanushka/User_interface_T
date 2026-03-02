import React from 'react';

interface VelocityVectorsProps {
    vx?: number;
    vy?: number;
    position?: 'left' | 'right';
}

export const VelocityVectors: React.FC<VelocityVectorsProps> = ({ vx = 0, vy = 0, position = 'right' }) => {
    // In the user's terms, vMax is the resultant of vh and vv, but the user says
    // "if Vy increases then the height of the arrow increases... v max is resultant velocity of the vh and vv"
    const vMax = Math.sqrt(vx * vx + vy * vy);

    // Calculate angle based on joystick (vx, vy). 
    // The user mentions "height of arrow should increase by the amplitude that is tan-1 vx/vy". 
    // Usually tan-1(vx/vy) is the angle. We use atan2 to get the full 360 direction.
    // We map 0deg to UP, so angle is based on vx and vy.
    let angle = Math.atan2(vy, vx) * (180 / Math.PI) - 90;

    if (position === 'left') {
        // The arrow should either go up or down.
        if (Math.abs(vy) > Math.abs(vx)) {
            // If vy is dominant (coming down/up)
            angle = vy > 0 ? 90 : -90;
        } else {
            // If vx is dominant (forward/backward)
            angle = vx >= 0 ? -90 : 90;
        }
    }

    // The length of the arrow should map to Vmax, scaling as it increases/decreases
    // Max length is 58px. To reach that at 3 m/s: 58 / 3 ≈ 19.333
    const arrowLength = Math.min(58, vMax * (58 / 3));

    // Scale the physical size of the arrowhead for the right gauge as velocity increases
    // Max scale addition is 1.5. To cap that at 3 m/s: 1.5 / 3 = 0.5
    const arrowScale = position === 'right' ? 1 + Math.min(vMax * 0.5, 1.5) : 1;

    return (
        <div className={position === 'left' ? "ah-rv-widget" : "ah-vv-box"}>

            {/* Simple gauge with only one arrow */}
            <div style={{
                position: 'relative',
                width: '200px',
                height: '200px',
                borderRadius: '50%',
                border: '1px dashed rgba(34,211,238,0.4)',
                boxShadow: 'inset 0 0 10px rgba(34,211,238,0.1), 0 0 10px rgba(34,211,238,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent'
            }}>
                {/* Crosshairs */}
                <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(100, 116, 139, 0.4)' }} />
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
        </div>
    );
};
