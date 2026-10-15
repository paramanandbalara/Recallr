import { t } from '../i18n';
import type { Interview } from './calendar';

// The "next interview" chip in the app's header: the next interview in the coming week, and when it is
// ("Tomorrow 10:30", "in 45 min"). No side effects; tested.

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
export const CHIP_DAYS = 7;
const SHOW_STARTED_FOR = 15 * MINUTE; // Still shown as "Now" this long after it started
const CLOSE_MS = 60 * MINUTE;         // "in 45 min" from this close

export const nextInterviewWithin = (list: Interview[], now: number, days = CHIP_DAYS) =>
  list
    .filter(i => i.startsAt > now - SHOW_STARTED_FOR && i.startsAt <= now + days * DAY)
    .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;

const startOfDay = (at: number) => {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Short, so it fits the header: "Now", "in 45 min", "in 3 h", "Today", "Tomorrow", "Sat" (the exact time is in the
// chip's tooltip, see chipFullTime)
export const chipTimeText = (at: number, now: number, locale?: string) => {
  const until = at - now;
  if (until <= 0) return t('Now');
  if (until < CLOSE_MS) return t('in {minutes} min', { minutes: Math.max(1, Math.ceil(until / MINUTE)) });
  if (until < 12 * CLOSE_MS) return t('in {hours} h', { hours: Math.round(until / CLOSE_MS) });
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  if (days === 0) return t('Today');
  if (days === 1) return t('Tomorrow');
  return new Date(at).toLocaleDateString(locale, { weekday: 'short' });
};

// "Tomorrow 10:30", "Sat 9:00": for the tooltip
export const chipFullTime = (at: number, now: number, locale?: string) => {
  const time = new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  const day = days === 0 ? t('Today') : days === 1 ? t('Tomorrow') : new Date(at).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${time}`;
};

// When the chip's text next changes: every minute in the last hour, otherwise at the next minute boundary
// (cheap either way; the chip only re-renders then)
export const chipRefreshMs = (at: number | null, now: number) => {
  if (at === null) return 5 * MINUTE;
  const toNextMinute = MINUTE - (now % MINUTE);
  return Math.max(1000, at - now < 2 * CLOSE_MS ? toNextMinute : Math.min(5 * MINUTE, toNextMinute + 4 * MINUTE));
};
