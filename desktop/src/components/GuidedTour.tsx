import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePopupTurn } from '../services/popupQueue';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { markTourSeen, placeCard, spotlightRect, TOUR_EVENT, TOUR_MARGIN, TOUR_STEPS, tourSeen, type Rect } from '../services/tour';
import { t } from '../i18n';

// A short first-run tour of the main window: a spotlight on one control at a time, with a card explaining it.
// Shown once after setup (or the first time the main window opens for someone who set up before it existed),
// never while listening (starting to listen ends it), and again from Display → Replay tour.

const FIRST_DELAY_MS = 900; // Let the window settle first (it resizes after setup)
const CARD_WIDTH = 288;

// Keys only reach the window while it may take focus (see useTypingFocus): allowed during the tour
const setFocusable = (on: boolean) => {
  const api = (window as unknown as { api?: { setFocusable?: (on: boolean) => void } }).api;
  api?.setFocusable?.(on);
};

const findTarget = (target: string): Rect | null => {
  const r = document.querySelector(`[data-tour="${target}"]`)?.getBoundingClientRect();
  return r ? spotlightRect(r, { w: window.innerWidth, h: window.innerHeight }) : null;
};

interface Props {
  listening: boolean; // Never during an interview
  blocked: boolean;   // Another screen is open (settings, mock interview...): wait for it to close
}

export const GuidedTour: React.FC<Props> = ({ listening, blocked }) => {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<Rect | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [cardHeight, setCardHeight] = useState(150);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[index];

  const start = useCallback(() => {
    markTourSeen(); // Once shown, it doesn't come back by itself
    setIndex(0);
    setOpen(true);
  }, []);
  const finish = useCallback(() => setOpen(false), []);

  // Starting to listen ends it at once
  const [wasListening, setWasListening] = useState(listening);
  if (listening !== wasListening) {
    setWasListening(listening);
    if (listening && open) setOpen(false);
  }

  // The first time
  useEffect(() => {
    if (open || listening || blocked || tourSeen()) return;
    const timer = setTimeout(start, FIRST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, listening, blocked, start]);

  // Again, from the Display menu
  useEffect(() => {
    const replay = () => { if (!listening) start(); };
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, [listening, start]);

  const visible = usePopupTurn('tour', open && !listening && !blocked);

  // Find the control, and follow it when the window changes size
  useLayoutEffect(() => {
    if (!visible) return;
    const measure = () => {
      setHole(findTarget(step.target));
      setView({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [visible, step.target]);

  const shown = visible && view.w > 0;

  // The card's height decides whether it fits below the control
  useEffect(() => {
    const card = cardRef.current;
    if (!shown || !card || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setCardHeight(card.offsetHeight));
    observer.observe(card);
    return () => observer.disconnect();
  }, [shown]);

  useEffect(() => {
    if (shown) nextRef.current?.focus({ preventScroll: true });
  }, [shown, index]);

  // Keyboard: Esc skips, arrows move. The window takes key presses while the tour is open.
  useEffect(() => {
    if (!visible) return;
    setFocusable(true);
    const keepFocusable = () => setTimeout(() => setFocusable(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (index < TOUR_STEPS.length - 1) setIndex(index + 1);
        else finish();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIndex(Math.max(0, index - 1));
      }
    };
    document.addEventListener('focusout', keepFocusable);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusout', keepFocusable);
      window.removeEventListener('keydown', onKey, true);
      setFocusable(false);
    };
  }, [visible, index, finish]);

  if (!shown) return null;

  const cardWidth = Math.min(CARD_WIDTH, view.w - TOUR_MARGIN * 2);
  const place = placeCard(hole, { w: cardWidth, h: cardHeight }, view);
  const last = index === TOUR_STEPS.length - 1;
  const small = view.h < 380;

  return (
    <div data-interactive className="tour-in fixed inset-0 z-[70]">
      {/* The window dimmed around a hole over the control (a large shadow); with no control in view, all dimmed */}
      {hole
        ? <div className="tour-spot pointer-events-none absolute rounded-lg ring-2 ring-blue-500/80" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
        : <div className="tour-shade pointer-events-none absolute inset-0" />}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="tour-card absolute rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"
        style={{ left: place.left, top: place.top, width: cardWidth }}
      >
        {place.arrow !== null && (
          <span
            aria-hidden
            className={`absolute h-2.5 w-2.5 rotate-45 border-slate-700 bg-slate-900 ${place.below ? '-top-[6px] border-l border-t' : '-bottom-[6px] border-b border-r'}`}
            style={{ left: place.arrow - 5 }}
          />
        )}
        <div key={index} className="tour-step-in">
          <div className="flex items-center justify-between gap-2">
            <h2 id="tour-title" className="text-[13px] font-semibold text-slate-100">{t(step.title)}</h2>
            <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{t('{step} of {total}', { step: index + 1, total: TOUR_STEPS.length })}</span>
          </div>
          <p id="tour-body" className={`mt-1 leading-relaxed text-slate-400 ${small ? 'text-[11px]' : 'text-xs'}`}>{t(step.body)}</p>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <div className="mr-auto flex gap-1" aria-hidden>
            {TOUR_STEPS.map((s, i) => (
              <span key={s.target} className={`tour-dot h-1.5 rounded-full ${i === index ? 'w-3.5 bg-blue-500' : 'w-1.5 bg-slate-700'}`} />
            ))}
          </div>
          {!last && (
            <button type="button" onClick={finish} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-800 hover:text-slate-200">
              {t('Skip')}
            </button>
          )}
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)} title={t('Back')} aria-label={t('Back')} className="rounded-md border border-slate-700 p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? finish() : setIndex(index + 1))}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            {last ? t('Got it') : <>{t('Next')} <ArrowRight className="h-3 w-3" /></>}
          </button>
        </div>
      </div>
    </div>
  );
};
