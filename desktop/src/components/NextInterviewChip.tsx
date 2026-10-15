import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { CALENDAR_EVENT, loadInterviews } from '../services/calendar';
import { chipRefreshMs, chipTimeText, nextInterviewWithin } from '../services/nextInterview';
import { t, uiLocale } from '../i18n';

interface Props {
  onOpen: () => void;  // Settings → Interviews
  dimmed?: boolean;    // While listening: there, but out of the way
  children?: React.ReactNode; // Shown instead when there's no interview to show (the app's name)
}

const MIN_WIDTH = 500; // Narrower windows have no room for it in the header

const useWideEnough = () => {
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth >= MIN_WIDTH);
  useEffect(() => {
    const update = () => setWide(window.innerWidth >= MIN_WIDTH);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return wide;
};

// "Northwind · Tomorrow 10:30" in the header, for the next interview in the coming week
export const NextInterviewChip: React.FC<Props> = ({ onOpen, dimmed, children }) => {
  const [list, setList] = useState(loadInterviews);
  const [now, setNow] = useState(() => Date.now());
  const wide = useWideEnough();

  useEffect(() => {
    const reload = () => {
      setList(loadInterviews());
      setNow(Date.now());
    };
    window.addEventListener(CALENDAR_EVENT, reload);
    return () => window.removeEventListener(CALENDAR_EVENT, reload);
  }, []);

  const next = nextInterviewWithin(list, now);
  const at = next?.startsAt ?? null;
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), chipRefreshMs(at, now));
    return () => clearTimeout(timer);
  }, [at, now]);

  if (!next || !wide) return <>{children}</>;
  const when = chipTimeText(next.startsAt, now, uiLocale());
  const soon = next.startsAt - now < 60 * 60 * 1000;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={t('Next interview: {title}, {when} (click to see your interviews)', { title: next.title, when })}
      className={`compact-hide fade-in flex min-w-0 max-w-[13rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-[opacity,color,border-color] duration-300 ${
        soon ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
      } ${dimmed ? 'opacity-40 hover:opacity-80' : ''}`}
    >
      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{next.title}</span>
      <span aria-hidden className="shrink-0 opacity-60">·</span>
      <span className="shrink-0 tabular-nums">{when}</span>
    </button>
  );
};
