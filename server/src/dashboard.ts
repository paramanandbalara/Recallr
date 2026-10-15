import { db } from './db.js';
import { allowance } from './entitlements.js';
import { getSettings, numberSetting } from './settings.js';

// The website's account dashboard (GET /api/me/dashboard): the next interview, what the plan still allows,
// this week's practice next to last week's, the streak of days practised, and one suggested next thing to do.
// Days and weeks are India days (where Recallr's users are), weeks start on Monday.

const IST_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_LOOKBACK_DAYS = 400;
export const TOKENS_PER_ANSWER = 2500; // A typical live answer (question, context and answer), as on the website

// ---------- Days and weeks (no database; tested) ----------

// "2026-10-15", the day in India at that moment
export const indiaDay = (at: Date) => new Date(at.getTime() + IST_MS).toISOString().slice(0, 10);

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// When the India week (from Monday 00:00) containing `now` started, and the one before, in UTC
export const indiaWeeks = (now: Date) => {
  const today = indiaDay(now);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const thisWeek = new Date(Date.parse(`${addDays(today, -weekday)}T00:00:00Z`) - IST_MS);
  return { thisWeek, lastWeek: new Date(thisWeek.getTime() - 7 * DAY_MS) };
};

// Days practised in a row. Today counts once done; until then a streak that ran up to yesterday is still alive.
export const practiceStreak = (dates: Date[], now: Date) => {
  const days = new Set(dates.map(indiaDay));
  const today = indiaDay(now);
  const practisedToday = days.has(today);
  let day = practisedToday ? today : addDays(today, -1);
  let current = 0;
  while (days.has(day)) {
    current += 1;
    day = addDays(day, -1);
  }
  let longest = 0;
  let run = 0;
  let previous = '';
  for (const d of [...days].sort()) {
    run = previous && addDays(previous, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = d;
  }
  return { days: current, practisedToday, longest, lastDay: [...days].sort().pop() ?? null };
};

// The last `n` India days, oldest first, and whether each had practice (for the little strip on the dashboard)
export const recentDays = (dates: Date[], now: Date, n = 7) => {
  const days = new Set(dates.map(indiaDay));
  const today = indiaDay(now);
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - n + 1);
    return { day, practised: days.has(day) };
  });
};

const round1 = (n: number) => Math.round(n * 10) / 10;
export const averageOf = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? round1(known.reduce((a, b) => a + b, 0) / known.length) : null;
};

interface Scored { createdAt: Date; averageScore: number | null }

// This India week so far next to all of last week
export const weekComparison = (sessions: Scored[], now: Date) => {
  const { thisWeek, lastWeek } = indiaWeeks(now);
  const current = sessions.filter(s => s.createdAt >= thisWeek && s.createdAt <= now);
  const previous = sessions.filter(s => s.createdAt >= lastWeek && s.createdAt < thisWeek);
  const averageScore = averageOf(current.map(s => s.averageScore));
  const previousAverageScore = averageOf(previous.map(s => s.averageScore));
  return {
    startsOn: indiaDay(thisWeek),
    sessions: current.length,
    previousSessions: previous.length,
    averageScore,
    previousAverageScore,
    scoreChange: averageScore !== null && previousAverageScore !== null ? round1(averageScore - previousAverageScore) : null,
  };
};

export type Suggestion =
  | { kind: 'resume' }                                            // Add a resume to a profile in the app
  | { kind: 'prep'; interviewTitle: string; startsAt: Date }      // Interview today or tomorrow: build its prep pack
  | { kind: 'topup'; minutesLeft: number; active: boolean }       // Listening time is low (or no plan)
  | { kind: 'mock' }                                              // No practice this week
  | { kind: 'daily' };                                            // Today's question

// One thing to do next, in this order
export const suggestAction = (input: {
  hasResume: boolean | null; // null: not known (profiles aren't kept on the account)
  nextInterview: { title: string; startsAt: Date } | null;
  active: boolean;
  minutesLeft: number | null; // null: unlimited
  lowMinutes: number;
  sessionsThisWeek: number;
  now: Date;
}): Suggestion => {
  const { nextInterview: next, now } = input;
  if (input.hasResume === false) return { kind: 'resume' };
  if (next && next.startsAt > now && indiaDay(next.startsAt) <= addDays(indiaDay(now), 1)) {
    return { kind: 'prep', interviewTitle: next.title, startsAt: next.startsAt };
  }
  if (!input.active || (input.minutesLeft !== null && input.minutesLeft < input.lowMinutes)) {
    return { kind: 'topup', minutesLeft: input.active ? Math.round(input.minutesLeft ?? 0) : 0, active: input.active };
  }
  if (input.sessionsThisWeek === 0) return { kind: 'mock' };
  return { kind: 'daily' };
};

// ---------- Everything for one user ----------

export const dashboardFor = async (user: { id: string; profileSync: boolean }, now = new Date()) => {
  const userId = user.id;
  const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS);
  const [next, upcomingCount, plan, settings, sessions, dailyAnswers, profiles, totals, best] = await Promise.all([
    db.userInterview.findFirst({ where: { userId, startsAt: { gt: now } }, orderBy: { startsAt: 'asc' } }),
    db.userInterview.count({ where: { userId, startsAt: { gt: now } } }),
    allowance(userId),
    getSettings(),
    db.practiceSession.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true, averageScore: true } }),
    db.dailyAnswer.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.userProfile.findMany({ where: { userId }, select: { resumeChars: true } }),
    db.practiceSession.aggregate({ where: { userId }, _count: { _all: true }, _avg: { averageScore: true } }),
    db.practiceSession.aggregate({ where: { userId }, _max: { averageScore: true } }),
  ]);
  const lowMinutes = numberSetting(settings, 'lowMinutesWarning');
  const week = weekComparison(sessions, now);
  const practised = [...sessions.map(s => s.createdAt), ...dailyAnswers.map(a => a.createdAt)];
  const streak = { ...practiceStreak(practised, now), recent: recentDays(practised, now) };
  // Profiles kept on the account tell whether there's a resume; with that turned off it isn't known
  const hasResume = profiles.some(p => p.resumeChars > 0) ? true : user.profileSync ? false : null;

  return {
    now,
    nextInterview: next ? { clientId: next.clientId, title: next.title, startsAt: next.startsAt, profileClientId: next.profileClientId } : null,
    upcomingInterviews: upcomingCount,
    plan: {
      active: plan.active,
      onTrial: plan.onTrial,
      expiresAt: plan.expiresAt,
      minutesLeft: plan.minutesLeft,
      tokensLeft: plan.tokensLeft,
      answersLeft: plan.tokensLeft === null ? null : Math.floor(plan.tokensLeft / TOKENS_PER_ANSWER),
      lowMinutesWarning: lowMinutes,
    },
    week,
    streak,
    totals: {
      sessions: totals._count._all,
      averageScore: totals._avg.averageScore === null ? null : round1(totals._avg.averageScore),
      bestScore: best._max.averageScore,
      dailyAnswers: dailyAnswers.length,
    },
    hasResume,
    suggestion: suggestAction({
      hasResume, nextInterview: next, active: plan.active, minutesLeft: plan.minutesLeft, lowMinutes,
      sessionsThisWeek: week.sessions, now,
    }),
  };
};
