import { t, uiLocale } from '../i18n';

// Interview calendar: kept on this computer with the rest of the app's data (and in backups).
// The day before an interview the app offers a prep pack; shortly before it, it switches to that interview's profile.

export interface Interview {
  id: string;
  profileId: string;
  title: string;     // e.g. "Northwind – system design round"
  startsAt: number;  // ms
  notes: string;
  prepOffered?: boolean;
  switched?: boolean;
}

const KEY = 'secondBrain_interviews';
const HOUR = 60 * 60 * 1000;
export const SWITCH_BEFORE_MS = 45 * 60 * 1000; // Switch the profile this long before it starts
const SWITCH_AFTER_MS = HOUR;                    // ...or if the app opens up to an hour after it started
const KEEP_AFTER_MS = 6 * HOUR;                  // Gone from the list after this

const isInterview = (v: unknown): v is Interview => !!v && typeof v === 'object'
  && typeof (v as Interview).id === 'string' && typeof (v as Interview).startsAt === 'number' && Number.isFinite((v as Interview).startsAt);

export const loadInterviews = (): Interview[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(isInterview).map(i => ({ ...i, title: String(i.title ?? ''), notes: String(i.notes ?? ''), profileId: String(i.profileId ?? '') }))
      : [];
  } catch {
    return [];
  }
};

export const saveInterviews = (list: Interview[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable
  }
  window.dispatchEvent(new Event(CALENDAR_EVENT));
};

// Fired when the list changes, so the reminders pick it up at once
export const CALENDAR_EVENT = 'recallr:calendar';

export const updateInterview = (id: string, changes: Partial<Interview>) =>
  saveInterviews(loadInterviews().map(i => (i.id === id ? { ...i, ...changes } : i)));

// Upcoming and just-finished interviews, soonest first
export const upcoming = (list: Interview[], now: number) =>
  list.filter(i => i.startsAt + KEEP_AFTER_MS > now).sort((a, b) => a.startsAt - b.startsAt);

// Midnight (local time) at the start of the day before the interview
const startOfDayBefore = (at: number) => {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d.getTime();
};

export type CalendarAction = { kind: 'switch'; interview: Interview } | { kind: 'prep'; interview: Interview };

// What the app should do now, if anything: switching comes first, then the prep pack offer
export const nextAction = (list: Interview[], now: number): CalendarAction | null => {
  const sorted = upcoming(list, now);
  const switching = sorted.find(i => !i.switched && now >= i.startsAt - SWITCH_BEFORE_MS && now <= i.startsAt + SWITCH_AFTER_MS);
  if (switching) return { kind: 'switch', interview: switching };
  // From the start of the day before, until an hour before it starts
  const prep = sorted.find(i => !i.prepOffered && now >= startOfDayBefore(i.startsAt) && now < i.startsAt - HOUR);
  return prep ? { kind: 'prep', interview: prep } : null;
};

// "Today 10:30", "Tomorrow 14:00", "Fri 18 Oct, 09:00"
export const whenText = (at: number, now: number, locale?: string) => {
  const time = new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(at) - day(now)) / (24 * HOUR));
  if (days === 0) return { day: 'today' as const, time };
  if (days === 1) return { day: 'tomorrow' as const, time };
  return { day: new Date(at).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }), time };
};

// "Tomorrow, 10:00" in the app's language
export const whenLabel = (at: number, now = Date.now()) => {
  const { day, time } = whenText(at, now, uiLocale());
  return `${day === 'today' ? t('Today') : day === 'tomorrow' ? t('Tomorrow') : day}, ${time}`;
};

// For <input type="datetime-local">: local time, minutes precision
export const toLocalInput = (at: number) => {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value: string) => {
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
};
