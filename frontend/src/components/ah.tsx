import { useRef, useEffect } from 'react';

interface ArtificialHorizonProps {
  pitch: number; // degrees
  roll: number; // degrees
  yaw: number; // degrees
}

export function ArtificialHorizon({ pitch, roll, yaw }: ArtificialHorizonProps) {
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
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();

    // Apply pitch offset
    const pitchOffset = (pitch / 90) * radius * 0.8;

    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-radius, pitchOffset);
    ctx.lineTo(radius, pitchOffset);
    ctx.stroke();

    // Pitch ladder
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';

    for (let angle = -60; angle <= 60; angle += 10) {
      if (angle === 0) continue;

      const y = pitchOffset - (angle / 90) * radius * 0.8;
      if (Math.abs(y) < radius) {
        const lineWidth = angle % 20 === 0 ? 40 : 20;

        ctx.beginPath();
        ctx.moveTo(-lineWidth, y);
        ctx.lineTo(lineWidth, y);
        ctx.stroke();

        if (angle % 20 === 0) {
          ctx.fillText(`${angle}`, -lineWidth - 5, y + 4);
          ctx.textAlign = 'left';
          ctx.fillText(`${angle}`, lineWidth + 5, y + 4);
          ctx.textAlign = 'right';
        }
      }
    }

    ctx.restore();

    // Draw fixed aircraft symbol
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#fbbf24';

    // Center dot
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Wings
    ctx.beginPath();
    ctx.moveTo(centerX - 50, centerY);
    ctx.lineTo(centerX - 15, centerY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + 50, centerY);
    ctx.lineTo(centerX + 15, centerY);
    ctx.stroke();

    // Center marker
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY);
    ctx.lineTo(centerX - 10, centerY - 5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + 15, centerY);
    ctx.lineTo(centerX + 10, centerY - 5);
    ctx.stroke();

    // Roll scale
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#94a3b8';

    const rollMarks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
    rollMarks.forEach((mark) => {
      const angle = (mark * Math.PI) / 180;
      const x1 = centerX + (radius - 10) * Math.sin(angle);
      const y1 = centerY - (radius - 10) * Math.cos(angle);
      const x2 = centerX + radius * Math.sin(angle);
      const y2 = centerY - radius * Math.cos(angle);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // Roll indicator (triangle)
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((-roll * Math.PI) / 180);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(0, -radius + 5);
    ctx.lineTo(-8, -radius + 15);
    ctx.lineTo(8, -radius + 15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

  }, [pitch, roll, yaw]);

  return (
    <div className="relative bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="text-cyan-400 text-xs font-mono mb-2 text-center">
        ARTIFICIAL HORIZON
      </div>
      <canvas
        ref={canvasRef}
        width={300}
        height={300}
        className="w-full"
      />
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
        <div className="text-center">
          <div className="text-slate-400">PITCH</div>
          <div className="text-purple-400">{pitch.toFixed(1)}°</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400">ROLL</div>
          <div className="text-purple-400">{roll.toFixed(1)}°</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400">YAW</div>
          <div className="text-purple-400">{yaw.toFixed(1)}°</div>
        </div>
      </div>
    </div>
  );
}
