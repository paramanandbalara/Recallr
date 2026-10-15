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

// "Now", "in 45 min", "Today 14:00", "Tomorrow 10:30", "Fri 09:00"
export const chipTimeText = (at: number, now: number, locale?: string) => {
  const until = at - now;
  if (until <= 0) return t('Now');
  if (until < CLOSE_MS) return t('in {minutes} min', { minutes: Math.max(1, Math.ceil(until / MINUTE)) });
  const time = new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  if (days === 0) return `${t('Today')} ${time}`;
  if (days === 1) return `${t('Tomorrow')} ${time}`;
  return `${new Date(at).toLocaleDateString(locale, { weekday: 'short' })} ${time}`;
};

// When the chip's text next changes: every minute in the last hour, otherwise at the next minute boundary
// (cheap either way; the chip only re-renders then)
export const chipRefreshMs = (at: number | null, now: number) => {
  if (at === null) return 5 * MINUTE;
  const toNextMinute = MINUTE - (now % MINUTE);
  return Math.max(1000, at - now < 2 * CLOSE_MS ? toNextMinute : Math.min(5 * MINUTE, toNextMinute + 4 * MINUTE));
};
