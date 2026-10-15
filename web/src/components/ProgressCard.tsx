import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Info, Share2 } from 'lucide-react';
import { LogoMark } from './Logo';

// A picture of the user's practice (streak, mock interviews, scores) to post or send: drawn on a canvas in the
// browser (nothing goes to the server), downloaded as a PNG or shared with the phone's share sheet.

export interface ProgressStats {
  name: string;               // First name, on the card
  streakDays: number;
  recent: boolean[];          // The last 7 days, oldest first: practised or not
  sessions: number;           // Mock interviews, all time
  averageScore: number | null; // Out of 10
  bestScore: number | null;
}

const W = 1200;
const H = 630;
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
};

const score = (n: number | null) => (n === null ? '–' : (Math.round(n * 10) / 10).toString());

const draw = (ctx: CanvasRenderingContext2D, stats: ProgressStats, logo: HTMLImageElement | null, host: string) => {
  // Background: deep navy to indigo, with soft glows like the website's hero
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0f1f');
  bg.addColorStop(0.55, '#10173a');
  bg.addColorStop(1, '#1a1240');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W * 0.88, -40, 520, 'rgba(124, 58, 237, 0.32)');
  glow(ctx, -60, H + 40, 560, 'rgba(37, 99, 235, 0.30)');
  glow(ctx, W * 0.5, H * 0.62, 380, 'rgba(14, 165, 233, 0.08)');
  // A faint grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 48; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 48; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  // Header: logo and name, month on the right
  if (logo) ctx.drawImage(logo, 64, 56, 60, 60);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText('Recallr', logo ? 140 : 64, 98);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), W - 64, 96);
  ctx.textAlign = 'left';

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 54px ${FONT}`;
  const title = stats.name ? `${stats.name}’s interview practice` : 'My interview practice';
  ctx.fillText(title.length > 34 ? 'My interview practice' : title, 64, 206);
  ctx.fillStyle = '#a5b4fc';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(stats.streakDays > 1 ? `${stats.streakDays} days in a row, and counting.` : 'Practising out loud, one day at a time.', 64, 252);

  // Four tiles
  const tiles = [
    { value: String(stats.streakDays), unit: stats.streakDays === 1 ? 'day' : 'days', label: 'Practice streak', accent: true },
    { value: String(stats.sessions), unit: '', label: 'Mock interviews', accent: false },
    { value: score(stats.averageScore), unit: stats.averageScore === null ? '' : '/10', label: 'Average score', accent: false },
    { value: score(stats.bestScore), unit: stats.bestScore === null ? '' : '/10', label: 'Best score', accent: false },
  ];
  const gap = 24;
  const tileW = (W - 128 - gap * 3) / 4;
  const tileY = 300;
  const tileH = 196;
  tiles.forEach((tile, i) => {
    const x = 64 + i * (tileW + gap);
    roundRect(ctx, x, tileY, tileW, tileH, 24);
    ctx.fillStyle = tile.accent ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.strokeStyle = tile.accent ? 'rgba(129, 140, 248, 0.45)' : 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `800 64px ${FONT}`;
    if (tile.accent) {
      const g = ctx.createLinearGradient(x + 28, 0, x + 28 + 160, 0);
      g.addColorStop(0, '#60a5fa');
      g.addColorStop(1, '#c4b5fd');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillText(tile.value, x + 28, tileY + 88);
    const valueWidth = ctx.measureText(tile.value).width;
    if (tile.unit) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 26px ${FONT}`;
      ctx.fillText(tile.unit, x + 28 + valueWidth + 8, tileY + 88);
    }
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(tile.label, x + 28, tileY + 128);

    // The streak tile: the last 7 days as dots
    if (tile.accent) {
      stats.recent.slice(-7).forEach((on, d) => {
        ctx.beginPath();
        ctx.arc(x + 36 + d * 26, tileY + 160, 8, 0, Math.PI * 2);
        ctx.fillStyle = on ? '#818cf8' : 'rgba(255, 255, 255, 0.12)';
        ctx.fill();
      });
    }
  });

  // Footer
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText('Practise out loud. Get scored. Walk in ready.', 64, 572);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#818cf8';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(host, W - 64, 572);
  ctx.textAlign = 'left';
};

// The logo, as an image the canvas can draw (from the same drawing the site uses)
const logoImage = (holder: HTMLElement | null) => new Promise<HTMLImageElement | null>(resolve => {
  const svg = holder?.querySelector('svg')?.cloneNode(true) as SVGSVGElement | undefined;
  if (!svg) return resolve(null);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', '120');
  svg.setAttribute('height', '120');
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
});

export const shareText = (stats: ProgressStats) => {
  const parts = [`${stats.sessions} mock interview${stats.sessions === 1 ? '' : 's'}`];
  if (stats.averageScore !== null) parts.push(`average score ${score(stats.averageScore)}/10`);
  const lead = stats.streakDays > 1 ? `${stats.streakDays}-day practice streak on Recallr` : 'Practising for interviews with Recallr';
  return `${lead}: ${parts.join(', ')}.`;
};

export const ProgressCard: React.FC<{ stats: ProgressStats }> = ({ stats }) => {
  const logoRef = useRef<HTMLSpanElement>(null);
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const key = JSON.stringify(stats);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    (async () => {
      await document.fonts?.ready.catch(() => {});
      const logo = await logoImage(logoRef.current);
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx || cancelled) return;
      draw(ctx, JSON.parse(key) as ProgressStats, logo, window.location.host || 'recallr');
      canvas.toBlob(blob => {
        if (!blob || cancelled) return;
        made = URL.createObjectURL(blob);
        setPng({ blob, url: made });
      }, 'image/png');
    })();
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);

  const link = `${window.location.origin}/`;
  const text = shareText(stats);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
      setNote({ text: 'Text and link copied. Paste them with the downloaded picture.', ok: true });
    } catch {
      setNote({ text: 'Couldn’t copy. Download the picture and share it from your device.', ok: false });
    }
  };

  const share = async () => {
    setNote(null);
    const file = png ? new File([png.blob], 'recallr-progress.png', { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Recallr progress', text: `${text} ${link}` });
        return;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return; // Closed the share sheet
      }
    }
    await copyText();
  };

  return (
    <div>
      <span ref={logoRef} className="hidden" aria-hidden><LogoMark /></span>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
        {png
          ? <img src={png.url} alt={`Progress card: ${text}`} width={W} height={H} className="block h-auto w-full" />
          : <div className="aspect-[1200/630] w-full animate-pulse bg-slate-900" />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={png?.url}
          download="recallr-progress.png"
          aria-disabled={!png}
          className={`inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-500 ${png ? '' : 'pointer-events-none opacity-50'}`}
        >
          <Download className="h-4 w-4" /> Download
        </a>
        <button
          type="button"
          onClick={share}
          disabled={!png}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
        {note && (
          <span role="status" className={`inline-flex items-center gap-1 text-xs ${note.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
            {note.ok ? <Check className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />} {note.text}
          </span>
        )}
      </div>
    </div>
  );
};
