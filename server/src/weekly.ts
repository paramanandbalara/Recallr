import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { db } from './db.js';
import { env, publicUrl } from './env.js';

// The weekly email: last week's practice next to the week before, and one tip for the weakest area.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WeekStats {
  mockInterviews: number;
  score: number | null;         // Average mock interview score this week
  previousScore: number | null; // ...and the week before
  wordsPerMinute: number | null;
  fillersPerMinute: number | null;
  questionsSaved: number;       // Interview questions answered this week
}

const average = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null;
};

export const weekStats = async (userId: string, now = new Date()): Promise<WeekStats> => {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
  const [thisWeek, lastWeek, questionsSaved] = await Promise.all([
    db.practiceSession.findMany({ where: { userId, createdAt: { gte: weekAgo, lt: now } } }),
    db.practiceSession.findMany({ where: { userId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    db.savedAnswer.count({ where: { userId, createdAt: { gte: weekAgo, lt: now } } }),
  ]);
  return {
    mockInterviews: thisWeek.length,
    score: average(thisWeek.map(s => s.averageScore)),
    previousScore: average(lastWeek.map(s => s.averageScore)),
    wordsPerMinute: average(thisWeek.map(s => s.wordsPerMinute)),
    fillersPerMinute: average(thisWeek.map(s => s.fillersPerMinute)),
    questionsSaved,
  };
};

// One tip, for whatever needs the most work this week
export const weeklyTip = (stats: WeekStats): string => {
  if (stats.mockInterviews === 0) {
    return 'Do one short mock interview this week, even three questions. Saying answers out loud once makes them much easier in the real thing.';
  }
  if (stats.fillersPerMinute !== null && stats.fillersPerMinute >= 4) {
    return 'You used quite a few filler words ("um", "like"). Next time, when you need a second to think, just pause. A short silence sounds more sure than a filler.';
  }
  if (stats.wordsPerMinute !== null && stats.wordsPerMinute > 165) {
    return 'You spoke a little fast. Try to slow down and take a breath between points: it gives the interviewer time to follow you.';
  }
  if (stats.wordsPerMinute !== null && stats.wordsPerMinute < 110) {
    return 'You spoke a little slowly. Start each answer with your main point in one sentence, then add the detail. It keeps you moving.';
  }
  if (stats.score !== null && stats.score < 6) {
    return 'For "Tell me about a time…" questions, use one real story: what the problem was, what you did, and the result with a number. Add your best stories to the Story bank.';
  }
  if (stats.score !== null && stats.previousScore !== null && stats.score < stats.previousScore) {
    return 'Your score dipped a little this week. Practise the questions you found hardest again: in the app, choose "My past interviews" in Mock interview.';
  }
  return 'You\'re doing well. Build a Prep pack for your next job: it predicts the questions that job will ask, with an answer to each from your resume.';
};

// Unsubscribe links work without signing in, so they carry a signature of the user id
const unsubscribeToken = (userId: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`weekly-email:${userId}`).digest('base64url').slice(0, 32);

export const checkUnsubscribeToken = (userId: string, token: string) => {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

export const unsubscribeUrl = (user: Pick<User, 'id'>) => `${publicUrl}/api/emails/weekly/off?u=${encodeURIComponent(user.id)}&t=${unsubscribeToken(user.id)}`;

// Monday from 9:00 in India (where Recallr's users are), checked by the half-hourly job
export const isWeeklyEmailTime = (now: Date) => {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCDay() === 1 && ist.getUTCHours() >= 9;
};
