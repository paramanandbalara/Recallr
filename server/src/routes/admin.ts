import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { hashPassword, publicUser, requireAdmin, requireUser } from '../auth.js';
import { db } from '../db.js';
import { allowance } from '../entitlements.js';
import { fulfilPayment, grantPlan } from '../fulfil.js';
import { audit } from '../audit.js';
import { emails } from '../emails.js';
import { queueEmail } from '../mailer.js';
import { activeDevices, publicDevice } from '../devices.js';
import { testAiKey } from '../ai.js';
import { HttpError, route } from '../http.js';
import { testRazorpayKeys } from '../razorpay.js';
import { getSettings, isNumberSetting, saveSettings, SETTING_KEYS, SETTINGS, settingsForAdmin, type SettingKey } from '../settings.js';

export const adminRoutes = Router();
adminRoutes.use(requireUser, requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;

const planInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).default(''),
  pricePaise: z.number().int().min(0),
  durationDays: z.number().int().min(1).max(3650),
  listeningMinutes: z.number().int().min(1).nullable(),
  tokenLimit: z.number().int().min(1).nullable(),
  active: z.boolean().default(true),
  isTrial: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

// Only one plan is the free trial: marking one unmarks the others
const savePlan = (id: string | null, data: Partial<z.infer<typeof planInput>>) =>
  db.$transaction(async tx => {
    if (data.isTrial) await tx.plan.updateMany({ where: { isTrial: true, ...(id ? { id: { not: id } } : {}) }, data: { isTrial: false } });
    return id ? tx.plan.update({ where: { id }, data }) : tx.plan.create({ data: data as z.infer<typeof planInput> });
  });

// ---------- Overview ----------

adminRoutes.get('/stats', route(async (_req, res) => {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [users, newUsers7d, activeUsers, paidUsers, pendingPayments, revenue, usage] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
    db.purchase.findMany({ where: { expiresAt: { gt: now } }, distinct: ['userId'], select: { userId: true } }),
    db.purchase.findMany({ where: { expiresAt: { gt: now }, source: { in: ['RAZORPAY', 'OFFLINE'] } }, distinct: ['userId'], select: { userId: true } }),
    db.payment.count({ where: { status: 'PENDING' } }),
    db.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: monthAgo } }, _sum: { amountPaise: true } }),
    db.usageEvent.aggregate({ where: { createdAt: { gte: monthAgo } }, _sum: { inputTokens: true, outputTokens: true, audioSeconds: true } }),
  ]);
  const settings = await getSettings();
  res.json({
    // What still needs setting up, for the dashboard's checklist
    setup: {
      ai: !!(settings.groqApiKey || settings.openaiApiKey),
      razorpay: !!(settings.razorpayKeyId && settings.razorpayKeySecret),
      offlinePayment: !!settings.offlinePaymentInfo,
      supportEmail: !!settings.supportEmail,
    },
    users,
    newUsers7d,
    usersWithPlan: activeUsers.length,
    payingUsers: paidUsers.length,
    pendingPayments,
    revenuePaise30d: revenue._sum.amountPaise ?? 0,
    tokens30d: (usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0),
    audioMinutes30d: Math.round((usage._sum.audioSeconds ?? 0) / 60),
  });
}));

// ---------- Users ----------

