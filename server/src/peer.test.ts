import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway, ChatRequest } from './ai.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { usageSaved } from './entitlements.js';
import { cleanupPeerRooms } from './routes/peer.js';
import { clearSettingsCache } from './settings.js';

// Peer practice: rooms, who may do what, expiry, and AI scores counted on the candidate's plan

const chats: ChatRequest[] = [];
const ai: AiGateway = {
  streamChat: async req => {
    chats.push(req);
    const text = '{"score":8,"good":"A clear example.","improve":"Say the result with a number.","better":"In my last project I..."}';
    return { text, provider: 'claude', model: 'claude-opus-5-5', inputTokens: 100, outputTokens: 50 };
  },
  transcribe: async () => ({ text: '', provider: 'groq', model: 'whisper-test' }),
};
const app = createApp({ ai, razorpay: null });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return { web: res.body.token as string, id: res.body.user.id as string };
};
const appToken = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123', device: { fingerprint: `${email}-computer-fingerprint`, name: 'PC', platform: 'win32', appVersion: '1.0.0' } });
  expect(res.status).toBe(200);
  return res.body.token as string;
};
const givePlan = (userId: string) => db.purchase.create({
  data: { userId, planName: 'Pro', source: 'ADMIN_GRANT', expiresAt: new Date(Date.now() + 30 * 86_400_000), listeningMinutes: 100, tokenLimit: 100_000 },
});

beforeEach(async () => {
  chats.length = 0;
  await db.peerRoom.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.device.deleteMany();
  await db.trialClaim.deleteMany();
  await db.usageEvent.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
});

const setup = async () => {
  const asha = await register('asha@example.com'); // Interviewer, on the website
  const ravi = await register('ravi@example.com'); // Candidate, in the app
  const raviApp = await appToken('ravi@example.com');
  const create = await request(app).post('/api/peer').set(auth(asha.web)).send({ role: 'interviewer' }).expect(201);
  const code = create.body.room.code as string;
  return { asha, ravi, raviApp, code, room: create.body.room };
};

