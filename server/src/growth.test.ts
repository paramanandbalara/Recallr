import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { clearSettingsCache } from './settings.js';
import { testOutbox } from './mailer.js';
import { sendWeeklyEmails } from './jobs.js';
import { isWeeklyEmailTime, weeklyTip } from './weekly.js';

// Question bank, practice results, and organizations (colleges and bootcamps)

const ai: AiGateway = {
  streamChat: async (_req, onText) => {
    onText('## What the interviewer wants to learn\nHow you think.', 'claude');
    return { text: '## What the interviewer wants to learn\nHow you think.', provider: 'claude', model: 'claude-opus-5-5', inputTokens: 100, outputTokens: 50 };
  },
  transcribe: async () => ({ text: '', provider: 'groq', model: 'whisper-test' }),
};
const app = createApp({ ai, razorpay: null });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token as string;
};
const appToken = async (email: string, fingerprint = `${email}-computer-fingerprint`) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123', device: { fingerprint, name: 'PC', platform: 'win32', appVersion: '1.0.0' } });
  expect(res.status).toBe(200);
  return res.body.token as string;
};

let admin: string;

beforeEach(async () => {
  testOutbox.length = 0;
  await db.enquiry.deleteMany();
  await db.question.deleteMany();
  await db.organization.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.device.deleteMany();
  await db.trialClaim.deleteMany();
  await db.usageEvent.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.coupon.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  admin = await register('admin@example.com');
});

describe('question bank', () => {
  const record = (token: string, items: object[]) => request(app).post('/api/questions/record').set(auth(token)).send({ items });

  it('keeps each question once, counts repeats, and saves answers on the account', async () => {
    await register('priya@example.com');
    const app1 = await appToken('priya@example.com');
    await record(app1, [
      { question: 'How would you design a URL shortener?', answer: 'Split reads and writes.', kind: 'design', provider: 'claude' },
      { question: 'Okay.', answer: 'x', kind: 'other' }, // Not a question: skipped
    ]).expect(200);
    await record(app1, [{ question: 'how would you design a url shortener', answer: 'Use base62 codes.', kind: 'design' }]).expect(200);

    const questions = await db.question.findMany();
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ category: 'SYSTEM_DESIGN', timesAsked: 2, published: false });

    const mine = (await request(app).get('/api/questions/mine').set(auth(app1))).body;
    expect(mine.answers.map((a: { answer: string }) => a.answer)).toEqual(['Use base62 codes.', 'Split reads and writes.']);
    expect(mine.byCategory).toEqual({ SYSTEM_DESIGN: 2 });
    expect((await request(app).get('/api/questions/mine?category=CODING').set(auth(app1))).body.answers).toHaveLength(0);
  });

  it('keeps only the question when the user turned saving off', async () => {
    const web = await register('raj@example.com');
    await request(app).patch('/api/auth/me').set(auth(web)).send({ saveAnswers: false }).expect(200);
    const desktop = await appToken('raj@example.com');
    await record(desktop, [{ question: 'Tell me about yourself please.', answer: 'I am Raj.', kind: 'about-you' }]).expect(200);
    expect(await db.question.count()).toBe(1);
    expect(await db.savedAnswer.count()).toBe(0);
  });

  it('only takes questions from the app, and lets users delete their answers', async () => {
    const web = await register('asha@example.com');
    expect((await record(web, [{ question: 'What is a closure in JavaScript?' }])).status).toBe(403);
    const desktop = await appToken('asha@example.com');
    await record(desktop, [{ question: 'What is a closure in JavaScript?', answer: 'A function with its scope.', kind: 'concept' }]);
    const [answer] = (await request(app).get('/api/questions/mine').set(auth(web))).body.answers;
    await request(app).delete(`/api/questions/mine/${answer.id}`).set(auth(web)).expect(200);
    expect(await db.savedAnswer.count()).toBe(0);
    expect(await db.question.count()).toBe(1); // The question stays in the bank
  });

  it('publishes questions on the website once they have a guide', async () => {
    const desktop = await appToken((await register('dev@example.com'), 'dev@example.com'));
    await record(desktop, [{ question: 'Write a function that reverses a linked list.', answer: 'Iterate with three pointers.', kind: 'coding' }]);
    const { questions } = (await request(app).get('/api/admin/questions').set(auth(admin))).body;
    const id = questions[0].id;
    expect(questions[0].savedAnswers).toBe(1);

    expect((await request(app).patch(`/api/admin/questions/${id}`).set(auth(admin)).send({ published: true })).status).toBe(400);
    const { guide } = (await request(app).post(`/api/admin/questions/${id}/draft-guide`).set(auth(admin))).body;
    expect(guide).toContain('## What the interviewer wants to learn');
    const published = (await request(app).patch(`/api/admin/questions/${id}`).set(auth(admin)).send({ guide, published: true })).body.question;
    expect(published.slug).toBe('write-a-function-that-reverses-a-linked-list');

    const list = (await request(app).get('/api/public/questions?category=coding')).body;
    expect(list.questions).toEqual([expect.objectContaining({ slug: published.slug, categorySlug: 'coding' })]);
    expect(list.categories.find((c: { category: string }) => c.category === 'CODING').count).toBe(1);
    const page = (await request(app).get(`/api/public/questions/${published.slug}`)).body;
    expect(page.question.guide).toBe(guide);
    expect(JSON.stringify(page)).not.toContain('three pointers'); // Never anyone's own answer

    await request(app).patch(`/api/admin/questions/${id}`).set(auth(admin)).send({ published: false }).expect(200);
    expect((await request(app).get(`/api/public/questions/${published.slug}`)).status).toBe(404);
    expect((await request(app).get('/api/admin/questions').set(auth(desktop))).status).toBe(403);
  });
});

