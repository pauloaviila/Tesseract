import { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks: [number, number][];
  color: string;
  height: number;
}

/**
 * Renders waveform peaks on a canvas element.
 * peaks: array of [min, max] normalised to [-1, 1]
 */
export function WaveformCanvas({ peaks, color, height }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const barW = w / peaks.length;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;

    for (let i = 0; i < peaks.length; i++) {
      const [lo, hi] = peaks[i]!;
      const x = i * barW;
      const yTop = mid - hi * mid;
      const yBot = mid - lo * mid;
      const barH = Math.max(1, yBot - yTop);
      ctx.fillRect(x, yTop, Math.max(1, barW - 0.5), barH);
    }
  }, [peaks, color, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block' }}
    />
  );
}