adminRoutes.get('/users', route(async (req, res) => {
  const search = z.string().trim().max(200).optional().parse(req.query.search);
  const users = await db.user.findMany({
    where: search ? { OR: [{ email: { contains: search } }, { name: { contains: search } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const withAllowance = await Promise.all(users.map(async user => ({ ...publicUser(user), lastSeenAt: user.lastSeenAt, allowance: await allowance(user.id) })));
  res.json({ users: withAllowance });
}));

adminRoutes.get('/users/:id', route(async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new HttpError(404, 'User not found.');
  const [purchases, payments, usage, devices, emailLog, referredBy, referrals, backup] = await Promise.all([
    db.purchase.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    db.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, include: { plan: { select: { name: true } } } }),
    db.usageEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    activeDevices(user.id),
    db.emailLog.findMany({ where: { userId: user.id }, orderBy: { id: 'desc' }, take: 50 }),
    user.referredById ? db.user.findUnique({ where: { id: user.referredById }, select: { id: true, email: true } }) : null,
    db.user.count({ where: { referredById: user.id } }),
    db.backup.findUnique({ where: { userId: user.id }, select: { sizeBytes: true, updatedAt: true, deviceName: true } }),
  ]);
  res.json({
    user: { ...publicUser(user), lastSeenAt: user.lastSeenAt },
    allowance: await allowance(user.id),
    purchases, payments,
    usage: usage.map(u => ({ ...u, id: u.id.toString() })),
    devices: devices.map(publicDevice),
    emails: emailLog.map(e => ({ ...e, id: e.id.toString() })),
    referral: { referredBy, invited: referrals, rewardedAt: user.referralRewardedAt },
    backup,
  });
}));

// Block / unblock, or make someone an admin
adminRoutes.patch('/users/:id', route(async (req, res) => {
  const data = z.object({ status: z.enum(['ACTIVE', 'BLOCKED']).optional(), role: z.enum(['USER', 'ADMIN']).optional() }).parse(req.body);
  if (req.params.id === req.user!.id && (data.status === 'BLOCKED' || data.role === 'USER')) {
    throw new HttpError(400, "You can't block yourself or remove your own admin role.");
  }
  const user = await db.user.update({ where: { id: req.params.id }, data });
  if (data.status) await audit(req, data.status === 'BLOCKED' ? 'user.block' : 'user.unblock', user.email);
  if (data.role) await audit(req, data.role === 'ADMIN' ? 'user.make_admin' : 'user.remove_admin', user.email);
  res.json({ user: publicUser(user) });
}));

// Give a plan without payment (trial, goodwill...)
adminRoutes.post('/users/:id/grant', route(async (req, res) => {
  const purchase = await grantPlan(req.params.id, z.string().parse(req.body.planId));
  const user = await db.user.findUnique({ where: { id: purchase.userId }, select: { email: true } });
  await audit(req, 'user.grant_plan', user?.email, { plan: purchase.planName });
  res.status(201).json({ purchase });
}));

// For someone who forgot their password: a new temporary one, shown once to the admin to pass on
adminRoutes.post('/users/:id/password', route(async (req, res) => {
  const password = crypto.randomBytes(6).toString('base64url');
  const user = await db.user.update({ where: { id: req.params.id }, data: { passwordHash: await hashPassword(password) } });
  await audit(req, 'user.reset_password', user.email);
  res.json({ password });
}));

// Change what's left on a pack, e.g. add minutes or extend it
adminRoutes.patch('/purchases/:id', route(async (req, res) => {
  const data = z.object({
    expiresAt: z.coerce.date().optional(),
    listeningMinutes: z.number().int().min(0).nullable().optional(),
    tokenLimit: z.number().int().min(0).nullable().optional(),
  }).parse(req.body);
  const purchase = await db.purchase.update({ where: { id: req.params.id }, data, include: { user: { select: { email: true } } } });
  await audit(req, 'pack.edit', purchase.user.email, { pack: purchase.planName, ...data, expiresAt: data.expiresAt?.toISOString() });
  res.json({ purchase });
}));

// ---------- Plans ----------

adminRoutes.get('/plans', route(async (_req, res) => {
  const plans = await db.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { pricePaise: 'asc' }], include: { _count: { select: { purchases: true } } } });
  res.json({ plans });
}));

adminRoutes.post('/plans', route(async (req, res) => {
  const plan = await savePlan(null, planInput.parse(req.body));
  await audit(req, 'plan.create', plan.name, { pricePaise: plan.pricePaise, isTrial: plan.isTrial });
  res.status(201).json({ plan });
}));

// Packs already sold keep the limits they were sold with
adminRoutes.patch('/plans/:id', route(async (req, res) => {
  const changes = planInput.partial().parse(req.body);
  const plan = await savePlan(req.params.id, changes);
  await audit(req, 'plan.update', plan.name, changes);
  res.json({ plan });
}));

// ---------- Payments ----------

adminRoutes.get('/payments', route(async (req, res) => {
  const status = z.enum(['PENDING', 'PAID', 'FAILED', 'REJECTED', 'CREATED']).optional().parse(req.query.status);
  const payments = await db.payment.findMany({
    where: status ? { status } : { status: { not: 'CREATED' } },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { plan: { select: { name: true } }, user: { select: { email: true, name: true } } },
  });
  res.json({ payments });
}));

// Confirm an offline payment the user reported
adminRoutes.post('/payments/:id/approve', route(async (req, res) => {
  const payment = await db.payment.findUnique({ where: { id: req.params.id } });
  if (!payment || payment.method !== 'OFFLINE') throw new HttpError(404, 'Offline payment not found.');
  if (payment.status === 'REJECTED') throw new HttpError(400, 'This payment was rejected.');
  const purchase = await fulfilPayment(payment.id, { recordedById: req.user!.id });
  await audit(req, 'payment.approve', (await db.user.findUnique({ where: { id: payment.userId } }))?.email, { amountPaise: payment.amountPaise, reference: payment.reference });
  res.json({ purchase });
}));

