import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { razorpaySignature, type RazorpayGateway } from './razorpay.js';
import { clearSettingsCache, getSettings } from './settings.js';
import { testOutbox } from './mailer.js';
import { sendEndingSoonEmails } from './jobs.js';
import { usageSaved } from './entitlements.js';

// ---------- Fakes for the AI and Razorpay ----------

const ai: AiGateway = {
  streamChat: async (_req, onText) => {
    onText('Hello ', 'groq');
    onText('there.', 'groq');
    return { text: 'Hello there.', provider: 'groq', model: 'test-model', inputTokens: 900, outputTokens: 100 };
  },
  transcribe: async () => ({ text: 'Tell me about yourself', provider: 'groq', model: 'whisper-test' }),
};

const KEY_SECRET = 'rzp_secret';
const WEBHOOK_SECRET = 'rzp_webhook';
let orderCount = 0;
const razorpay: RazorpayGateway = {
  keyId: 'rzp_test_key',
  createOrder: async amount => ({ id: `order_${++orderCount}`, amount, currency: 'INR' }),
  verifyPayment: (orderId, paymentId, signature) => razorpaySignature(KEY_SECRET, `${orderId}|${paymentId}`) === signature,
  verifyWebhook: (body, signature) => razorpaySignature(WEBHOOK_SECRET, body) === signature,
};

const app = createApp({ ai, razorpay });

// ---------- Helpers ----------

const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token as string;
};
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Signing in from the desktop app, on a computer identified by `fingerprint`
const appLogin = (email: string, fingerprint = 'computer-one-fingerprint', password = 'password123') =>
  request(app).post('/api/auth/login').send({ email, password, device: { fingerprint, name: 'Test PC', platform: 'darwin', appVersion: '1.0.0' } });
const appToken = async (email: string, fingerprint?: string) => {
  const res = await appLogin(email, fingerprint);
  expect(res.status).toBe(200);
  return res.body.token as string;
};
// Emails are sent after the response; give them a moment
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
const sent = (kind: string) => testOutbox.filter(e => e.kind === kind);

let admin: string;
let user: string;
let planId: string;

const createPlan = async (overrides: object = {}) => {
  const res = await request(app).post('/api/admin/plans').set(auth(admin)).send({
    name: 'Pro', pricePaise: 79900, durationDays: 30, listeningMinutes: 10, tokenLimit: 2000, ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.plan.id as string;
};

// Usage is saved just after each answer is sent, so wait for it before reading what's left
const me = async (token: string) => { await usageSaved(); return (await request(app).get('/api/auth/me').set(auth(token))).body; };

beforeAll(async () => {
  await db.$connect();
});

beforeEach(async () => {
  testOutbox.length = 0;
  await db.ticket.deleteMany();
  await db.backup.deleteMany();
  await db.announcement.deleteMany();
  await db.trialClaim.deleteMany();
  await db.device.deleteMany();
  await db.passwordReset.deleteMany();
  await db.emailLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.usageEvent.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.coupon.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  admin = await register('admin@example.com');
  user = await register('user@example.com');
  planId = await createPlan();
});

// ---------- Tests ----------

describe('accounts', () => {
  it('makes the ADMIN_EMAIL account the admin, everyone else a user', async () => {
    expect((await me(admin)).user.role).toBe('ADMIN');
    expect((await me(user)).user.role).toBe('USER');
  });

  it('rejects a wrong password and duplicate emails', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/auth/register').send({ email: 'USER@example.com', name: 'x', password: 'password123' })).status).toBe(409);
    expect((await request(app).post('/api/auth/login').send({ email: 'User@Example.com', password: 'password123' })).status).toBe(200);
  });

  it('keeps admin routes for admins only', async () => {
    expect((await request(app).get('/api/admin/users').set(auth(user))).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth(admin))).status).toBe(200);
  });

  it('locks a blocked user out immediately, and admins can’t block themselves', async () => {
    const userId = (await me(user)).user.id;
    await request(app).patch(`/api/admin/users/${userId}`).set(auth(admin)).send({ status: 'BLOCKED' }).expect(200);
    const res = await request(app).get('/api/auth/me').set(auth(user));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BLOCKED');
    const adminId = (await me(admin)).user.id;
    expect((await request(app).patch(`/api/admin/users/${adminId}`).set(auth(admin)).send({ status: 'BLOCKED' })).status).toBe(400);
  });
});