describe('practice', () => {
  it('saves mock interview results with speaking feedback', async () => {
    const token = await register('maya@example.com');
    const res = await request(app).post('/api/practice').set(auth(token)).send({
      role: 'Data analyst',
      answers: [
        { question: 'Tell me about yourself.', score: 7, wordsPerMinute: 150, fillers: 3, seconds: 60 },
        { question: 'Explain a JOIN.', score: 9, wordsPerMinute: 130, fillers: 1, seconds: 60 },
      ],
    }).expect(201);
    expect(res.body.session).toMatchObject({ questionCount: 2, averageScore: 8, wordsPerMinute: 140, fillersPerMinute: 2 });
    expect((await request(app).get('/api/practice').set(auth(token))).body.sessions).toHaveLength(1);
  });
});

describe('organizations', () => {
  const createOrg = async (seats = 2) => (await request(app).post('/api/admin/organizations').set(auth(admin)).send({
    name: 'Pune Institute', kind: 'COLLEGE', seats, memberMinutes: 120, memberTokens: null, memberDays: 60,
  }).expect(201)).body.organization;

  it('lets students join with the invite link until the seats run out', async () => {
    const org = await createOrg(1);
    const invite = (await request(app).get(`/api/organizations/invite/${org.inviteCode}`)).body;
    expect(invite).toMatchObject({ name: 'Pune Institute', open: true, seatsLeft: 1 });

    const student = await register('student1@example.com');
    await request(app).post('/api/organizations/join').set(auth(student)).send({ code: org.inviteCode.toLowerCase() }).expect(201);
    const allowance = (await request(app).get('/api/auth/me').set(auth(student))).body.allowance;
    expect(allowance.active).toBe(true);
    expect(allowance.minutesLeft).toBe(120);
    expect((await request(app).post('/api/organizations/join').set(auth(student)).send({ code: org.inviteCode })).body.code).toBe('ALREADY_MEMBER');

    const other = await register('student2@example.com');
    expect((await request(app).post('/api/organizations/join').set(auth(other)).send({ code: org.inviteCode })).body.code).toBe('ORG_FULL');
    expect((await request(app).get(`/api/organizations/invite/${org.inviteCode}`)).body.open).toBe(false);
  });

  it('shows coaches their students’ practice progress, and lets them free a seat', async () => {
    const org = await createOrg();
    const coach = await register('coach@example.com');
    await request(app).post(`/api/admin/organizations/${org.id}/coaches`).set(auth(admin)).send({ email: 'coach@example.com' }).expect(200);
    const student = await register('student@example.com');
    await request(app).post('/api/organizations/join').set(auth(student)).send({ code: org.inviteCode }).expect(201);
    await request(app).post('/api/practice').set(auth(student)).send({ answers: [{ question: 'Q', score: 6, wordsPerMinute: 160, fillers: 4, seconds: 120 }] }).expect(201);

    expect((await request(app).get(`/api/organizations/${org.id}`).set(auth(student))).status).toBe(403);
    const view = (await request(app).get(`/api/organizations/${org.id}`).set(auth(coach))).body;
    expect(view.organization).toMatchObject({ seats: 2, seatsUsed: 1 });
    expect(view.students).toEqual([expect.objectContaining({ email: 'student@example.com', mockInterviews: 1, recentScore: 6, wordsPerMinute: 160, fillersPerMinute: 2 })]);

    const studentId = view.students[0].userId;
    await request(app).delete(`/api/organizations/${org.id}/students/${studentId}`).set(auth(coach)).expect(200);
    expect((await request(app).get('/api/auth/me').set(auth(student))).body.allowance.active).toBe(false);
    expect((await request(app).get(`/api/organizations/${org.id}`).set(auth(coach))).body.organization.seatsUsed).toBe(0);
  });

  it('takes enquiries from the website for the admin', async () => {
    await request(app).post('/api/enquiries').send({ name: 'Dr Rao', email: 'rao@college.edu', organization: 'City College', size: 300 }).expect(201);
    expect((await request(app).post('/api/enquiries').send({ name: 'x', email: 'bad', organization: 'y' })).status).toBe(400);
    const { enquiries } = (await request(app).get('/api/admin/enquiries').set(auth(admin))).body;
    expect(enquiries).toEqual([expect.objectContaining({ organization: 'City College', size: 300, status: 'NEW' })]);
  });
});