describe('peer practice rooms', () => {
  it('creates a room with a 6-character code and common questions, joined by the friend as the other role', async () => {
    const { asha, ravi, raviApp, code, room } = await setup();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(room).toMatchObject({ status: 'WAITING', role: 'interviewer', guest: null });
    expect(room.link).toContain(`/practice/join/${code}`);
    expect(room.questions.length).toBeGreaterThan(5);
    expect(new Date(room.expiresAt).getTime() - Date.now()).toBeGreaterThan(2.9 * 3600_000);

    // The candidate needs the app (it listens to their microphone)
    const fromWeb = await request(app).post('/api/peer/join').set(auth(ravi.web)).send({ code });
    expect(fromWeb.status).toBe(403);
    expect(fromWeb.body.code).toBe('APP_NEEDED');

    const joined = await request(app).post('/api/peer/join').set(auth(raviApp)).send({ code: code.toLowerCase(), summary: 'Backend engineer, 3 years' }).expect(200);
    expect(joined.body.room).toMatchObject({ status: 'ACTIVE', role: 'candidate', candidate: { summary: 'Backend engineer, 3 years' } });
    expect(joined.body.room.host.name).toBe('asha');

    // Joining again is fine; a third person can't
    await request(app).post('/api/peer/join').set(auth(raviApp)).send({ code }).expect(200);
    const third = await register('meera@example.com');
    expect((await request(app).post('/api/peer/join').set(auth(third.web)).send({ code })).status).toBe(409);
    expect((await request(app).post('/api/peer/join').set(auth(third.web)).send({ code: 'ZZZZZZ' })).status).toBe(404);
    void asha;
  });

  it('only the two members can read a room, and the interviewer and candidate each do their own part', async () => {
    const { asha, raviApp, code } = await setup();
    const outsider = await register('meera@example.com');
    expect((await request(app).get(`/api/peer/${code}`).set(auth(outsider.web))).status).toBe(404);

    // Asking before the friend joined
    expect((await request(app).post(`/api/peer/${code}/ask`).set(auth(asha.web)).send({})).status).toBe(409);
    await request(app).post('/api/peer/join').set(auth(raviApp)).send({ code }).expect(200);

    // The candidate can't ask, the interviewer can't answer
    expect((await request(app).post(`/api/peer/${code}/ask`).set(auth(raviApp)).send({ text: 'Why us?' })).status).toBe(403);
    const asked = await request(app).post(`/api/peer/${code}/ask`).set(auth(asha.web)).send({ text: 'Why do you want this job?' }).expect(200);
    const turnId = asked.body.room.current as string;
    expect(asked.body.room.turns).toEqual([expect.objectContaining({ question: 'Why do you want this job?', status: 'asked' })]);
    expect(asked.body.room.questions.some((q: { text: string; source: string }) => q.text === 'Why do you want this job?' && q.source === 'own')).toBe(true);
    expect((await request(app).post(`/api/peer/${code}/transcript`).set(auth(asha.web)).send({ turnId, text: 'hi' })).status).toBe(403);

    // The candidate's resume questions go into the list
    const added = await request(app).post(`/api/peer/${code}/questions`).set(auth(raviApp))
      .send({ questions: [{ text: 'In the billing project, why Kafka?', kind: 'project' }] }).expect(200);
    expect(added.body.room.questions.find((q: { text: string }) => q.text === 'In the billing project, why Kafka?')).toMatchObject({ source: 'resume', kind: 'project' });

    // Polling: the same ETag gives 304 until something changes
    const first = await request(app).get(`/api/peer/${code}`).set(auth(asha.web)).expect(200);
    const etag = first.headers.etag;
    expect(etag).toBeTruthy();
    await request(app).get(`/api/peer/${code}`).set(auth(asha.web)).set('If-None-Match', etag).expect(304);
    const live = await request(app).post(`/api/peer/${code}/transcript`).set(auth(raviApp)).send({ turnId, text: 'Because I like' }).expect(200);
    expect(live.body.room.turns[0]).toMatchObject({ status: 'answering', transcript: 'Because I like' });
    const changed = await request(app).get(`/api/peer/${code}`).set(auth(asha.web)).set('If-None-Match', etag).expect(200);
    expect(changed.body.room.turns[0].transcript).toBe('Because I like');

    // Only the interviewer rates
    expect((await request(app).post(`/api/peer/${code}/rate`).set(auth(raviApp)).send({ turnId, stars: 5 })).status).toBe(403);
    const rated = await request(app).post(`/api/peer/${code}/rate`).set(auth(asha.web)).send({ turnId, stars: 4, comment: 'Good energy' }).expect(200);
    expect(rated.body.room.turns[0].rating).toEqual({ stars: 4, comment: 'Good energy' });
  });

  it('scores the answer with the AI on the candidate’s plan, and ends with a summary for both', async () => {
    const { asha, ravi, raviApp, code } = await setup();
    await request(app).post('/api/peer/join').set(auth(raviApp)).send({ code, summary: 'Data analyst' }).expect(200);
    const turnId = (await request(app).post(`/api/peer/${code}/ask`).set(auth(asha.web)).send({})).body.room.current;

    // No plan: no score, and nothing changes
    const noPlan = await request(app).post(`/api/peer/${code}/answer`).set(auth(raviApp)).send({ turnId, text: 'I like data.' });
    expect(noPlan.status).toBe(402);
    expect(chats).toHaveLength(0);

    const pack = await givePlan(ravi.id);
    const interviewerPack = await givePlan(asha.id);
    const scored = await request(app).post(`/api/peer/${code}/answer`).set(auth(raviApp)).send({ turnId, text: 'I like  data and I built a sales dashboard.', seconds: 42 }).expect(200);
    expect(scored.body.room.turns[0]).toMatchObject({ status: 'scored', transcript: 'I like data and I built a sales dashboard.', seconds: 42, ai: { score: 8, improve: 'Say the result with a number.' } });
    expect(chats[0].user).toContain('About the candidate: Data analyst');
    expect(chats[0].user).toContain('Tell me about yourself.'); // The first common question
    await usageSaved();
    expect((await db.purchase.findUniqueOrThrow({ where: { id: pack.id } })).usedTokens).toBe(150);
    expect((await db.purchase.findUniqueOrThrow({ where: { id: interviewerPack.id } })).usedTokens).toBe(0);
    expect(await db.usageEvent.count({ where: { userId: ravi.id, kind: 'CHAT' } })).toBe(1);

    // Sent twice: refused
    expect((await request(app).post(`/api/peer/${code}/answer`).set(auth(raviApp)).send({ turnId, text: 'again' })).status).toBe(409);

    // The website can't post answers (the candidate is in the app)
    const next = (await request(app).post(`/api/peer/${code}/ask`).set(auth(asha.web)).send({})).body.room.current;
    expect((await request(app).post(`/api/peer/${code}/answer`).set(auth(ravi.web)).send({ turnId: next, text: 'x' })).status).toBe(403);

    await request(app).post(`/api/peer/${code}/rate`).set(auth(asha.web)).send({ turnId, stars: 4 }).expect(200);
    const ended = await request(app).post(`/api/peer/${code}/end`).set(auth(asha.web)).expect(200);
    expect(ended.body.room.status).toBe('ENDED');
    expect(ended.body.room.summary).toMatchObject({ asked: 2, answered: 1, averageScore: 8, averageRating: 4 });
    expect(ended.body.room.turns[1].status).toBe('skipped');
    const forCandidate = await request(app).get(`/api/peer/${code}`).set(auth(raviApp)).expect(200);
    expect(forCandidate.body.room.summary.averageScore).toBe(8);
    expect((await request(app).post(`/api/peer/${code}/ask`).set(auth(asha.web)).send({})).status).toBe(409);

    // The practice counts in the candidate's progress, once
    await request(app).post(`/api/peer/${code}/end`).set(auth(raviApp)).expect(200);
    const sessions = await db.practiceSession.findMany({ where: { userId: ravi.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ questionCount: 1, averageScore: 8 });
  });

  it('only a candidate in the app can host as the candidate', async () => {
    const ravi = await register('ravi@example.com');
    expect((await request(app).post('/api/peer').set(auth(ravi.web)).send({ role: 'candidate' })).status).toBe(403);
    const raviApp = await appToken('ravi@example.com');
    const room = (await request(app).post('/api/peer').set(auth(raviApp)).send({ role: 'candidate', summary: 'Fresher, Java' }).expect(201)).body.room;
    expect(room).toMatchObject({ role: 'candidate', candidate: { summary: 'Fresher, Java' } });
    // The friend joins from the website as the interviewer
    const asha = await register('asha@example.com');
    const joined = await request(app).post('/api/peer/join').set(auth(asha.web)).send({ code: room.code }).expect(200);
    expect(joined.body.room.role).toBe('interviewer');
  });

  it('expires after 3 hours and is deleted a day later', async () => {
    const { asha, code } = await setup();
    await db.peerRoom.update({ where: { code }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get(`/api/peer/${code}`).set(auth(asha.web))).status).toBe(410);
    expect((await request(app).post(`/api/peer/${code}/ask`).set(auth(asha.web)).send({})).status).toBe(410);
    const third = await register('meera@example.com');
    expect((await request(app).post('/api/peer/join').set(auth(third.web)).send({ code })).status).toBe(410);
    expect(await cleanupPeerRooms()).toBe(0);
    expect(await cleanupPeerRooms(new Date(Date.now() + 25 * 3600_000))).toBe(1);
  });
});
