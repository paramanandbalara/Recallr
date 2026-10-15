import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { istDayStart } from './daily.js';
import { db } from './db.js';
import { clearSettingsCache, saveSettings } from './settings.js';
import { checkVerification, newVerification, normalizePhone, sendDailyQuestionMessages, sendInterviewReminders, sendTemplate, setWhatsAppFetch } from './whatsapp.js';

// WhatsApp: the Cloud API payload, verified numbers only, opt-ins, skipped when not set up, reminders once

const ai: AiGateway = {
  streamChat: async () => ({ text: '{}', provider: 'groq', model: 'x', inputTokens: 1, outputTokens: 1 }),
  transcribe: async () => ({ text: '', provider: 'groq', model: 'whisper-test' }),
};
const app = createApp({ ai, razorpay: null });

interface Sent { url: string; headers: Record<string, string>; body: { to: string; template: { name: string; language: { code: string }; components?: { type: string; parameters: { text: string }[] }[] } } }
const sent: Sent[] = [];
let reply: { ok: boolean; status: number; data: unknown } = { ok: true, status: 200, data: { messages: [{ id: 'wamid.1' }] } };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, id: res.body.user.id as string };
};
const configure = async () => {
  await saveSettings({ whatsappToken: 'EAAG-test-token', whatsappPhoneNumberId: '1098765' }, null as unknown as string);
};
const bodyParams = (s: Sent) => s.body.template.components?.find(c => c.type === 'body')?.parameters.map(p => p.text);
const at = (day: string, hour: number, minute = 0) => new Date(istDayStart(day).getTime() + (hour * 60 + minute) * 60_000);

beforeEach(async () => {
  sent.length = 0;
  reply = { ok: true, status: 200, data: { messages: [{ id: 'wamid.1' }] } };
  setWhatsAppFetch(async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: reply.ok, status: reply.status, json: async () => reply.data };
  });
  await db.whatsAppLog.deleteMany();
  await db.dailyQuestion.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.device.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
});
afterEach(() => setWhatsAppFetch(null));

describe('numbers and codes', () => {
  it('writes numbers in international form, India by default', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('098765-43210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('12345')).toBe('');
    expect(normalizePhone('abc')).toBe('');
  });

  it('checks codes against the signed token: right user, right code, in time', () => {
    const { code, token } = newVerification('u1', '+919876543210', 1_000);
    expect(checkVerification('u1', token, code, 2_000)).toBe('+919876543210');
    expect(checkVerification('u2', token, code, 2_000)).toBeNull();
    expect(checkVerification('u1', token, code === '000000' ? '000001' : '000000', 2_000)).toBeNull();
    expect(checkVerification('u1', token, code, 1_000 + 11 * 60_000)).toBeNull();
  });
});

describe('sending', () => {
  it('is skipped and logged while WhatsApp is not set up', async () => {
    const result = await sendTemplate({ to: '+919876543210', template: 'interview_reminder', params: ['a', 'b'] });
    expect(result.status).toBe('skipped');
    expect(sent).toHaveLength(0);
    expect(await db.whatsAppLog.findFirst()).toMatchObject({ status: 'skipped', template: 'interview_reminder', to: '+919876543210' });
  });

  it('sends a template message in the Cloud API shape, and logs failures', async () => {
    await configure();
    const result = await sendTemplate({ to: '+919876543210', template: 'daily_question', params: ['Why\nus?', 'https://x/account/daily'], userId: null });
    expect(result.status).toBe('sent');
    expect(sent[0].url).toBe('https://graph.facebook.com/v21.0/1098765/messages');
    expect(sent[0].headers.Authorization).toBe('Bearer EAAG-test-token');
    expect(sent[0].body).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '919876543210', type: 'template',
      template: { name: 'daily_question', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Why us?' }, { type: 'text', text: 'https://x/account/daily' }] }] },
    });

    reply = { ok: false, status: 400, data: { error: { message: 'Template name does not exist in the translation' } } };
    const failed = await sendTemplate({ to: '+919876543210', template: 'nope', params: [] });
    expect(failed).toEqual({ status: 'failed', error: 'Template name does not exist in the translation' });
    expect((await db.whatsAppLog.findMany({ orderBy: { createdAt: 'asc' } })).map(l => l.status).sort()).toEqual(['failed', 'sent']);
  });
});

describe('the user’s number', () => {
  it('saves a number only after the code sent to it on WhatsApp is typed', async () => {
    const user = await register('priya@example.com');
    expect((await request(app).post('/api/whatsapp/phone').set(auth(user.token)).send({ phone: '9876543210' })).status).toBe(503); // Not set up
    await configure();
    expect((await request(app).get('/api/whatsapp').set(auth(user.token))).body).toEqual({ available: true, phone: '', reminders: false, daily: false });
    expect((await request(app).patch('/api/whatsapp').set(auth(user.token)).send({ reminders: true })).status).toBe(400);
    expect((await request(app).post('/api/whatsapp/phone').set(auth(user.token)).send({ phone: '12' })).status).toBe(400);

    const started = await request(app).post('/api/whatsapp/phone').set(auth(user.token)).send({ phone: '98765 43210' }).expect(200);
    expect(started.body.phone).toBe('+919876543210');
    expect(sent[0].body.template.name).toBe('verify_code');
    const code = bodyParams(sent[0])![0];
    expect(code).toMatch(/^\d{6}$/);
    expect(sent[0].body.template.components?.find(c => c.type === 'button')?.parameters[0].text).toBe(code);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe(''); // Not until verified

    const wrong = code === '123456' ? '654321' : '123456';
    expect((await request(app).post('/api/whatsapp/verify').set(auth(user.token)).send({ token: started.body.token, code: wrong })).status).toBe(400);
    const other = await register('raj@example.com');
    expect((await request(app).post('/api/whatsapp/verify').set(auth(other.token)).send({ token: started.body.token, code })).status).toBe(400);
    const verified = await request(app).post('/api/whatsapp/verify').set(auth(user.token)).send({ token: started.body.token, code }).expect(200);
    expect(verified.body.phone).toBe('+919876543210');

    const on = await request(app).patch('/api/whatsapp').set(auth(user.token)).send({ reminders: true, daily: true }).expect(200);
    expect(on.body).toMatchObject({ reminders: true, daily: true });
    const removed = await request(app).delete('/api/whatsapp/phone').set(auth(user.token)).expect(200);
    expect(removed.body).toMatchObject({ phone: '', reminders: false, daily: false });
  });
});

