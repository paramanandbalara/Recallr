import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway, ChatRequest } from './ai.js';
import { createApp } from './app.js';
import { createDailyQuestion, istDay, istDayStart, streakFrom } from './daily.js';
import { db } from './db.js';
import { usageSaved } from './entitlements.js';
import { clearSettingsCache } from './settings.js';

// The question of the day: made once a day, answered with AI feedback on the plan, and the streak

const chats: ChatRequest[] = [];
const ai: AiGateway = {
  streamChat: async req => {
    chats.push(req);
    const text = req.system.includes('question of the day')
      ? '{"question":"How do you handle tight deadlines at work?"}'
      : '{"score":6,"good":"Honest.","improve":"Give one real example.","better":"When our release was close, I..."}';
    return { text, provider: 'groq', model: 'gpt-oss', inputTokens: 200, outputTokens: 100 };
  },
  transcribe: async () => ({ text: '', provider: 'groq', model: 'whisper-test' }),
};
const app = createApp({ ai, razorpay: null });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, id: res.body.user.id as string };
};
const givePlan = (userId: string) => db.purchase.create({
  data: { userId, planName: 'Pro', source: 'ADMIN_GRANT', expiresAt: new Date(Date.now() + 30 * 86_400_000), listeningMinutes: 100, tokenLimit: 100_000 },
});
const addQuestion = (text: string, category: 'ABOUT_YOU' | 'EXPERIENCE' | 'CODING', published = true) =>
  db.question.create({ data: { text, textHash: text, category, published, slug: published ? text.slice(0, 20).replace(/\W+/g, '-') : null } });

// 10:00 in India on a given day
const at = (day: string, hour = 10, minute = 0) => new Date(istDayStart(day).getTime() + (hour * 60 + minute) * 60_000);
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  chats.length = 0;
  await db.dailyQuestion.deleteMany();
  await db.question.deleteMany();
  await db.practiceSession.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.device.deleteMany();
  await db.usageEvent.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
});

describe('making the question of the day', () => {
  it('makes one question a day from 00:05 India time, across servers, from the published bank', async () => {
    await addQuestion('Tell me about yourself please.', 'ABOUT_YOU');
    await addQuestion('Tell me about a time you failed.', 'EXPERIENCE');
    await addQuestion('Not published question here.', 'CODING', false);
    const day = '2026-10-20';

    expect(await createDailyQuestion(ai, at(day, 0, 2))).toBeNull(); // Before 00:05
    const made = await Promise.all([createDailyQuestion(ai, at(day, 0, 10)), createDailyQuestion(ai, at(day, 0, 10)), createDailyQuestion(ai, at(day, 0, 40))]);
    expect(made.filter(Boolean)).toHaveLength(1);
    const rows = await db.dailyQuestion.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: day, category: 'ABOUT_YOU', text: 'Tell me about yourself please.' });
    expect(chats).toHaveLength(0);

    // The next day: the next category in the rotation
    const next = await createDailyQuestion(ai, at(shift(day, 1), 1));
    expect(next).toMatchObject({ category: 'EXPERIENCE', text: 'Tell me about a time you failed.' });

    // Then nothing unused is left in the bank: the AI writes one
    const third = await createDailyQuestion(ai, at(shift(day, 2), 1));
    expect(third?.text).toBe('How do you handle tight deadlines at work?');
    expect(chats).toHaveLength(1);
  });

  it('does not reuse a question from the last 90 days', async () => {
    await addQuestion('Tell me about yourself please.', 'ABOUT_YOU');
    await db.dailyQuestion.create({ data: { date: '2026-08-01', text: 'Tell me about yourself please.', category: 'ABOUT_YOU' } });
    expect((await createDailyQuestion(ai, at('2026-10-20')))?.text).toBe('How do you handle tight deadlines at work?');
    // After 90 days it may come back
    expect((await createDailyQuestion(ai, at('2026-11-05')))?.text).toBe('Tell me about yourself please.');
  });
});

describe('answering it', () => {
  it('gives AI feedback counted on the plan, one answer a day that "try again" replaces', async () => {
    await addQuestion('Tell me about yourself please.', 'ABOUT_YOU');
    const user = await register('priya@example.com');

    const today = (await request(app).get('/api/daily').set(auth(user.token)).expect(200)).body;
    expect(today).toMatchObject({ question: { date: istDay(new Date()), text: 'Tell me about yourself please.' }, answer: null, streak: 0 });
    expect(today.days).toHaveLength(14);

    expect((await request(app).post('/api/daily/answer').set(auth(user.token)).send({ answer: 'I am a developer.' })).status).toBe(402);
    expect((await request(app).post('/api/daily/answer').set(auth(user.token)).send({ answer: '  ' })).status).toBe(400);

    const pack = await givePlan(user.id);
    const first = await request(app).post('/api/daily/answer').set(auth(user.token)).send({ answer: 'I am a developer.', questionId: today.question.id }).expect(200);
    expect(first.body).toMatchObject({ answer: { answer: 'I am a developer.', score: 6, feedback: { good: 'Honest.', improve: 'Give one real example.' } }, streak: 1 });
    expect(chats[0].user).toContain('Tell me about yourself please.');

    const again = await request(app).post('/api/daily/answer').set(auth(user.token)).send({ answer: 'I build payment apps in Java.' }).expect(200);
    expect(again.body.answer.answer).toBe('I build payment apps in Java.');
    expect(await db.dailyAnswer.count()).toBe(1);
    await usageSaved();
    expect((await db.purchase.findUniqueOrThrow({ where: { id: pack.id } })).usedTokens).toBe(600);

    // A stale question (the day changed) is refused
    expect((await request(app).post('/api/daily/answer').set(auth(user.token)).send({ answer: 'x', questionId: 'old' })).status).toBe(409);

    const after = (await request(app).get('/api/daily').set(auth(user.token)).expect(200)).body;
    expect(after.answer.score).toBe(6);
    expect(after.days[13]).toEqual({ date: istDay(new Date()), done: true });
  });

  it('counts the streak from daily answers and practice sessions, India days in a row', async () => {
    const user = await register('raj@example.com');
    const today = istDay(new Date());
    const q1 = await db.dailyQuestion.create({ data: { date: shift(today, -1), text: 'Why this company?', category: 'OTHER' } });
    const q3 = await db.dailyQuestion.create({ data: { date: shift(today, -4), text: 'Why this role?', category: 'OTHER' } });
    await db.dailyAnswer.create({ data: { userId: user.id, dailyQuestionId: q1.id, answer: 'x', score: 5 } });
    await db.dailyAnswer.create({ data: { userId: user.id, dailyQuestionId: q3.id, answer: 'x', score: 5 } });
    await db.practiceSession.create({ data: { userId: user.id, questionCount: 3, createdAt: at(shift(today, -2), 23, 30) } });
    // Day -3 missing: the streak is yesterday and the day before (today isn't done yet, which doesn't break it)
    const body = (await request(app).get('/api/daily').set(auth(user.token)).expect(200)).body;
    expect(body.streak).toBe(2);
    expect(body.history.map((h: { date: string; answered: boolean }) => [h.date, h.answered])).toEqual([[shift(today, -1), true], [shift(today, -4), true]]);

    expect(streakFrom(new Set(['2026-10-13', '2026-10-14', '2026-10-15']), '2026-10-15')).toBe(3);
    expect(streakFrom(new Set(['2026-10-13', '2026-10-14']), '2026-10-15')).toBe(2);
    expect(streakFrom(new Set(['2026-10-13']), '2026-10-15')).toBe(0);
  });
});
