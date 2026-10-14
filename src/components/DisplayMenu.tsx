import React, { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { TEXT_SIZES, type Display } from '../services/storage';

interface Props {
  display: Display;
  onChange: (display: Display) => void;
  onClose: () => void;
}

const isMac = /Mac/i.test(navigator.platform);
const MODIFIERS = isMac ? '⌃ ⌥' : 'Ctrl Alt Shift';

// Keep in sync with SHORTCUTS in electron/main.ts
const SHORTCUTS = [
  { keys: 'L', label: 'Start / stop listening' },
  { keys: 'A', label: 'Type a question' },
  { keys: 'R', label: 'Regenerate last answer' },
  { keys: 'N', label: 'New conversation' },
  { keys: 'S', label: 'Read question from screen' },
];

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] text-slate-400">{label}</span>
    {children}
  </div>
);

const Segmented = <T extends string>({ value, options, onChange }: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) => (
  <div className="flex rounded-md border border-slate-700 p-0.5">
    {options.map(o => (
      <button
        key={o.id}
        onClick={() => onChange(o.id)}
        className={`rounded px-2 py-0.5 text-[11px] font-medium ${value === o.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// Opacity in 5% steps; `value` is 0..1
const PercentSlider: React.FC<{ label: string; min: number; value: number; onChange: (value: number) => void }> = ({
  label, min, value, onChange,
}) => (
  <Row label={`${label} opacity`}>
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="w-24 accent-blue-500"
      />
      <span className="w-8 text-right text-[11px] tabular-nums text-slate-300">{Math.round(value * 100)}%</span>
    </div>
  </Row>
);

const stepButton = 'p-1 rounded text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-30';

// Display options and shortcuts; changes apply right away
export const DisplayMenu: React.FC<Props> = ({ display, onChange, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const patch = (changes: Partial<Display>) => onChange({ ...display, ...changes });

  // Close on a click outside or Escape
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      // The header button toggles the menu itself
      if (!ref.current?.contains(target) && !target.closest?.('[data-display-toggle]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Wait a tick so the click that opened the menu doesn't close it
    const timer = setTimeout(() => document.addEventListener('pointerdown', onPointer));
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-2 top-11 z-40 w-64 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
      <Row label="Answers as">
        <Segmented
          value={display.keyPoints ? 'points' : 'full'}
          options={[{ id: 'full', label: 'Full text' }, { id: 'points', label: 'Key points' }]}
          onChange={v => patch({ keyPoints: v === 'points' })}
        />
      </Row>

      <Row label="Text size">
        <div className="flex items-center gap-1">
          <button className={stepButton} title="Smaller" disabled={display.textSize <= TEXT_SIZES.min} onClick={() => patch({ textSize: display.textSize - 1 })}>
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-8 text-center text-[11px] tabular-nums text-slate-300">{display.textSize}px</span>
          <button className={stepButton} title="Larger" disabled={display.textSize >= TEXT_SIZES.max} onClick={() => patch({ textSize: display.textSize + 1 })}>
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </Row>

      <PercentSlider
        label="Background"
        min={0}
        value={display.bgOpacity}
        onChange={bgOpacity => patch({ bgOpacity })}
      />
      <PercentSlider
        label="Text"
        min={30}
        value={display.textOpacity}
        onChange={textOpacity => patch({ textOpacity })}
      />

      <Row label="Theme">
        <Segmented
          value={display.theme}
          options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]}
          onChange={theme => patch({ theme })}
        />
      </Row>

      <div className="border-t border-slate-800 pt-2.5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Shortcuts (work in any app)</div>
        <ul className="space-y-1">
          {SHORTCUTS.map(s => (
            <li key={s.keys} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">{s.label}</span>
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-px font-sans text-[10px] text-slate-300">
                {MODIFIERS} {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