describe('passwords', () => {
  it('changes the password only with the current one', async () => {
    expect((await request(app).post('/api/auth/password').set(auth(user)).send({ current: 'wrong', password: 'newpassword1' })).status).toBe(400);
    await request(app).post('/api/auth/password').set(auth(user)).send({ current: 'password123', password: 'newpassword1' }).expect(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'newpassword1' })).status).toBe(200);
  });

  it('lets the admin set a temporary password', async () => {
    const userId = (await me(user)).user.id;
    const res = await request(app).post(`/api/admin/users/${userId}/password`).set(auth(admin)).expect(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: res.body.password })).status).toBe(200);
  });
});

describe('plans', () => {
  it('lists only active plans publicly', async () => {
    await createPlan({ name: 'Hidden', active: false });
    const res = await request(app).get('/api/plans');
    expect(res.body.plans.map((p: { name: string }) => p.name)).toEqual(['Pro']);
  });
});

describe('free trial', () => {
  const trial = () => createPlan({ name: 'Free trial', pricePaise: 0, durationDays: 3, listeningMinutes: 30, tokenLimit: 1000, isTrial: true });

  it('starts on the first sign-in in the app, not at sign-up', async () => {
    await trial();
    const token = await register('new@example.com');
    expect((await me(token)).allowance.active).toBe(false);
    const res = await appLogin('new@example.com');
    expect(res.body.trial).toBe('granted');
    const allowance = (await me(res.body.token)).allowance;
    expect(allowance).toMatchObject({ active: true, onTrial: true, minutesLeft: 30 });
    expect(allowance.packs[0].source).toBe('TRIAL');
    expect((await appLogin('new@example.com')).body.trial).toBe('had_trial');
  });

  it('is given once per computer, whatever the account', async () => {
    await trial();
    await register('one@example.com');
    await register('two@example.com');
    expect((await appLogin('one@example.com', 'shared-computer-fingerprint')).body.trial).toBe('granted');
    const second = await appLogin('two@example.com', 'shared-computer-fingerprint');
    expect(second.body.trial).toBe('computer_used');
    expect((await me(second.body.token)).allowance.active).toBe(false);
    expect((await appLogin('two@example.com', 'another-computer-fingerprint')).body.trial).toBe('granted');
  });

  it('gives nothing when no trial is switched on', async () => {
    const id = await trial();
    await request(app).patch(`/api/admin/plans/${id}`).set(auth(admin)).send({ active: false }).expect(200);
    await register('new@example.com');
    expect((await appLogin('new@example.com')).body.trial).toBe('none');
  });

  it("can't be bought, and only one plan is the trial", async () => {
    const id = await trial();
    expect((await request(app).post('/api/billing/offline').set(auth(user)).send({ planId: id, reference: 'UPI 1' })).status).toBe(404);
    await request(app).patch(`/api/admin/plans/${planId}`).set(auth(admin)).send({ isTrial: true }).expect(200);
    const plans = (await request(app).get('/api/admin/plans').set(auth(admin))).body.plans;
    expect(plans.filter((p: { isTrial: boolean }) => p.isTrial).map((p: { id: string }) => p.id)).toEqual([planId]);
  });

  it('stops being a trial once a paid plan is added', async () => {
    await trial();
    await register('new@example.com');
    const token = await appToken('new@example.com');
    const userId = (await me(token)).user.id;
    await request(app).post('/api/admin/payments/offline').set(auth(admin)).send({ userId, planId }).expect(201);
    expect((await me(token)).allowance.onTrial).toBe(false);
  });
});