describe('reminders and the daily question', () => {
  const optedIn = (id: string, data: Partial<{ phone: string; whatsappReminders: boolean; whatsappDaily: boolean }>) => db.user.update({ where: { id }, data });

  it('reminds the evening before and about an hour before, once each, only to opted-in verified numbers', async () => {
    const priya = await register('priya@example.com');
    const raj = await register('raj@example.com');
    const meera = await register('meera@example.com');
    await optedIn(priya.id, { phone: '+919876543210', whatsappReminders: true });
    await optedIn(raj.id, { phone: '+919811111111', whatsappReminders: false }); // Didn't ask for reminders
    await optedIn(meera.id, { phone: '', whatsappReminders: true });            // No verified number
    const startsAt = at('2026-10-21', 10, 30);
    for (const userId of [priya.id, raj.id, meera.id]) {
      await db.userInterview.create({ data: { userId, clientId: `c-${userId}`, title: 'Infosys round 2', startsAt } });
    }

    // Not set up: nothing sent, nothing marked
    expect(await sendInterviewReminders(at('2026-10-20', 19))).toBe(0);
    expect(await db.userInterview.count({ where: { remindedDayAt: { not: null } } })).toBe(0);

    await configure();
    expect(await sendInterviewReminders(at('2026-10-20', 17))).toBe(0); // Before the evening
    expect(await sendInterviewReminders(at('2026-10-20', 19))).toBe(1);
    expect(await sendInterviewReminders(at('2026-10-20', 20))).toBe(0); // Once
    expect(sent).toHaveLength(1);
    expect(sent[0].body.to).toBe('919876543210');
    expect(sent[0].body.template.name).toBe('interview_reminder');
    expect(bodyParams(sent[0])).toEqual(['Infosys round 2', expect.stringMatching(/^tomorrow \(.*21 Oct.*10:30 am\)$/)]);

    expect(await sendInterviewReminders(at('2026-10-21', 9, 0))).toBe(0); // 90 minutes before: not yet
    expect(await sendInterviewReminders(at('2026-10-21', 9, 35))).toBe(1);
    expect(await sendInterviewReminders(at('2026-10-21', 9, 45))).toBe(0);
    expect(bodyParams(sent[1])![1]).toBe('today at 10:30 am (in about 55 minutes)');
    expect(await db.userInterview.count({ where: { userId: priya.id, remindedDayAt: { not: null }, remindedSoonAt: { not: null } } })).toBe(1);
  });

  it('sends the question of the day from 09:00 India time, once, to people who asked for it', async () => {
    const priya = await register('priya@example.com');
    const raj = await register('raj@example.com');
    await optedIn(priya.id, { phone: '+919876543210', whatsappDaily: true });
    await optedIn(raj.id, { phone: '+919811111111', whatsappDaily: false });
    await db.dailyQuestion.create({ data: { date: '2026-10-20', text: 'Why should we hire you?', category: 'ABOUT_YOU' } });
    await configure();

    expect(await sendDailyQuestionMessages(at('2026-10-20', 8, 30))).toBe(0);
    expect(await sendDailyQuestionMessages(at('2026-10-20', 9, 5))).toBe(1);
    expect(await sendDailyQuestionMessages(at('2026-10-20', 9, 35))).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].body.template.name).toBe('daily_question');
    expect(bodyParams(sent[0])).toEqual(['Why should we hire you?', expect.stringMatching(/\/account\/daily$/)]);
    expect((await db.dailyQuestion.findFirstOrThrow()).sentAt).not.toBeNull();
  });

  it('lets the admin see the log and send a test message', async () => {
    const admin = await register('admin@example.com');
    await configure();
    const noNumber = await request(app).post('/api/admin/whatsapp/test').set(auth(admin.token)).send({});
    expect(noNumber.status).toBe(400);
    const test = await request(app).post('/api/admin/whatsapp/test').set(auth(admin.token)).send({ to: '+91 98765 43210' }).expect(200);
    expect(test.body).toEqual({ ok: true, error: '' });
    const log = await request(app).get('/api/admin/whatsapp/logs').set(auth(admin.token)).expect(200);
    expect(log.body.ready).toBe(true);
    expect(log.body.logs[0]).toMatchObject({ status: 'sent', template: 'interview_reminder', email: 'admin@example.com' });
    const user = await register('raj@example.com');
    expect((await request(app).get('/api/admin/whatsapp/logs').set(auth(user.token))).status).toBe(403);
  });
});
