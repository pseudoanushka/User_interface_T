import React from 'react';

interface BatteryIndicatorProps {
    batteryPercent?: number;
    batteryV?: number;
    batteryA?: number;
}

export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ batteryPercent = 0, batteryV, batteryA }) => {
    return (
        <div className="ah-battery-container" style={{ color: '#22d3ee', textShadow: '0 0 8px rgba(34,211,238,0.5)', flexDirection: 'column' }}>
            <div className="ah-battery-icon" style={{ borderColor: '#22d3ee', boxShadow: '0 0 10px rgba(34,211,238,0.2), inset 0 0 8px rgba(34,211,238,0.1)' }}>
                <div className="ah-battery-cap" style={{ backgroundColor: '#22d3ee', boxShadow: '0 -2px 5px rgba(34,211,238,0.4)' }} />
                <div className="ah-battery-segment" style={{ backgroundColor: batteryPercent > 66 ? '#22d3ee' : 'transparent', borderColor: '#22d3ee' }} />
                <div className="ah-battery-segment" style={{ backgroundColor: batteryPercent > 33 ? '#22d3ee' : 'transparent', borderColor: '#22d3ee' }} />
                <div className="ah-battery-segment" style={{ backgroundColor: batteryPercent > 0 ? '#22d3ee' : 'transparent', borderColor: '#22d3ee' }} />
            </div>
            <div className="ah-battery-text" style={{ fontSize: '1.2rem', marginTop: '4px', textAlign: 'center' }}>
                <div>{batteryPercent !== undefined && batteryPercent !== null ? Number(batteryPercent).toFixed(0) : '0'}%</div>
                <div>{batteryV !== undefined && batteryV !== null ? Number(batteryV).toFixed(1) : '0.0'} V</div>
                <div>{batteryA !== undefined && batteryA !== null ? Number(batteryA).toFixed(1) : '0.0'} A</div>
            </div>
        </div>
    );
};