describe('offline payments', () => {
  it('gives the plan when the admin approves, only once', async () => {
    const claim = await request(app).post('/api/billing/offline').set(auth(user)).send({ planId, reference: 'UPI 123456' });
    expect(claim.status).toBe(201);
    expect(claim.body.payment.status).toBe('PENDING');
    expect((await me(user)).allowance.active).toBe(false);

    await request(app).post(`/api/admin/payments/${claim.body.payment.id}/approve`).set(auth(admin)).expect(200);
    await request(app).post(`/api/admin/payments/${claim.body.payment.id}/approve`).set(auth(admin)).expect(200);
    const allowance = (await me(user)).allowance;
    expect(allowance).toMatchObject({ active: true, minutesLeft: 10, tokensLeft: 2000 });
    expect(allowance.packs).toHaveLength(1);
  });

  it('lets the admin record a payment received directly', async () => {
    const userId = (await me(user)).user.id;
    await request(app).post('/api/admin/payments/offline').set(auth(admin)).send({ userId, planId, reference: 'cash' }).expect(201);
    expect((await me(user)).allowance.active).toBe(true);
  });

  it('lets the admin reject a payment they can’t find', async () => {
    const claim = await request(app).post('/api/billing/offline').set(auth(user)).send({ planId, reference: 'UPI 999' });
    await request(app).post(`/api/admin/payments/${claim.body.payment.id}/reject`).set(auth(admin)).send({ note: 'Not received' }).expect(200);
    expect((await request(app).post(`/api/admin/payments/${claim.body.payment.id}/approve`).set(auth(admin))).status).toBe(400);
    expect((await me(user)).allowance.active).toBe(false);
  });
});

describe('Razorpay', () => {
  const pay = async () => {
    const order = await request(app).post('/api/billing/orders').set(auth(user)).send({ planId });
    expect(order.status).toBe(201);
    expect(order.body.amount).toBe(79900);
    return order.body.orderId as string;
  };

  it('gives the plan after a correctly signed payment', async () => {
    const orderId = await pay();
    const signature = razorpaySignature(KEY_SECRET, `${orderId}|pay_1`);
    await request(app).post('/api/billing/verify').set(auth(user))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: signature }).expect(200);
    expect((await me(user)).allowance.active).toBe(true);
  });

  it('refuses a forged signature', async () => {
    const orderId = await pay();
    const res = await request(app).post('/api/billing/verify').set(auth(user))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' });
    expect(res.status).toBe(400);
    expect((await me(user)).allowance.active).toBe(false);
  });

  it('gives the plan from the webhook too, without doubling it', async () => {
    const orderId = await pay();
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_2', order_id: orderId } } } });
    const send = () => request(app).post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', razorpaySignature(WEBHOOK_SECRET, body))
      .send(body);
    await send().expect(200);
    await send().expect(200);
    expect((await me(user)).allowance.packs).toHaveLength(1);
    expect((await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'bad').send(body)).status).toBe(400);
  });
});

