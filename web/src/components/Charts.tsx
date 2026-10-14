import React, { useRef, useState } from 'react';

// Small SVG charts for the admin reports. Colors: the validated dark-surface categorical steps
// (slot 1 blue, slot 2 orange); text always in text colors, never the series color.

export const SERIES = ['#3987e5', '#d95926'];

export interface Series {
  name: string;
  values: number[];
}

interface Props {
  labels: string[];          // One per point (dates)
  series: Series[];          // One for bars, one or two for lines
  format: (n: number) => string;
  kind: 'bar' | 'line';
  height?: number;
}

const W = 640;
const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

// A rounded maximum and 3 gridlines
const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
};

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const Chart: React.FC<Props> = ({ labels, series, format, kind, height = 200 }) => {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(0, ...series.flatMap(s => s.values)));
  const n = labels.length;
  const step = innerW / Math.max(n, 1);
  const x = (i: number) => PAD.left + (kind === 'bar' ? step * i + step / 2 : n > 1 ? (innerW * i) / (n - 1) : innerW / 2);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 3, (2 * max) / 3, max];
  const labelEvery = Math.ceil(n / 6);

  // Nearest point to the pointer (hit area: the whole column)
  const onMove = (e: React.PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };

  const barW = Math.max(2, Math.min(18, step - 2)); // 2px gap between bars

  return (
    <div className="relative">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img"
        aria-label={`${series.map(s => s.name).join(' and ')} by day`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#334155" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#94a3b8">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % labelEvery === 0 || i === n - 1) && (
          <text key={l} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#94a3b8">{shortDate(l)}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#64748b" strokeWidth={1} />}

        {kind === 'bar' && series[0].values.map((v, i) => {
          const top = y(v);
          const h = PAD.top + innerH - top;
          const r = Math.min(4, barW / 2, h);
          const left = x(i) - barW / 2;
          // Rounded at the data end only, square on the baseline
          return h > 0 && (
            <path key={i} fill={SERIES[0]} opacity={hover === null || hover === i ? 1 : 0.55}
              d={`M${left},${top + h} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${top + h} Z`} />
          );
        })}

        {kind === 'line' && series.map((s, si) => (
          <g key={s.name}>
            <polyline fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r={4} fill={SERIES[si]} stroke="#0f172a" strokeWidth={2} />}
          </g>
        ))}
      </svg>

      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) > W / 2 ? 'calc(-100% - 8px)' : '8px'})` }}>
          <div className="mb-1 text-slate-400">{shortDate(labels[hover])}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center gap-2 whitespace-nowrap">
              {series.length > 1 && <span className="h-0.5 w-3 rounded" style={{ background: SERIES[si] }} />}
              <strong className="text-slate-100">{format(s.values[hover])}</strong>
              <span className="text-slate-400">{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// For two series: always a legend (identity is never color alone)
export const Legend: React.FC<{ series: Series[] }> = ({ series }) => (
  <div className="flex flex-wrap gap-4 text-xs text-slate-300">
    {series.map((s, i) => (
      <span key={s.name} className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded" style={{ background: SERIES[i] }} /> {s.name}
      </span>
    ))}
  </div>
);