describe('panels', () => {
  it('lets users download their data and close their account', async () => {
    const token = await register('leaving@example.com');
    const desktop = await appToken('leaving@example.com');
    await request(app).post('/api/questions/record').set(auth(desktop)).send({ items: [{ question: 'What is a hash map and when do you use it?', answer: 'A key to value store.', kind: 'concept' }] });
    const data = (await request(app).get('/api/auth/me/export').set(auth(token))).body;
    expect(data.account.email).toBe('leaving@example.com');
    expect(data.savedAnswers).toEqual([expect.objectContaining({ answer: 'A key to value store.', category: 'CONCEPT' })]);
    expect(JSON.stringify(data)).not.toContain('passwordHash');

    // Newer personal data: WhatsApp number and log, billing details, a daily answer, a practice room
    const leaving = await db.user.update({ where: { email: 'leaving@example.com' }, data: { phone: '+919876543210', whatsappDaily: true, billingName: 'Leaving Person', gstin: '27AAPFU0939F1ZV' } });
    const daily = await db.dailyQuestion.create({ data: { date: '2026-01-01', text: 'Tell me about yourself.' } });
    await db.dailyAnswer.create({ data: { userId: leaving.id, dailyQuestionId: daily.id, answer: 'I build APIs.' } });
    await db.whatsAppLog.create({ data: { userId: leaving.id, to: '+919876543210', template: 'daily_question', status: 'sent' } });
    await db.peerRoom.create({ data: { code: 'LEAVE1', hostId: leaving.id, state: '{}', expiresAt: new Date(Date.now() + 3_600_000) } });

    expect((await request(app).post('/api/auth/me/delete').set(auth(token)).send({ password: 'wrong' })).status).toBe(400);
    await request(app).post('/api/auth/me/delete').set(auth(token)).send({ password: 'password123' }).expect(200);
    expect(await db.user.findUnique({ where: { email: 'leaving@example.com' } })).toBeNull();
    expect(await db.savedAnswer.count()).toBe(0);
    const closed = await db.user.findUniqueOrThrow({ where: { id: leaving.id } });
    expect(closed).toMatchObject({ phone: '', whatsappDaily: false, billingName: '', gstin: '' });
    expect(await db.dailyAnswer.count({ where: { userId: leaving.id } })).toBe(0);
    expect(await db.whatsAppLog.count({ where: { userId: leaving.id } })).toBe(0);
    expect(await db.peerRoom.count({ where: { hostId: leaving.id } })).toBe(0);
    await db.dailyQuestion.delete({ where: { id: daily.id } });
    expect((await request(app).post('/api/auth/login').send({ email: 'leaving@example.com', password: 'password123' })).status).toBe(401);
    expect((await request(app).post('/api/auth/me/delete').set(auth(admin)).send({ password: 'password123' })).body.error).toMatch(/only admin/);
  });

  it('gives admins app versions, a users spreadsheet and AI speed', async () => {
    await register('sheet@example.com');
    await appToken('sheet@example.com');
    const stats = (await request(app).get('/api/admin/stats').set(auth(admin))).body;
    expect(stats.appVersions).toEqual([{ version: '1.0.0', computers: 1 }]);
    const csv = await request(app).get('/api/admin/users.csv').set(auth(admin));
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toBe('name,email,role,status,joined,last_seen,plan_until,listening_minutes_left');
    expect(csv.text).toContain('sheet@example.com');

    const user = await db.user.findUniqueOrThrow({ where: { email: 'sheet@example.com' } });
    await db.usageEvent.createMany({ data: [
      { userId: user.id, kind: 'CHAT', provider: 'groq', model: 'gpt-oss-20b', latencyMs: 400 },
      { userId: user.id, kind: 'CHAT', provider: 'groq', model: 'gpt-oss-20b', latencyMs: 600 },
      { userId: user.id, kind: 'CHAT', provider: 'claude', model: 'claude-haiku-5-5', latencyMs: 700 },
    ] });
    const { speed } = (await request(app).get('/api/admin/reports?days=7').set(auth(admin))).body;
    expect(speed).toEqual([
      { provider: 'groq', model: 'gpt-oss-20b', answers: 2, averageMs: 500, slowestMs: 600 },
      { provider: 'claude', model: 'claude-haiku-5-5', answers: 1, averageMs: 700, slowestMs: 700 },
    ]);
  });
});