describe('AI with plan limits', () => {
  let desktop: string; // The app's token: the AI is only for the app
  beforeEach(async () => { desktop = await appToken('user@example.com'); });
  const chat = () => request(app).post('/api/ai/chat').set(auth(desktop))
    .send({ tier: 'fast', system: 'sys', user: 'What is Redis?', maxTokens: 500 });
  const transcribe = (seconds: number) => request(app).post('/api/ai/transcribe').set(auth(desktop))
    .field('language', 'en').field('seconds', String(seconds))
    .attach('audio', Buffer.alloc(200_000), { filename: 'audio.webm', contentType: 'audio/webm' }); // Big enough for 300 s

  const givePlan = async () => {
    const userId = (await me(user)).user.id;
    await request(app).post(`/api/admin/users/${userId}/grant`).set(auth(admin)).send({ planId }).expect(201);
  };

  it('only answers the desktop app', async () => {
    await givePlan();
    const res = await request(app).post('/api/ai/chat').set(auth(user)).send({ tier: 'fast', system: 's', user: 'u', maxTokens: 5 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('APP_ONLY');
  });

  it('needs an active plan', async () => {
    const res = await chat();
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('NO_PLAN');
  });

  it('streams the answer and counts its tokens', async () => {
    await givePlan();
    const res = await chat();
    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n').map(line => JSON.parse(line));
    expect(lines.filter(l => l.text).map(l => l.text).join('')).toBe('Hello there.');
    expect(lines.at(-1)).toMatchObject({ done: true });
    expect((await me(user)).allowance.tokensLeft).toBe(1000);
  });

  it('stops answering when the tokens are used up', async () => {
    await givePlan();
    await chat().expect(200);
    await usageSaved();
    await chat().expect(200);
    await usageSaved();
    const res = await chat();
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('TOKENS_USED_UP');
  });

  it('counts listening time and stops when it’s used up', async () => {
    await givePlan();
    const res = await transcribe(300);
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Tell me about yourself');
    expect((await me(user)).allowance.minutesLeft).toBe(5);
    await transcribe(300).expect(200);
    await usageSaved();
    const over = await transcribe(5);
    expect(over.status).toBe(402);
    expect(over.body.code).toBe('MINUTES_USED_UP');
  });

  it('uses unlimited plans without limits', async () => {
    const unlimited = await createPlan({ name: 'Unlimited', listeningMinutes: null, tokenLimit: null });
    const userId = (await me(user)).user.id;
    await request(app).post(`/api/admin/users/${userId}/grant`).set(auth(admin)).send({ planId: unlimited }).expect(201);
    for (let i = 0; i < 4; i++) await chat().expect(200);
    expect((await me(user)).allowance.tokensLeft).toBeNull();
  });
});

describe('settings in the database', () => {
  const settings = async () => (await request(app).get('/api/admin/settings').set(auth(admin))).body.settings as { key: string; value: string; source: string }[];
  const find = async (key: string) => (await settings()).find(s => s.key === key)!;

  it('encrypts secrets, and never sends them back in full', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ groqApiKey: 'gsk_secret_value_1234' }).expect(200);
    const row = await db.setting.findUnique({ where: { key: 'groqApiKey' } });
    expect(row!.value).not.toContain('gsk_secret');
    expect(await find('groqApiKey')).toMatchObject({ value: '••••1234', source: 'database' });
    expect((await getSettings()).groqApiKey).toBe('gsk_secret_value_1234');
  });

  it('removes a saved value with an empty string, falling back to the default', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ businessName: 'Acme Careers' }).expect(200);
    expect((await request(app).get('/api/site')).body.businessName).toBe('Acme Careers');
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ businessName: '' }).expect(200);
    expect(await find('businessName')).toMatchObject({ value: 'Recallr', source: 'default' });
  });

  it('shows only public settings on the website, and only admins can change them', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ openaiApiKey: 'sk-hidden-9999', supportEmail: 'help@acme.com' }).expect(200);
    const site = (await request(app).get('/api/site')).body;
    expect(site.supportEmail).toBe('help@acme.com');
    expect(JSON.stringify(site)).not.toContain('sk-hidden');
    expect((await request(app).patch('/api/admin/settings').set(auth(user)).send({ supportEmail: 'x@y.z' })).status).toBe(403);
  });

  it('rejects a provider order it does not know', async () => {
    expect((await request(app).patch('/api/admin/settings').set(auth(admin)).send({ aiProviderOrder: 'gemini' })).status).toBe(400);
    expect((await request(app).patch('/api/admin/settings').set(auth(admin)).send({ aiProviderOrder: 'groq,groq' })).status).toBe(400);
    expect((await request(app).patch('/api/admin/settings').set(auth(admin)).send({ aiProviderOrder: 'claude,groq' })).status).toBe(200);
  });

  it('logs what admins change, without the secret values', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ groqApiKey: 'gsk_secret_value_1234', supportEmail: 'help@acme.com' });
    const claim = await request(app).post('/api/billing/offline').set(auth(user)).send({ planId, reference: 'UPI 42' });
    await request(app).post(`/api/admin/payments/${claim.body.payment.id}/approve`).set(auth(admin));
    const entries = (await request(app).get('/api/admin/audit').set(auth(admin))).body.entries;
    expect(entries[0].action).toBe('payment.approve'); // Newest first
    const settingsEntry = entries.find((e: { action: string }) => e.action === 'settings.update');
    expect(settingsEntry.actor.email).toBe('admin@example.com');
    expect(JSON.stringify(settingsEntry.details)).not.toContain('gsk_secret');
    expect(settingsEntry.details.values.supportEmail).toBe('help@acme.com');
    expect(entries.find((e: { action: string }) => e.action === 'payment.approve').target).toBe('user@example.com');
  });
});

