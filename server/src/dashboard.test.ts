import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { indiaDay, indiaWeeks, practiceStreak, recentDays, suggestAction, weekComparison } from './dashboard.js';
import { db } from './db.js';
import { clearSettingsCache } from './settings.js';

// The website's account dashboard (dashboard.ts, GET /api/me/dashboard)

const at = (iso: string) => new Date(iso);

describe('India days and weeks', () => {
  it('turns over at midnight in India, not UTC', () => {
    expect(indiaDay(at('2026-10-14T18:29:00Z'))).toBe('2026-10-14'); // 23:59 in India
    expect(indiaDay(at('2026-10-14T18:31:00Z'))).toBe('2026-10-15'); // 00:01 in India
  });

  it('starts weeks on Monday 00:00 in India', () => {
    // Thursday 15 October 2026
    const { thisWeek, lastWeek } = indiaWeeks(at('2026-10-15T06:00:00Z'));
    expect(thisWeek.toISOString()).toBe('2026-10-11T18:30:00.000Z');
    expect(lastWeek.toISOString()).toBe('2026-10-04T18:30:00.000Z');
    // Sunday night in India is still the same week; Monday 00:01 is the next one
    expect(indiaWeeks(at('2026-10-18T18:29:00Z')).thisWeek.toISOString()).toBe('2026-10-11T18:30:00.000Z');
    expect(indiaWeeks(at('2026-10-18T18:31:00Z')).thisWeek.toISOString()).toBe('2026-10-18T18:30:00.000Z');
  });
});

describe('practiceStreak', () => {
  const now = at('2026-10-15T10:00:00Z'); // 15:30 on the 15th in India

  it('counts days in a row up to today, once each however many sessions', () => {
    const s = practiceStreak([at('2026-10-15T04:00:00Z'), at('2026-10-15T05:00:00Z'), at('2026-10-14T10:00:00Z'), at('2026-10-13T10:00:00Z')], now);
    expect(s).toEqual({ days: 3, practisedToday: true, longest: 3, lastDay: '2026-10-15' });
  });

  it('keeps a streak that ran up to yesterday alive until today ends', () => {
    const s = practiceStreak([at('2026-10-14T10:00:00Z'), at('2026-10-13T10:00:00Z')], now);
    expect(s.days).toBe(2);
    expect(s.practisedToday).toBe(false);
  });

  it('is broken by a missed day', () => {
    expect(practiceStreak([at('2026-10-13T10:00:00Z'), at('2026-10-12T10:00:00Z')], now).days).toBe(0);
    expect(practiceStreak([], now)).toEqual({ days: 0, practisedToday: false, longest: 0, lastDay: null });
  });

  it('uses India days: 23:50 and 00:10 in India are two days in a row', () => {
    const late = at('2026-10-13T18:20:00Z');  // 23:50 on the 13th in India
    const early = at('2026-10-13T18:40:00Z'); // 00:10 on the 14th in India (still the 13th in UTC)
    expect(practiceStreak([late, early], at('2026-10-14T10:00:00Z')).days).toBe(2);
  });

  it('remembers the longest run', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-14', '2026-10-15'].map(d => at(`${d}T08:00:00Z`));
    expect(practiceStreak(days, now)).toMatchObject({ days: 2, longest: 4 });
  });
});

