import { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks: [number, number][];
  color: string;
  height: number;
  width: number;
}

function resolveCssVar(varName: string): string {
  if (typeof window === 'undefined') return '#ffffff';
  let name = varName.trim();
  if (name.startsWith('var(')) {
    name = name.slice(4, -1).trim();
  }
  const resolved = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return resolved || '#ffffff';
}

function adjustOpacity(hexColor: string, opacity: number): string {
  if (hexColor.startsWith('#')) {
    const hex = hexColor.replace('#', '');
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0]! + hex[0], 16);
      g = parseInt(hex[1]! + hex[1], 16);
      b = parseInt(hex[2]! + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return hexColor;
}

/**
 * Renders waveform peaks on a canvas element as high-fidelity vertical needles.
 */
export function WaveformCanvas({ peaks, color, height, width }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0 || width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = width;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const barW = w / peaks.length;

    const drawHeight = mid - 3; // Deixa 3px de margem nas pontas para o cap arredondado
    const resolvedColor = resolveCssVar(color);

    // 1. Criar degradê de preenchimento cilíndrico (glow vertical)
    const strokeGradient = ctx.createLinearGradient(0, 2, 0, h - 2);
    strokeGradient.addColorStop(0, resolvedColor);
    strokeGradient.addColorStop(0.5, adjustOpacity(resolvedColor, 0.45));
    strokeGradient.addColorStop(1, resolvedColor);

    // 2. Determinar a espessura da agulha com base no zoom
    // Evita agulhas muito grossas (máx 2.5px) para não dar o visual esticado
    const needleWidth = Math.min(2.5, Math.max(1.2, barW - 0.5));

    ctx.lineWidth = needleWidth;
    ctx.strokeStyle = strokeGradient;
    ctx.lineCap = 'round';

    // 3. Renderizar cada peak como uma agulha vertical arredondada
    for (let i = 0; i < peaks.length; i++) {
      const [lo, hi] = peaks[i]!;
      const x = i * barW + barW / 2; // Centraliza no slot
      
      const yTop = mid - hi * drawHeight;
      const yBot = mid - lo * drawHeight;

      // Garante que o desenho tenha pelo menos 1px de altura
      const finalYTop = Math.min(yTop, mid - 1);
      const finalYBot = Math.max(yBot, mid + 1);

      ctx.beginPath();
      ctx.moveTo(x, finalYTop);
      ctx.lineTo(x, finalYBot);
      ctx.stroke();
    }

    // 4. Desenhar a linha central sutil (silêncio 0dB)
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.strokeStyle = resolvedColor;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [peaks, color, height, width]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block' }}
    />
  );
}