describe('devices', () => {
  it('limits how many computers one account can use, until one is removed', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ maxDevices: '2' }).expect(200);
    await appToken('user@example.com', 'computer-a-fingerprint');
    await appToken('user@example.com', 'computer-b-fingerprint');
    const third = await appLogin('user@example.com', 'computer-c-fingerprint');
    expect(third.status).toBe(409);
    expect(third.body.code).toBe('DEVICE_LIMIT');
    expect(third.body.devices).toHaveLength(2);
    // The same computer signing in again is fine
    expect((await appLogin('user@example.com', 'computer-a-fingerprint')).status).toBe(200);

    // The user removes one on the website, then the new computer can sign in
    const devices = (await request(app).get('/api/auth/devices').set(auth(user))).body.devices;
    await request(app).delete(`/api/auth/devices/${devices[devices.length - 1].id}`).set(auth(user)).expect(200);
    expect((await appLogin('user@example.com', 'computer-c-fingerprint')).status).toBe(200);
  });

  it('signs a removed computer out straight away', async () => {
    const token = await appToken('user@example.com');
    const [device] = (await request(app).get('/api/auth/devices').set(auth(user))).body.devices;
    await request(app).delete(`/api/admin/devices/${device.id}`).set(auth(admin)).expect(200);
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_REMOVED');
  });
});

describe('forgot password', () => {
  it('emails a link that sets a new password once, and signs out every computer', async () => {
    const appSession = await appToken('user@example.com');
    await request(app).post('/api/auth/forgot').send({ email: 'user@example.com' }).expect(200);
    await settle();
    const [email] = sent('password_reset');
    const token = decodeURIComponent(email.text.match(/token=([^\s]+)/)![1]);
    await request(app).post('/api/auth/reset').send({ token, password: 'brand-new-pass' }).expect(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'brand-new-pass' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'again-new-pass' })).status).toBe(400);
    expect((await request(app).get('/api/auth/me').set(auth(appSession))).status).toBe(401);
  });

  it('answers the same for unknown emails', async () => {
    await request(app).post('/api/auth/forgot').send({ email: 'nobody@example.com' }).expect(200);
    await settle();
    expect(sent('password_reset')).toHaveLength(0);
  });
});

describe('emails', () => {
  it('welcomes new users and logs every email', async () => {
    await register('new@example.com');
    await settle();
    expect(sent('welcome').map(e => e.to)).toContain('new@example.com');
    expect(await db.emailLog.count({ where: { kind: 'welcome', to: 'new@example.com' } })).toBe(1);
  });

  it('confirms payments, offline claims and rejections', async () => {
    const claim = await request(app).post('/api/billing/offline').set(auth(user)).send({ planId, reference: 'UPI 777' });
    await request(app).post(`/api/admin/payments/${claim.body.payment.id}/approve`).set(auth(admin)).expect(200);
    const other = await request(app).post('/api/billing/offline').set(auth(user)).send({ planId, reference: 'UPI 888' });
    await request(app).post(`/api/admin/payments/${other.body.payment.id}/reject`).set(auth(admin)).send({ note: 'Not found' });
    await settle();
    expect(sent('offline_submitted')).toHaveLength(2);
    expect(sent('payment_received')).toHaveLength(1);
    expect(sent('offline_rejected')[0].text).toContain('Not found');
  });

  it('warns once when listening time runs low', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ lowMinutesWarning: '6' }).expect(200);
    const userId = (await me(user)).user.id;
    await request(app).post(`/api/admin/users/${userId}/grant`).set(auth(admin)).send({ planId }).expect(201); // 10 minutes
    const desktop = await appToken('user@example.com');
    const listen = (seconds: number) => request(app).post('/api/ai/transcribe').set(auth(desktop))
      .field('seconds', String(seconds)).attach('audio', Buffer.alloc(200_000), { filename: 'a.webm', contentType: 'audio/webm' });
    await listen(120).expect(200); // 8 left
    await settle();
    expect(sent('low_minutes')).toHaveLength(0);
    await listen(180).expect(200); // 5 left
    await listen(60).expect(200);
    await settle();
    expect(sent('low_minutes')).toHaveLength(1);
  });

  it('tells users two days before their plan ends, once', async () => {
    const userId = (await me(user)).user.id;
    await request(app).post(`/api/admin/users/${userId}/grant`).set(auth(admin)).send({ planId }).expect(201);
    await db.purchase.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() + 36 * 3600_000) } });
    expect(await sendEndingSoonEmails()).toBe(1);
    expect(await sendEndingSoonEmails()).toBe(0);
  });
});