describe('weekly email', () => {
  const MONDAY_10_IST = new Date('2026-10-19T04:30:00Z');
  const sent = () => testOutbox.filter(e => e.kind === 'weekly_progress');

  it('picks one tip for the weakest area', () => {
    const base = { mockInterviews: 2, score: 7, previousScore: 6, wordsPerMinute: 140, fillersPerMinute: 1, questionsSaved: 0 };
    expect(weeklyTip({ ...base, mockInterviews: 0 })).toMatch(/one short mock interview/);
    expect(weeklyTip({ ...base, fillersPerMinute: 5 })).toMatch(/filler words/);
    expect(weeklyTip({ ...base, wordsPerMinute: 180 })).toMatch(/fast/);
    expect(weeklyTip({ ...base, wordsPerMinute: 90 })).toMatch(/slowly/);
    expect(weeklyTip({ ...base, score: 5 })).toMatch(/Story bank/);
    expect(weeklyTip({ ...base, score: 6, previousScore: 7 })).toMatch(/dipped/);
    expect(weeklyTip(base)).toMatch(/Prep pack/);
  });

  it('goes out on Monday morning in India only', () => {
    expect(isWeeklyEmailTime(MONDAY_10_IST)).toBe(true);
    expect(isWeeklyEmailTime(new Date('2026-10-19T02:00:00Z'))).toBe(false); // 7:30 IST
    expect(isWeeklyEmailTime(new Date('2026-10-20T04:30:00Z'))).toBe(false); // Tuesday
  });

  it('sends once a week to active users, with practice numbers and a working unsubscribe link', async () => {
    const token = await register('weekly@example.com');
    await request(app).post('/api/practice').set(auth(token)).send({ answers: [{ question: 'Q', score: 6, wordsPerMinute: 150, fillers: 9, seconds: 120 }] });
    const quiet = await register('quiet@example.com');
    await request(app).patch('/api/auth/me').set(auth(quiet)).send({ weeklyEmail: false }).expect(200);
    await db.practiceSession.updateMany({ data: { createdAt: new Date('2026-10-17T10:00:00Z') } });
    await db.user.updateMany({ data: { lastSeenAt: new Date('2026-10-16T10:00:00Z') } });

    expect(await sendWeeklyEmails(new Date('2026-10-20T04:30:00Z'))).toBe(0); // Not Monday
    expect(await sendWeeklyEmails(MONDAY_10_IST)).toBe(2); // The admin and weekly@ (quiet@ turned it off)
    expect(await sendWeeklyEmails(new Date(MONDAY_10_IST.getTime() + 30 * 60 * 1000))).toBe(0); // Already sent this week
    await new Promise(resolve => setTimeout(resolve, 50));
    const email = sent().find(e => e.to === 'weekly@example.com')!;
    expect(email.text).toMatch(/1 mock interview, with an average score of 6 out of 10/);
    expect(email.text).toMatch(/4.5 filler words a minute/);
    expect(email.text).toMatch(/Tip for this week: You used quite a few filler words/);

    const link = new URL(email.text.match(/https?:\/\/\S+weekly\/off\S+/)![0]);
    const off = await request(app).get(`${link.pathname}${link.search}`);
    expect(off.text).toContain('Weekly email turned off');
    expect((await db.user.findUniqueOrThrow({ where: { email: 'weekly@example.com' } })).weeklyEmail).toBe(false);
    expect((await request(app).get(`${link.pathname}?u=${link.searchParams.get('u')}&t=forged-token-value-123`)).text).toContain('doesn’t work');
  });
});

