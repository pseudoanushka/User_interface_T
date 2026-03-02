import React from 'react';

interface CompassProps {
    /** The compass heading in degrees (0-360) */
    heading: number;
}

export const Compass: React.FC<CompassProps> = ({ heading }) => {
    return (
        <div style={{ fontFamily: 'inherit' }}>
            <div className="relative flex items-center justify-center rounded-full"
                style={{
                    width: '200px',
                    height: '200px',
                    background: 'rgba(2,6,23,0.5)',
                    boxShadow: 'inset 0 0 20px rgba(34,211,238,0.3), 0 0 0 2px rgba(34,211,238,0.6), 0 0 15px rgba(34,211,238,0.2)',
                    backdropFilter: 'blur(6px)'
                }}>

                {/* N and S Markets */}
                <span className="absolute text-sm font-bold tracking-widest text-[#22d3ee] top-3 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">N</span>
                <span className="absolute text-sm font-bold tracking-widest text-[#94a3b8] bottom-3">S</span>

                {/* Outer Tick Ring */}
                <div className="absolute w-[80%] h-[80%] rounded-full opacity-60 pointer-events-none"
                    style={{
                        background: 'repeating-conic-gradient(from 0deg, transparent 0deg, transparent 4deg, rgba(148,163,184,0.3) 4deg, rgba(148,163,184,0.3) 5deg)'
                    }}>
                </div>

                {/* Inner Ring */}
                <div className="absolute w-[65%] h-[65%] border-2 border-[rgba(34,211,238,0.6)] rounded-full opacity-100 backdrop-blur-md"></div>

                {/* Double Needle rotating with heading */}
                <div
                    className="absolute top-0 left-0 w-full h-full transition-transform duration-300 ease-out pointer-events-none"
                    style={{ transform: `rotate(${heading}deg)` }}
                >
                    {/* Red North Needle */}
                    <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-0 h-0 
                                    border-l-[10px] border-l-transparent 
                                    border-r-[10px] border-r-transparent 
                                    border-b-[60px] border-b-[#dc2626] drop-shadow-[0_0_8px_rgba(220,38,38,0.6)] mb-[6px]">
                    </div>

                    {/* Blue South Needle */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-0 h-0 
                                    border-l-[10px] border-l-transparent 
                                    border-r-[10px] border-r-transparent 
                                    border-t-[60px] border-t-[#2563eb] drop-shadow-[0_0_8px_rgba(37,99,235,0.6)] mt-[6px]">
                    </div>
                </div>

                {/* Center dot */}
                <div className="absolute w-4 h-4 bg-[#1e293b] border-[2.5px] border-white rounded-full z-10"
                    style={{ boxShadow: '0 0 10px rgba(0,0,0,0.8)' }}>
                </div>
            </div>

            <div className="mt-4 text-xl font-bold tracking-wider text-[#22d3ee]" style={{ textShadow: '0 0 8px rgba(34,211,238,0.5)', marginLeft: '80px' }}>
                {Math.round(heading).toString().padStart(3, '0')}°
            </div>
        </div>
    );
};