describe('coupons', () => {
  const coupon = (body: object) => request(app).post('/api/admin/coupons').set(auth(admin)).send({ code: 'save20', kind: 'PERCENT', amount: 20, ...body });
  const price = (code: string) => request(app).post('/api/billing/quote').set(auth(user)).send({ planId, code });

  it('takes the discount off the price, and counts the use once paid', async () => {
    await coupon({}).expect(201);
    expect((await price('SAVE20')).body).toMatchObject({ pricePaise: 79900, discountPaise: 15980, amountPaise: 63920 });
    const claim = await request(app).post('/api/billing/offline').set(auth(user)).send({ planId, reference: 'UPI 1', code: 'save20' });
    expect(claim.body.payment.amountPaise).toBe(63920);
    await request(app).post(`/api/admin/payments/${claim.body.payment.id}/approve`).set(auth(admin));
    expect((await db.coupon.findUnique({ where: { code: 'SAVE20' } }))!.usedCount).toBe(1);
    // One use per person
    expect((await price('SAVE20')).body.code).toBe('COUPON_INVALID');
  });

  it('refuses expired, used-up, wrong-plan and unknown codes', async () => {
    await coupon({ code: 'OLD', expiresAt: new Date(Date.now() - 1000).toISOString() });
    await coupon({ code: 'FULL', maxUses: 1 });
    await db.coupon.update({ where: { code: 'FULL' }, data: { usedCount: 1 } });
    await coupon({ code: 'OTHERPLAN', planIds: ['someone-else'] });
    for (const code of ['OLD', 'FULL', 'OTHERPLAN', 'NOPE']) expect((await price(code)).status).toBe(400);
  });

  it('gives the plan without payment with a 100% code', async () => {
    await coupon({ code: 'FREEPRO', amount: 100 });
    expect((await request(app).post('/api/billing/offline').set(auth(user)).send({ planId, reference: 'x12', code: 'FREEPRO' })).body.code).toBe('FREE');
    await request(app).post('/api/billing/free').set(auth(user)).send({ planId, code: 'FREEPRO' }).expect(201);
    expect((await me(user)).allowance.packs[0].source).toBe('COUPON');
  });
});

describe('referrals', () => {
  it('gives both people a bonus on the invited friend’s first payment only', async () => {
    const { code } = (await request(app).get('/api/referrals').set(auth(user))).body;
    const friendToken = (await request(app).post('/api/auth/register').send({ email: 'friend@example.com', name: 'Friend Person', password: 'password123', ref: code })).body.token;
    const friendId = (await me(friendToken)).user.id;
    for (let i = 0; i < 2; i++) await request(app).post('/api/admin/payments/offline').set(auth(admin)).send({ userId: friendId, planId }).expect(201);
    const bonus = (token: string) => me(token).then(m => m.allowance.packs.filter((p: { source: string }) => p.source === 'REFERRAL'));
    expect(await bonus(user)).toHaveLength(1);
    expect(await bonus(friendToken)).toHaveLength(1);
    const invited = (await request(app).get('/api/referrals').set(auth(user))).body.invited;
    expect(invited).toEqual([expect.objectContaining({ name: 'Friend', rewarded: true })]);
  });
});

