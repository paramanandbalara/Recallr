import React, { useRef, useState } from 'react';
import { date, type PracticeSession } from '../api';

// Mock interview score (out of 10) per session, oldest to newest. One series, so no legend: the card's title
// names it. Hover or arrow keys move a crosshair that snaps to the nearest session and shows its numbers.

const W = 640;
const H = 220;
const PAD = { top: 16, right: 44, bottom: 28, left: 32 };
const LINE = '#3b82f6'; // Checked against the dark card surface (lightness band and contrast)

export const ScoreChart: React.FC<{ sessions: PracticeSession[] }> = ({ sessions }) => {
  const points = sessions.filter(s => s.averageScore !== null).slice().reverse();
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  if (points.length < 2) return null;

  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1);
  const y = (score: number) => PAD.top + ((10 - score) * (H - PAD.top - PAD.bottom)) / 10;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.averageScore!).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const shown = active ?? null;

  const pick = (clientX: number) => {
    const box = svg.current!.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * last);
    setActive(Math.max(0, Math.min(last, i)));
  };

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-lg"
        role="img"
        aria-label={`Mock interview scores over ${points.length} sessions, from ${points[0].averageScore} to ${points[last].averageScore} out of 10`}
        tabIndex={0}
        onPointerMove={e => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onKeyDown={e => {
          if (e.key === 'ArrowRight') setActive(i => Math.min(last, (i ?? -1) + 1));
          else if (e.key === 'ArrowLeft') setActive(i => Math.max(0, (i ?? last + 1) - 1));
          else if (e.key === 'Escape') setActive(null);
        }}
        onBlur={() => setActive(null)}
      >
        {/* Recessive grid and axis labels */}
        {[0, 5, 10].map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#1e293b" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">{v}</text>
          </g>
        ))}
        <text x={PAD.left} y={H - 8} fontSize={11} fill="#64748b">{date(points[0].createdAt)}</text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={11} fill="#64748b">{date(points[last].createdAt)}</text>

        {shown !== null && <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={H - PAD.bottom} stroke="#475569" strokeWidth={1} />}
        <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.averageScore!)} r={i === shown ? 5.5 : 4} fill={LINE} stroke="#0f172a" strokeWidth={2} />
        ))}
        {/* The latest value, at the end of the line */}
        <text x={x(last) + 10} y={y(points[last].averageScore!) + 4} fontSize={12} fontWeight={600} fill="#e2e8f0">{points[last].averageScore}</text>
      </svg>

      {shown !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-48 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: `clamp(0px, calc(${(x(shown) / W) * 100}% - 96px), calc(100% - 192px))` }}
        >
          <div className="text-slate-400">{date(points[shown].createdAt)}{points[shown].role && ` · ${points[shown].role}`}</div>
          <div className="mt-1 flex items-center justify-between text-slate-200">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: LINE }} /> Score</span>
            <span className="font-semibold tabular-nums">{points[shown].averageScore} / 10</span>
          </div>
          <div className="mt-0.5 flex justify-between text-slate-400"><span>Pace</span><span className="tabular-nums">{points[shown].wordsPerMinute ?? '–'} wpm</span></div>
          <div className="mt-0.5 flex justify-between text-slate-400"><span>Filler words</span><span className="tabular-nums">{points[shown].fillersPerMinute ?? '–'} / min</span></div>
        </div>
      )}
    </div>
  );
};