describe('company research route', () => {
  it('turns the company website into notes, counted against the plan', async () => {
    const pages: string[] = [];
    const researchApp = createApp({
      ai, razorpay: null,
      readSite: async url => { pages.push(url); return [{ url: 'https://northwind.com/', text: 'Northwind builds route planning for couriers.' }]; },
    });
    await register('research@example.com');
    const desktop = await appToken('research@example.com');
    const user = await db.user.findUniqueOrThrow({ where: { email: 'research@example.com' } });
    expect((await request(researchApp).post('/api/ai/company-research').set(auth(desktop)).send({ url: 'northwind.com' })).status).toBe(402); // No plan
    await db.purchase.create({ data: { userId: user.id, planName: 'Test', source: 'ADMIN_GRANT', expiresAt: new Date(Date.now() + 86_400_000), listeningMinutes: 60, tokenLimit: 100_000 } });
    const res = await request(researchApp).post('/api/ai/company-research').set(auth(desktop)).send({ url: 'northwind.com' }).expect(200);
    expect(res.body).toEqual({ notes: expect.stringContaining('What the interviewer wants'), sources: ['https://northwind.com/'] });
    expect(pages).toEqual(['northwind.com']);
    expect(await db.usageEvent.count({ where: { userId: user.id } })).toBe(1);
  });
});
