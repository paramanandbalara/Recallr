import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { db } from './db.js';

// The app's interview calendar on the account (routes/interviews.ts)

const ai: AiGateway = {
  streamChat: async () => ({ text: '', provider: 'groq', model: 'test', inputTokens: 0, outputTokens: 0 }),
  transcribe: async () => ({ text: '', provider: 'groq', model: 'test' }),
};
const app = createApp({ ai, razorpay: null });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token as string;
};

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();
const put = (token: string, id: string, body: object) => request(app).put(`/api/interviews/${id}`).set(auth(token)).send(body);

let asha: string;
let ravi: string;

beforeEach(async () => {
  await db.userInterview.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  asha = await register('asha@example.com');
  ravi = await register('ravi@example.com');
});

describe('/api/interviews', () => {
  it('needs a sign-in', async () => {
    expect((await request(app).get('/api/interviews')).status).toBe(401);
    expect((await request(app).put('/api/interviews/i1').send({ title: 'X', startsAt: inHours(1) })).status).toBe(401);
  });

  it('adds, updates and lists interviews: upcoming soonest first, then recent', async () => {
    let res = await put(asha, 'i1', { title: 'Northwind – system design', startsAt: inHours(30), profileClientId: 'p1', notes: 'Zoom link' });
    expect(res.status).toBe(200);
    expect(res.body.interview).toMatchObject({ clientId: 'i1', title: 'Northwind – system design', profileClientId: 'p1', notes: 'Zoom link' });
    await put(asha, 'i2', { title: 'Contoso HR', startsAt: inHours(3) });
    await put(asha, 'old', { title: 'Fabrikam', startsAt: inHours(-48) });
    await put(asha, 'ancient', { title: 'Long ago', startsAt: inHours(-24 * 60) });

    // Sending again updates the same interview
    res = await put(asha, 'i1', { title: 'Northwind – final round', startsAt: inHours(30), profileClientId: 'p1' });
    expect(res.status).toBe(200);
    expect(await db.userInterview.count()).toBe(4);

    res = await request(app).get('/api/interviews').set(auth(asha));
    expect(res.status).toBe(200);
    expect(res.body.upcoming.map((i: { clientId: string }) => i.clientId)).toEqual(['i2', 'i1']);
    expect(res.body.upcoming[1]).toMatchObject({ title: 'Northwind – final round', notes: '' });
    expect(res.body.recent.map((i: { clientId: string }) => i.clientId)).toEqual(['old']);
  });

  it('starts the reminders again when the time changes, not when only the title does', async () => {
    await put(asha, 'i1', { title: 'Northwind', startsAt: inHours(30) });
    await db.userInterview.updateMany({ data: { remindedDayAt: new Date(), remindedSoonAt: new Date() } });
    const row = await db.userInterview.findFirstOrThrow();
    await put(asha, 'i1', { title: 'Northwind (renamed)', startsAt: row.startsAt.toISOString() });
    expect((await db.userInterview.findFirstOrThrow()).remindedDayAt).not.toBeNull();
    await put(asha, 'i1', { title: 'Northwind', startsAt: inHours(50) });
    const moved = await db.userInterview.findFirstOrThrow();
    expect(moved.remindedDayAt).toBeNull();
    expect(moved.remindedSoonAt).toBeNull();
  });

  it('refuses bad input', async () => {
    expect((await put(asha, 'bad id!', { title: 'X', startsAt: inHours(1) })).status).toBe(400);
    expect((await put(asha, 'i1', { title: '', startsAt: inHours(1) })).status).toBe(400);
    expect((await put(asha, 'i1', { title: 'X', startsAt: 'not a date' })).status).toBe(400);
    expect((await put(asha, 'i1', { title: 'X'.repeat(201), startsAt: inHours(1) })).status).toBe(400);
    expect((await put(asha, 'i1', { title: 'X', startsAt: inHours(1), notes: 'n'.repeat(1001) })).status).toBe(400);
    expect(await db.userInterview.count()).toBe(0);
  });

  it('keeps each account’s interviews to itself', async () => {
    await put(asha, 'i1', { title: 'Asha’s interview', startsAt: inHours(5) });
    // The same app id on another account is a different interview
    await put(ravi, 'i1', { title: 'Ravi’s interview', startsAt: inHours(6) });
    expect(await db.userInterview.count()).toBe(2);

    const list = await request(app).get('/api/interviews').set(auth(ravi));
    expect(list.body.upcoming).toHaveLength(1);
    expect(list.body.upcoming[0].title).toBe('Ravi’s interview');

    // Ravi deleting "i1" deletes only his
    expect((await request(app).delete('/api/interviews/i1').set(auth(ravi))).status).toBe(200);
    const left = await db.userInterview.findMany({ include: { user: true } });
    expect(left.map(i => i.user.email)).toEqual(['asha@example.com']);
  });

  it('deletes, and deleting one that isn’t there is fine', async () => {
    await put(asha, 'i1', { title: 'Northwind', startsAt: inHours(5) });
    expect((await request(app).delete('/api/interviews/i1').set(auth(asha))).status).toBe(200);
    expect((await request(app).delete('/api/interviews/i1').set(auth(asha))).status).toBe(200);
    expect(await db.userInterview.count()).toBe(0);
  });

  it('is in the data export, and goes with the account', async () => {
    await put(asha, 'i1', { title: 'Northwind', startsAt: inHours(5), notes: 'Bring ID' });
    const res = await request(app).get('/api/auth/me/export').set(auth(asha));
    expect(res.status).toBe(200);
    expect(res.body.interviews).toHaveLength(1);
    expect(res.body.interviews[0]).toMatchObject({ title: 'Northwind', notes: 'Bring ID' });

    expect((await request(app).post('/api/auth/me/delete').set(auth(asha)).send({ password: 'password123' })).status).toBe(200);
    expect(await db.userInterview.count()).toBe(0);
  });
});