describe('announcements and app versions', () => {
  it('shows active announcements to the right place', async () => {
    await request(app).post('/api/admin/announcements').set(auth(admin)).send({ title: 'For the app', audience: 'DESKTOP' }).expect(201);
    await request(app).post('/api/admin/announcements').set(auth(admin)).send({ title: 'Old', endsAt: new Date(Date.now() - 1000).toISOString() });
    await request(app).post('/api/admin/announcements').set(auth(admin)).send({ title: 'Everyone' });
    const titles = async (where: string) => (await request(app).get(`/api/announcements?for=${where}`)).body.announcements.map((a: { title: string }) => a.title).sort();
    expect(await titles('desktop')).toEqual(['Everyone', 'For the app']);
    expect(await titles('website')).toEqual(['Everyone']);
  });

  it('tells the app the latest and minimum versions', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ latestAppVersion: '1.3.0', minimumAppVersion: '1.1.0' }).expect(200);
    expect((await request(app).get('/api/app/version')).body).toMatchObject({ latest: '1.3.0', minimum: '1.1.0' });
  });
});

describe('cloud backup', () => {
  it('keeps one encrypted backup per account', async () => {
    const backup = JSON.stringify({ app: 'recallr', entries: { secondBrain_cv: 'My resume text' } });
    await request(app).put('/api/backup').set(auth(user)).set('Content-Type', 'text/plain').send(backup).expect(200);
    const row = await db.backup.findFirst();
    expect(row!.data).not.toContain('My resume');
    expect((await request(app).get('/api/backup/data').set(auth(user))).text).toBe(backup);
    expect((await request(app).get('/api/backup/data').set(auth(admin))).status).toBe(404);
    expect((await request(app).put('/api/backup').set(auth(user)).set('Content-Type', 'text/plain').send('not json')).status).toBe(400);
  });
});

describe('support', () => {
  it('lets users ask, admins answer, and users reply', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ supportEmail: 'help@acme.com' }).expect(200);
    const { ticket } = (await request(app).post('/api/support').set(auth(user)).send({ subject: 'Payment missing', body: 'I paid by UPI' }).expect(201)).body;
    expect((await request(app).get(`/api/support/${ticket.id}`).set(auth(admin))).status).toBe(404); // Not the admin's own request
    const answered = await request(app).post(`/api/admin/support/${ticket.id}/messages`).set(auth(admin)).send({ body: 'Approved now' }).expect(201);
    expect(answered.body.ticket.status).toBe('ANSWERED');
    const reply = await request(app).post(`/api/support/${ticket.id}/messages`).set(auth(user)).send({ body: 'Thanks!' }).expect(201);
    expect(reply.body.ticket).toMatchObject({ status: 'OPEN' });
    expect(reply.body.ticket.messages.map((m: { fromAdmin: boolean }) => m.fromAdmin)).toEqual([false, true, false]);
    await settle();
    expect(sent('ticket_admin').map(e => e.to)).toEqual(['help@acme.com', 'help@acme.com']);
    expect(sent('ticket_reply').map(e => e.to)).toEqual(['user@example.com']);
  });
});

describe('reports', () => {
  it('adds up revenue, sign-ups and AI cost per day and per plan', async () => {
    const userId = (await me(user)).user.id;
    await request(app).post('/api/admin/payments/offline').set(auth(admin)).send({ userId, planId }).expect(201);
    const desktop = await appToken('user@example.com');
    await request(app).post('/api/ai/chat').set(auth(desktop)).send({ tier: 'fast', system: 's', user: 'u', maxTokens: 50 }).expect(200);
    await usageSaved(); // Usage is saved just after the answer
    const report = (await request(app).get('/api/admin/reports?days=7').set(auth(admin))).body;
    expect(report.series).toHaveLength(7);
    const today = report.series.at(-1);
    expect(today).toMatchObject({ signups: 2, revenuePaise: 79900, activeUsers: 1 });
    expect(today.aiCostPaise).toBeGreaterThanOrEqual(0);
    expect(report.plans).toEqual([expect.objectContaining({ planName: 'Pro', revenuePaise: 79900, sold: 1 })]);
  });
});
