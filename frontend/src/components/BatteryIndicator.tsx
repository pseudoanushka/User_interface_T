import React from 'react';

interface BatteryIndicatorProps {
    batteryPercent?: number;
    batteryV?: number;
    batteryA?: number;
}

export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ batteryPercent, batteryV, batteryA }) => {
    return (
        <div className="ah-battery-container">
            <div className="ah-battery-icon">
                <div className="ah-battery-cap" />
                <div className="ah-battery-segment" />
                <div className="ah-battery-segment" />
                <div className="ah-battery-segment" />
            </div>
            <div className="ah-battery-text">
                <div>{batteryPercent !== undefined ? batteryPercent.toFixed(0) : '0'} %</div>
                <div>{batteryV !== undefined ? batteryV.toFixed(1) : '0'} V</div>
                <div>{batteryA !== undefined ? batteryA.toFixed(1) : '0'} A</div>
            </div>
        </div>
    );
};