describe('recentDays', () => {
  it('lists the last 7 India days, oldest first, marking the ones practised', () => {
    const days = recentDays([at('2026-10-15T04:00:00Z'), at('2026-10-12T19:00:00Z'), at('2026-10-01T04:00:00Z')], at('2026-10-15T10:00:00Z'));
    expect(days.map(d => d.day)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
    // 19:00 UTC on the 12th is 00:30 on the 13th in India
    expect(days.filter(d => d.practised).map(d => d.day)).toEqual(['2026-10-13', '2026-10-15']);
  });
});

describe('weekComparison', () => {
  const now = at('2026-10-15T10:00:00Z'); // Thursday
  it('compares this week so far with last week', () => {
    const sessions = [
      { createdAt: at('2026-10-12T04:00:00Z'), averageScore: 7 },
      { createdAt: at('2026-10-14T04:00:00Z'), averageScore: 8 },
      { createdAt: at('2026-10-15T04:00:00Z'), averageScore: null },
      { createdAt: at('2026-10-11T18:00:00Z'), averageScore: 5 }, // Sunday 23:30 in India: last week
      { createdAt: at('2026-10-06T04:00:00Z'), averageScore: 6 },
      { createdAt: at('2026-10-01T04:00:00Z'), averageScore: 1 }, // Two weeks ago: not counted
    ];
    expect(weekComparison(sessions, now)).toEqual({
      startsOn: '2026-10-12', sessions: 3, previousSessions: 2, averageScore: 7.5, previousAverageScore: 5.5, scoreChange: 2,
    });
  });

  it('has no change when either week has no score', () => {
    expect(weekComparison([{ createdAt: at('2026-10-14T04:00:00Z'), averageScore: 7 }], now)).toMatchObject({ sessions: 1, previousSessions: 0, scoreChange: null });
  });
});

describe('suggestAction', () => {
  const now = at('2026-10-15T06:00:00Z'); // 11:30 in India
  const base = { hasResume: true, nextInterview: null, active: true, minutesLeft: 300, lowMinutes: 15, sessionsThisWeek: 2, now };
  const tomorrow = { title: 'Northwind', startsAt: at('2026-10-16T05:00:00Z') };

  it('asks for a resume first', () => {
    expect(suggestAction({ ...base, hasResume: false, nextInterview: tomorrow, active: false })).toEqual({ kind: 'resume' });
    // Not known (profiles aren't kept on the account): skipped
    expect(suggestAction({ ...base, hasResume: null }).kind).toBe('daily');
  });

  it('suggests a prep pack for an interview today or tomorrow, not later', () => {
    expect(suggestAction({ ...base, nextInterview: tomorrow })).toEqual({ kind: 'prep', interviewTitle: 'Northwind', startsAt: tomorrow.startsAt });
    expect(suggestAction({ ...base, nextInterview: { title: 'Today', startsAt: at('2026-10-15T09:00:00Z') } }).kind).toBe('prep');
    expect(suggestAction({ ...base, nextInterview: { title: 'Saturday', startsAt: at('2026-10-17T05:00:00Z') } }).kind).toBe('daily');
    // 23:00 on the 16th in India is tomorrow; 00:30 on the 17th isn't
    expect(suggestAction({ ...base, nextInterview: { title: 'Late', startsAt: at('2026-10-16T17:30:00Z') } }).kind).toBe('prep');
    expect(suggestAction({ ...base, nextInterview: { title: 'After midnight', startsAt: at('2026-10-16T19:00:00Z') } }).kind).toBe('daily');
  });

  it('suggests a top-up when listening time is low or there is no plan', () => {
    expect(suggestAction({ ...base, minutesLeft: 10 })).toEqual({ kind: 'topup', minutesLeft: 10, active: true });
    expect(suggestAction({ ...base, active: false, minutesLeft: 0 })).toEqual({ kind: 'topup', minutesLeft: 0, active: false });
    expect(suggestAction({ ...base, minutesLeft: null }).kind).toBe('daily'); // Unlimited
    expect(suggestAction({ ...base, minutesLeft: 15 }).kind).toBe('daily');
  });

  it('suggests a mock interview when there was no practice this week, else the question of the day', () => {
    expect(suggestAction({ ...base, sessionsThisWeek: 0 })).toEqual({ kind: 'mock' });
    expect(suggestAction(base)).toEqual({ kind: 'daily' });
  });
});

// ---------- The endpoint ----------

const ai: AiGateway = {
  streamChat: async () => ({ text: '', provider: 'groq', model: 'test', inputTokens: 0, outputTokens: 0 }),
  transcribe: async () => ({ text: '', provider: 'groq', model: 'test' }),
};
const app = createApp({ ai, razorpay: null });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

let token: string;
let userId: string;

beforeEach(async () => {
  await db.dailyAnswer.deleteMany();
  await db.dailyQuestion.deleteMany();
  await db.userInterview.deleteMany();
  await db.practiceSession.deleteMany();
  await db.userProfile.deleteMany();
  await db.purchase.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  const res = await request(app).post('/api/auth/register').send({ email: 'asha@example.com', name: 'Asha', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;
});

const dashboard = async () => {
  const res = await request(app).get('/api/me/dashboard').set(auth(token));
  expect(res.status).toBe(200);
  return res.body;
};

describe('GET /api/me/dashboard', () => {
  it('needs a sign-in', async () => {
    expect((await request(app).get('/api/me/dashboard')).status).toBe(401);
  });

  it('starts empty for a new account, suggesting a resume', async () => {
    const d = await dashboard();
    expect(d.nextInterview).toBeNull();
    expect(d.streak).toMatchObject({ days: 0, practisedToday: false });
    expect(d.week).toMatchObject({ sessions: 0, previousSessions: 0, averageScore: null });
    expect(d.totals).toMatchObject({ sessions: 0, bestScore: null, dailyAnswers: 0 });
    expect(d.plan).toMatchObject({ active: false, lowMinutesWarning: 15 });
    expect(d.suggestion).toEqual({ kind: 'resume' });
  });

  it('counts practice sessions and daily answers together for the streak, and totals', async () => {
    const session = (createdAt: Date, averageScore: number | null) =>
      db.practiceSession.create({ data: { userId, questionCount: 3, averageScore, createdAt } });
    await session(new Date(), 8);
    await session(ago(1), 6.5);
    await session(ago(5), 9);
    const q = await db.dailyQuestion.create({ data: { date: '2026-01-01', text: 'Tell me about a failure.' } });
    await db.dailyAnswer.create({ data: { userId, dailyQuestionId: q.id, answer: 'Once…', score: 7, createdAt: ago(2) } });
    // Someone else's practice doesn't count
    const other = await db.user.create({ data: { email: 'ravi@example.com', name: 'Ravi', passwordHash: 'x' } });
    await db.practiceSession.create({ data: { userId: other.id, questionCount: 1, averageScore: 10, createdAt: ago(3) } });

    const d = await dashboard();
    expect(d.streak).toMatchObject({ days: 3, practisedToday: true });
    expect(d.streak.recent).toHaveLength(7);
    expect(d.streak.recent.slice(-3).every((r: { practised: boolean }) => r.practised)).toBe(true);
    expect(d.totals).toMatchObject({ sessions: 3, bestScore: 9, averageScore: 7.8, dailyAnswers: 1 });
    expect(d.week.sessions + d.week.previousSessions).toBeGreaterThanOrEqual(2);
  });

  it('shows the next interview and suggests things in order: resume, prep pack, top-up, mock interview, question of the day', async () => {
    await db.userProfile.create({ data: { userId, clientId: 'p1', name: 'Google', resumeChars: 0 } });
    expect((await dashboard()).suggestion.kind).toBe('resume');
    await db.userProfile.update({ where: { userId_clientId: { userId, clientId: 'p1' } }, data: { resumeChars: 1200 } });

    await request(app).put('/api/interviews/i1').set(auth(token)).send({ title: 'Northwind', startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });
    await request(app).put('/api/interviews/i2').set(auth(token)).send({ title: 'Later', startsAt: new Date(Date.now() + 10 * DAY).toISOString() });
    let d = await dashboard();
    expect(d.nextInterview).toMatchObject({ clientId: 'i1', title: 'Northwind' });
    expect(d.upcomingInterviews).toBe(2);
    expect(d.suggestion).toMatchObject({ kind: 'prep', interviewTitle: 'Northwind' });

    await request(app).delete('/api/interviews/i1').set(auth(token));
    expect((await dashboard()).suggestion).toEqual({ kind: 'topup', minutesLeft: 0, active: false });

    await db.purchase.create({ data: { userId, planName: 'Pro', source: 'ADMIN_GRANT', expiresAt: new Date(Date.now() + 30 * DAY), listeningMinutes: 10, tokenLimit: 100_000 } });
    d = await dashboard();
    expect(d.plan).toMatchObject({ active: true, minutesLeft: 10, tokensLeft: 100_000, answersLeft: 40 });
    expect(d.suggestion).toMatchObject({ kind: 'topup', minutesLeft: 10, active: true });

    await db.purchase.updateMany({ data: { listeningMinutes: 600 } });
    expect((await dashboard()).suggestion).toEqual({ kind: 'mock' });

    await db.practiceSession.create({ data: { userId, questionCount: 3, averageScore: 7 } });
    expect((await dashboard()).suggestion).toEqual({ kind: 'daily' });
  });

  it('skips the resume rule when profiles aren’t kept on the account', async () => {
    await db.user.update({ where: { id: userId }, data: { profileSync: false } });
    expect((await dashboard()).suggestion.kind).toBe('topup');
  });
});
