import { useRef, useEffect } from 'react';
import { Compass } from './Compass';
import { ResultantVelocityWidget } from './ResultantVelocityWidget';
import { BatteryIndicator } from './BatteryIndicator';
import { VelocityVectors } from './VelocityVectors';

interface ArtificialHorizonProps {
  pitch: number; // degrees
  roll: number; // degrees
  yaw: number; // degrees
  batteryPercent?: number;
  batteryV?: number;
  batteryA?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  mode?: string;
  armed?: boolean;
}

export function ArtificialHorizon({ pitch, roll, yaw, batteryPercent, batteryV, batteryA, vx = 0, vy = 0, vz = 0, mode = "UNKNOWN", armed = false }: ArtificialHorizonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const vh = Math.sqrt(vx * vx + vy * vy);
  const vv = vz;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 20;

    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);

    // Draw outer circle
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.stroke();



    // Apply roll rotation
    ctx.rotate((-roll * Math.PI) / 180);

    // Sky (blue)
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();

    // Ground (brown)
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();

    // Apply pitch offset
    const pitchOffset = (pitch / 90) * radius * 0.8;

    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, radius * 0.01);
    ctx.beginPath();
    ctx.moveTo(-radius, pitchOffset);
    ctx.lineTo(radius, pitchOffset);
    ctx.stroke();

    // Pitch ladder
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, radius * 0.005);
    const pitchFontSize = Math.max(12, radius * 0.12);
    ctx.font = `${pitchFontSize}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';

    for (let angle = -60; angle <= 60; angle += 10) {
      if (angle === 0) continue;

      const y = pitchOffset - (angle / 90) * radius * 0.8;
      if (Math.abs(y) < radius) {
        const lineWidth = angle % 20 === 0 ? radius * 0.1 : radius * 0.05;

        ctx.beginPath();
        ctx.moveTo(-lineWidth, y);
        ctx.lineTo(lineWidth, y);
        ctx.stroke();

        if (angle % 20 === 0) {
          ctx.fillText(`${angle}`, -lineWidth - 5, y + pitchFontSize * 0.3);
          ctx.textAlign = 'left';
          ctx.fillText(`${angle}`, lineWidth + 5, y + pitchFontSize * 0.3);
          ctx.textAlign = 'right';
        }
      }
    }

    ctx.restore();

    // Draw fixed aircraft symbol
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(2, radius * 0.01);
    ctx.fillStyle = '#fbbf24';

    // Center dot
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(2, radius * 0.015), 0, 2 * Math.PI);
    ctx.fill();

    // Wings
    ctx.beginPath();
    ctx.moveTo(centerX - radius * 0.15, centerY);
    ctx.lineTo(centerX - radius * 0.04, centerY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + radius * 0.15, centerY);
    ctx.lineTo(centerX + radius * 0.04, centerY);
    ctx.stroke();

    // Center marker
    ctx.beginPath();
    ctx.moveTo(centerX - radius * 0.04, centerY);
    ctx.lineTo(centerX - radius * 0.025, centerY - radius * 0.015);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + radius * 0.04, centerY);
    ctx.lineTo(centerX + radius * 0.025, centerY - radius * 0.015);
    ctx.stroke();

    // Roll scale
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = Math.max(2, radius * 0.01);
    ctx.fillStyle = '#94a3b8';

    let rollMarks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];

    while (roll > rollMarks[rollMarks.length - 1]) {
      rollMarks.shift();
      const lastMark = rollMarks[rollMarks.length - 1];
      const secondLastMark = rollMarks[rollMarks.length - 2];
      rollMarks.push(lastMark + (lastMark - secondLastMark));
    }

    while (roll < rollMarks[0]) {
      rollMarks.pop();
      const firstMark = rollMarks[0];
      const secondMark = rollMarks[1];
      rollMarks.unshift(firstMark - (secondMark - firstMark));
    }

    rollMarks.forEach((mark) => {
      const angle = (mark * Math.PI) / 180;
      const x1 = centerX + (radius - radius * 0.03) * Math.sin(angle);
      const y1 = centerY - (radius - radius * 0.03) * Math.cos(angle);
      const x2 = centerX + radius * Math.sin(angle);
      const y2 = centerY - radius * Math.cos(angle);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Only draw text for major roll marks to avoid clutter
      if (Math.abs(mark) % 30 === 0 || (Math.abs(mark) % 15 === 0 && Math.abs(mark) >= 45)) {
        ctx.save();
        const rollFontSize = Math.max(10, radius * 0.06);
        ctx.font = `${rollFontSize}px monospace`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Push the text slightly further inward than the mark
        const textX = centerX + (radius - radius * 0.1) * Math.sin(angle);
        const textY = centerY - (radius - radius * 0.1) * Math.cos(angle);

        // Rotate text to match the angle for a circular look
        ctx.translate(textX, textY);
        ctx.rotate(angle);
        ctx.fillText(`${Math.abs(mark)}°`, 0, 0);
        ctx.restore();
      }
    });

    // Roll indicator (triangle)
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((-roll * Math.PI) / 180);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(0, -radius + radius * 0.015);
    ctx.lineTo(-radius * 0.025, -radius + radius * 0.045);
    ctx.lineTo(radius * 0.025, -radius + radius * 0.045);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

  }, [pitch, roll, yaw]);

  return (
    <div className="ah-panel">
      <div className="ah-title">
        ARTIFICIAL HORIZON
      </div>

      {/* Wrapper for Canvas and Absolute Overlay */}
      <div className="ah-wrapper">
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className="ah-canvas"
        />

        {/* INTERNAL OVERLAY ADDITION */}
        <div className="ah-overlay">

          {/* 2. Velocity axis labels (Top-right corner) */}
          <VelocityVectors vh={vh} vv={vv} />

          {/* 3. Bottom-left corner Compass widget */}
          <div className="ah-compass-container">
            <Compass heading={yaw} />
          </div>

          {/* 4. Bottom-right corner Battery indicator block */}
          <BatteryIndicator batteryPercent={batteryPercent} batteryV={batteryV} batteryA={batteryA} />

          {/* 5. Top-left corner: Hoverable Velocity Vector Widget */}
          <ResultantVelocityWidget vx={vx} vy={vy} vh={vh} />

        </div>
      </div>

      <div className="ah-stats-grid">
        <div className="ah-stat-item">
          <div className="ah-stat-label">PITCH</div>
          <div className="ah-stat-value">{pitch.toFixed(1)}°</div>
        </div>
        <div className="ah-stat-item">
          <div className="ah-stat-label">ROLL</div>
          <div className="ah-stat-value">{roll.toFixed(1)}°</div>
        </div>
        <div className="ah-stat-item">
          <div className="ah-stat-label">YAW</div>
          <div className="ah-stat-value">{yaw.toFixed(1)}°</div>
        </div>
      </div>

      <div className="ah-mode-arm-container">
        <div className="ah-mode-text">
          <span>MODE: </span>
          <span className="ah-mode-val">{mode}</span>
        </div>
        <div className="ah-arm-text">
          <span>ARM: </span>
          <span className={armed ? 'ah-arm-val-armed' : 'ah-arm-val-disarmed'}>{armed ? 'ARMED' : 'DISARMED'}</span>
        </div>
      </div>
    </div>
  );
}
