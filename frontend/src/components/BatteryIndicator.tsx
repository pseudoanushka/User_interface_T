import React from 'react';

interface BatteryIndicatorProps {
    batteryPercent?: number;
    batteryV?: number;
    batteryA?: number;
}

export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ batteryPercent = 0, batteryV, batteryA }) => {
    const pct       = Math.min(100, Math.max(0, batteryPercent));
    const isDanger  = pct <= 20;
    const barColor  = isDanger ? '#ef4444' : '#22d3ee';
    const glowOuter = isDanger ? 'rgba(239,68,68,0.4)' : 'rgba(34,211,238,0.4)';
    const glowInner = isDanger ? 'rgba(239,68,68,0.3)' : 'rgba(34,211,238,0.3)';
    const capGlow   = isDanger ? 'rgba(239,68,68,0.6)' : 'rgba(34,211,238,0.6)';

    // 4 segments, top → bottom; top segment is last to fill, first to empty
    const filled = (threshold: number) => pct > threshold
        ? barColor
        : 'transparent';

    return (
        <div
            className={`ah-battery-container${isDanger ? ' ah-battery-danger' : ''}`}
            style={{ color: barColor, textShadow: `0 0 12px ${glowOuter}`, flexDirection: 'column' }}
        >
            <div
                className="ah-battery-icon"
                style={{
                    borderColor: barColor,
                    borderWidth: '2px',
                    boxShadow: `0 0 16px ${glowOuter}, inset 0 0 14px ${glowInner}`,
                    backgroundColor: 'rgba(2,6,23,0.5)',
                    backdropFilter: 'blur(4px)',
                }}
            >
                <div className="ah-battery-cap" style={{ backgroundColor: barColor, boxShadow: `0 -1px 6px ${capGlow}` }} />
                {/* Segment 1 – top, fills last (>75%) */}
                <div className="ah-battery-segment" style={{ backgroundColor: filled(75), borderColor: barColor }} />
                {/* Segment 2 – fills at >50% */}
                <div className="ah-battery-segment" style={{ backgroundColor: filled(50), borderColor: barColor }} />
                {/* Segment 3 – fills at >25% */}
                <div className="ah-battery-segment" style={{ backgroundColor: filled(25), borderColor: barColor }} />
                {/* Segment 4 – bottom, fills first (>0%) */}
                <div className="ah-battery-segment" style={{ backgroundColor: filled(0),  borderColor: barColor }} />
            </div>
            <div className="ah-battery-text" style={{ fontSize: '0.68rem', marginTop: '4px', textAlign: 'center' }}>
                <div>{pct.toFixed(0)}%{isDanger ? ' ⚠' : ''}</div>
                <div>{batteryV  != null ? Number(batteryV).toFixed(1)  : '0.0'} V</div>
                <div>{batteryA  != null ? Number(batteryA).toFixed(1)  : '0.0'} A</div>
            </div>
        </div>
    );
};
