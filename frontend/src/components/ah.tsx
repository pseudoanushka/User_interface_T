import React, { useRef, useEffect } from 'react';

interface ArtificialHorizonProps {
  pitch: number;
  roll: number;
  yaw: number;
  z?: number;
  dronePhase?: string;
  children?: React.ReactNode;
}

export function ArtificialHorizon({ pitch, roll, yaw, z = 0, dronePhase = 'STANDBY', children }: ArtificialHorizonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    ctx.fillStyle = '#78360fb3';
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
    ctx.strokeStyle = '#f1eeeeff';
    ctx.lineWidth = Math.max(1, radius * 0.005);
    const pitchFontSize = Math.max(24, radius * 0.2);
    ctx.font = `${pitchFontSize}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';

    // Generate pitch ladder marks dynamically around the current pitch
    // This creates an infinite sliding window (popping smallest, adding next)
    const startPitch = Math.floor((pitch - 60) / 10) * 10;
    const endPitch = Math.ceil((pitch + 60) / 10) * 10;

    for (let angle = startPitch; angle <= endPitch; angle += 10) {
      if (angle === 0) continue; // skip 0 (horizon line)

      const y = pitchOffset - (angle / 90) * radius * 0.8;

      // Only draw if within the clipping area of the circle
      if (Math.abs(y) < radius) {
        // ... draw
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
    ctx.strokeStyle = '#a30c0cff';
    ctx.lineWidth = Math.max(2, radius * 0.02);
    ctx.fillStyle = '#d2c198ff';

    // Center dot
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(2, radius * 0.02), 0, 2 * Math.PI);
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
    ctx.strokeStyle = '#050608ff';
    ctx.lineWidth = Math.max(2, radius * 0.01);
    ctx.fillStyle = '#0a0b0cff';

    const rollMarks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];

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
        const rollFontSize = Math.max(18, radius * 0.12);
        ctx.font = `${rollFontSize}px monospace`;
        ctx.fillStyle = '#000000'; // Change color of angle measurements to black
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

  // Phase → color mapping
  const phaseColor: Record<string, string> = {
    'STANDBY':       '#475569',
    'ARMED':         '#f59e0b',
    'AIRBORNE':      '#22a6c0',
    'PT-ALIGNING':   '#60a5fa',
    'PT-CLIMBING':   '#34d399',
    'PT-HOVERING':   '#a78bfa',
    'PT-AUTOLAND':   '#f97316',
    'ALIGNING':      '#60a5fa',
    'DESCENDING':    '#f97316',
    'FINAL APPROACH': '#ef4444',
    'AUTO':          '#22d3ee',
    'OFFLINE':       '#1e293b',
  };
  const col = phaseColor[dronePhase] ?? '#22a6c0';
  const isActive = !['STANDBY', 'OFFLINE'].includes(dronePhase);

  return (
    <div className="ah-panel">
      {children}
      <div className="ah-title">

      </div>

      <div className="ah-z-tape" aria-label="Z height reference">
        <div className="ah-z-tape-track">
          {[-2, -1, 0, 1, 2].map((offset) => {
            const value = z + offset;
            return (
              <div className={`ah-z-tick${offset === 0 ? ' active' : ''}`} key={offset}>
                <span className="ah-z-mark" />
                <span className="ah-z-value">{value.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <div className="ah-z-pointer">Z {z.toFixed(2)}</div>
      </div>

      {/* Wrapper for Canvas and Absolute Overlay */}
      <div className="ah-wrapper">
        <canvas
          ref={canvasRef}
          width={1500}
          height={1500}
          className="ah-canvas"
          style={{ width: '185px', maxWidth: '185px', height: 'auto', aspectRatio: '1/1', borderRadius: '50%' }}
        />

        {/* INTERNAL OVERLAY ADDITION */}
        <div className="ah-overlay">
        </div>
      </div>

      {/* ── Drone phase status box ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
        padding: '7px 18px',
        background: 'rgba(2,6,23,0.85)',
        border: `1px solid ${col}44`,
        borderRadius: '4px',
        boxShadow: isActive ? `0 0 14px ${col}33` : 'none',
        transition: 'all 0.4s ease',
        maxWidth: '185px',
        margin: '14px auto 0',
      }}>
        {/* Blinking indicator dot */}
        <span style={{
          display: 'inline-block',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: col,
          flexShrink: 0,
          animation: isActive ? 'ah-phase-blink 1.2s step-start infinite' : 'none',
          boxShadow: `0 0 8px ${col}`,
        }} />
        <span style={{
          fontFamily: "'Rajdhani', monospace",
          fontSize: '14px',
          fontWeight: 700,
          letterSpacing: '2px',
          color: col,
          textTransform: 'uppercase',
        }}>{dronePhase}</span>
        <style>{`
          @keyframes ah-phase-blink { 50% { opacity: 0.25; } }
        `}</style>
      </div>
    </div>
  );
}
