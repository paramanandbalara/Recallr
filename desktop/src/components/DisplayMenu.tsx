import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { setUiLanguage, t, uiLanguage, UI_LANGUAGES } from '../i18n';
import { loadEnglishStyle, saveEnglishStyle, TEXT_SIZES, WINDOW_SIZES, ZOOMS, type Display, type EnglishStyle, type Layout } from '../services/storage';

interface Props {
  display: Display;
  onChange: (display: Display) => void;
  onClose: () => void;
  onCheck?: () => void; // Open the pre-interview check (not while listening)
  onMock?: () => void;  // Open the mock interview (not while listening)
  listening?: boolean;  // The app's language can't change while listening (every screen is drawn again)
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

const SIZE_LABELS: Record<keyof typeof WINDOW_SIZES, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

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

// Opacity in 5% steps; `value` is 0..1 (`label` is the whole row label, already translated)
const PercentSlider: React.FC<{ label: string; min: number; value: number; onChange: (value: number) => void }> = ({
  label, min, value, onChange,
}) => (
  <Row label={label}>
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

const sendWindowSize = ({ width, height }: { width: number; height: number }) => {
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.send('set-window-size', width, height);
};

// Tiny drawings of each style for the buttons
const line = (w: string, extra = '') => <span className={`block h-[2px] rounded-full bg-slate-400/70 ${extra}`} style={{ width: w }} />;
const STYLES: { id: Layout; label: string; title: string; preview: React.ReactNode }[] = [
  { id: 'classic', label: 'Classic', title: 'Every question and answer, with key points and follow-ups',
    preview: <span className="flex flex-col gap-[2px] p-[3px]">{line('60%')}{line('90%')}{line('80%')}{line('50%')}</span> },
  { id: 'compact', label: 'Compact', title: 'Just the latest answer, with less around it: for a small window',
    preview: <span className="flex flex-col gap-[2px] p-[3px] pt-[6px]">{line('90%')}{line('70%')}</span> },
  { id: 'teleprompter', label: 'Prompter', title: 'The latest answer in large text, to read from at a glance',
    preview: <span className="flex flex-col gap-[3px] p-[3px] pt-[5px]"><span className="block h-[3px] w-[90%] rounded-full bg-slate-200/80" /><span className="block h-[3px] w-[70%] rounded-full bg-slate-200/80" /></span> },
  { id: 'glass', label: 'Glass', title: 'See-through, with your screen softly blurred behind it',
    preview: <span className="flex h-full flex-col gap-[2px] bg-gradient-to-br from-sky-300/30 to-violet-300/20 p-[3px]">{line('70%', '!bg-white/70')}{line('90%', '!bg-white/70')}</span> },
];

const stepButton = 'p-1 rounded text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-30';

// Display options and shortcuts; changes apply right away
export const DisplayMenu: React.FC<Props> = ({ display, onChange, onClose, onCheck, onMock, listening }) => {
  const ref = useRef<HTMLDivElement>(null);
  const patch = (changes: Partial<Display>) => onChange({ ...display, ...changes });
  // Answer English: 'broken' adds small everyday slips (applies to the next answer)
  const [english, setEnglish] = useState<EnglishStyle>(loadEnglishStyle);

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
    <div ref={ref} className="menu-in absolute right-2 top-11 z-40 w-64 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
      <div>
        <div className="mb-1.5 text-[11px] text-slate-400">{t('Style')}</div>
        <div className="grid grid-cols-4 gap-1">
          {STYLES.map(style => (
            <button
              key={style.id}
              onClick={() => patch({ layout: style.id })}
              title={t(style.title)}
              className={`rounded-md border px-1 py-1.5 text-[10px] font-medium ${display.layout === style.id ? 'border-blue-500 bg-blue-500/10 text-slate-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
            >
              <span className="mx-auto mb-1 block h-5 w-7 overflow-hidden rounded-sm border border-slate-600 bg-slate-800/80">{style.preview}</span>
              {t(style.label)}
            </button>
          ))}
        </div>
      </div>

      <Row label={t('Window size')}>
        <div className="flex rounded-md border border-slate-700 p-0.5">
          {(Object.keys(WINDOW_SIZES) as (keyof typeof WINDOW_SIZES)[]).map(size => (
            <button
              key={size}
              onClick={() => sendWindowSize(WINDOW_SIZES[size])}
              title={t('{width} × {height} (drag any edge to fine-tune)', { width: WINDOW_SIZES[size].width, height: WINDOW_SIZES[size].height })}
              className="rounded px-2 py-0.5 text-[11px] font-medium capitalize text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              {t(SIZE_LABELS[size])}
            </button>
          ))}
        </div>
      </Row>

      <Row label={t('Answers as')}>
        <Segmented
          value={display.keyPoints ? 'points' : 'full'}
          options={[{ id: 'full', label: t('Full text') }, { id: 'points', label: t('Key points') }]}
          onChange={v => patch({ keyPoints: v === 'points' })}
        />
      </Row>

      <Row label={t('Text size')}>
        <div className="flex items-center gap-1">
          <button className={stepButton} title={t('Smaller')} disabled={display.textSize <= TEXT_SIZES.min} onClick={() => patch({ textSize: display.textSize - 1 })}>
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-8 text-center text-[11px] tabular-nums text-slate-300">{display.textSize}px</span>
          <button className={stepButton} title={t('Larger')} disabled={display.textSize >= TEXT_SIZES.max} onClick={() => patch({ textSize: display.textSize + 1 })}>
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </Row>

      <Row label={t('App size')}>
        <div className="flex items-center gap-1">
          <button className={stepButton} title={t('Smaller ({key} −)', { key: isMac ? '⌘' : 'Ctrl' })} disabled={display.zoom <= ZOOMS.min + 0.001} onClick={() => patch({ zoom: Math.round((display.zoom - ZOOMS.step) * 10) / 10 })}>
            <Minus className="w-3 h-3" />
          </button>
          <button className="w-10 text-center text-[11px] tabular-nums text-slate-300 hover:text-slate-100" title={t('Back to 100%')} onClick={() => patch({ zoom: ZOOMS.default })}>
            {Math.round(display.zoom * 100)}%
          </button>
          <button className={stepButton} title={t('Larger ({key} +)', { key: isMac ? '⌘' : 'Ctrl' })} disabled={display.zoom >= ZOOMS.max - 0.001} onClick={() => patch({ zoom: Math.round((display.zoom + ZOOMS.step) * 10) / 10 })}>
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </Row>

      <PercentSlider
        label={t('Background opacity')}
        min={0}
        value={display.bgOpacity}
        onChange={bgOpacity => patch({ bgOpacity })}
      />
      <PercentSlider
        label={t('Text opacity')}
        min={30}
        value={display.textOpacity}
        onChange={textOpacity => patch({ textOpacity })}
      />

      <Row label={t('English')}>
        <Segmented
          value={english}
          options={[{ id: 'normal', label: t('Normal') }, { id: 'broken', label: t('Broken') }]}
          onChange={style => {
            setEnglish(style);
            saveEnglishStyle(style);
          }}
        />
      </Row>

      <Row label={t('App language')}>
        <div title={listening ? t('Stop listening first') : undefined} className={listening ? 'pointer-events-none opacity-40' : ''}>
          <Segmented value={uiLanguage()} options={UI_LANGUAGES} onChange={setUiLanguage} />
        </div>
      </Row>

      <Row label={t('Theme')}>
        <Segmented
          value={display.theme}
          options={[{ id: 'dark', label: t('Dark') }, { id: 'light', label: t('Light') }]}
          onChange={theme => patch({ theme })}
        />
      </Row>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={onCheck}
          disabled={!onCheck}
          title={onCheck ? t('Test keys, speed, microphone, call audio and screen reading') : t('Stop listening first')}
          className="rounded-md border border-slate-700 py-1.5 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:opacity-40"
        >
          {t('Pre-interview check')}
        </button>
        <button
          onClick={onMock}
          disabled={!onMock}
          title={onMock ? t('Practise: questions read out loud, answer by voice, get a score') : t('Stop listening first')}
          className="rounded-md border border-slate-700 py-1.5 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:opacity-40"
        >
          {t('Mock interview')}
        </button>
      </div>

      <div className="border-t border-slate-800 pt-2.5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('Shortcuts (work in any app)')}</div>
        <ul className="space-y-1">
          {SHORTCUTS.map(s => (
            <li key={s.keys} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">{t(s.label)}</span>
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