adminRoutes.post('/payments/:id/reject', route(async (req, res) => {
  const payment = await db.payment.findUnique({ where: { id: req.params.id } });
  if (!payment || payment.status !== 'PENDING') throw new HttpError(400, 'Only pending offline payments can be rejected.');
  const note = z.string().trim().max(1000).optional().parse(req.body.note);
  const updated = await db.payment.update({
    where: { id: payment.id }, data: { status: 'REJECTED', note: note ?? payment.note, recordedById: req.user!.id }, include: { user: { select: { email: true } } },
  });
  await audit(req, 'payment.reject', updated.user.email, { amountPaise: payment.amountPaise, reference: payment.reference, note });
  const payer = await db.user.findUnique({ where: { id: payment.userId } });
  const plan = await db.plan.findUnique({ where: { id: payment.planId } });
  if (payer) queueEmail(await emails.offlineRejected(payer, plan?.name ?? 'your plan', note ?? ''), 'offline_rejected', payer.id);
  res.json({ payment: updated });
}));

// Record a payment received outside the website (cash, UPI, bank) and give the plan straight away
adminRoutes.post('/payments/offline', route(async (req, res) => {
  const body = z.object({
    userId: z.string(), planId: z.string(),
    amountPaise: z.number().int().min(0).optional(),
    reference: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  const plan = await db.plan.findUnique({ where: { id: body.planId } });
  if (!plan) throw new HttpError(404, 'Plan not found.');
  const payment = await db.payment.create({
    data: {
      userId: body.userId, planId: plan.id, amountPaise: body.amountPaise ?? plan.pricePaise,
      method: 'OFFLINE', status: 'PENDING', reference: body.reference, note: body.note,
    },
  });
  const purchase = await fulfilPayment(payment.id, { recordedById: req.user!.id });
  const user = await db.user.findUnique({ where: { id: body.userId }, select: { email: true } });
  await audit(req, 'payment.record', user?.email, { plan: plan.name, amountPaise: payment.amountPaise, reference: body.reference });
  res.status(201).json({ purchase });
}));

// ---------- Settings ----------

adminRoutes.get('/settings', route(async (_req, res) => {
  res.json({ settings: await settingsForAdmin() });
}));

// Only the fields sent change: a value saves it, "" or null removes the saved value
adminRoutes.patch('/settings', route(async (req, res) => {
  const body = z.object(Object.fromEntries(SETTING_KEYS.map(key => [key, z.string().trim().max(5000).nullable().optional()]))).parse(req.body);
  const changes: Partial<Record<SettingKey, string | null>> = {};
  for (const key of SETTING_KEYS) {
    if (body[key] !== undefined) changes[key] = body[key] || null;
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value && isNumberSetting(key as SettingKey) && !/^\d+$/.test(value)) throw new HttpError(400, `${SETTINGS[key as SettingKey].label} must be a whole number.`);
  }
  if (changes.aiProviderOrder && !/^(groq|openai)(,(groq|openai))?$/.test(changes.aiProviderOrder.replace(/\s/g, ''))) {
    throw new HttpError(400, 'Provider order must be "groq,openai" or "openai,groq".');
  }
  await saveSettings(changes, req.user!.id);
  // The log names what changed, never the secret values
  await audit(req, 'settings.update', null, {
    changed: Object.entries(changes).map(([key, value]) => (value === null ? `${key} (removed)` : key)),
    values: Object.fromEntries(Object.entries(changes).filter(([key]) => !(SETTINGS[key as SettingKey] as { secret?: boolean }).secret)),
  });
  res.json({ settings: await settingsForAdmin() });
}));

// Checks the saved keys actually work
adminRoutes.post('/settings/test', route(async (req, res) => {
  const what = z.enum(['groq', 'openai', 'razorpay']).parse(req.body.what);
  const s = await getSettings();
  const error = what === 'razorpay'
    ? await testRazorpayKeys(s.razorpayKeyId, s.razorpayKeySecret)
    : await testAiKey(what, what === 'groq' ? s.groqApiKey : s.openaiApiKey);
  res.json({ ok: !error, error });
}));

// ---------- Activity ----------

adminRoutes.get('/audit', route(async (req, res) => {
  const query = z.object({
    action: z.string().max(100).optional(),
    before: z.coerce.bigint().optional(), // For "Load more": the smallest id already shown
  }).parse(req.query);
  const entries = await db.auditLog.findMany({
    where: { ...(query.action ? { action: { startsWith: query.action } } : {}), ...(query.before ? { id: { lt: query.before } } : {}) },
    orderBy: { id: 'desc' },
    take: 100,
    include: { actor: { select: { email: true, name: true } } },
  });
  res.json({ entries: entries.map(e => ({ ...e, id: e.id.toString() })) });
}));
