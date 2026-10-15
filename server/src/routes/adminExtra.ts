import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth.js';
import { normalizeCode } from '../coupons.js';
import { costPaise, USD_TO_INR, type UsageTotals } from '../costs.js';
import { db } from '../db.js';
import { emails } from '../emails.js';
import { HttpError, route } from '../http.js';
import { queueEmail, sendTestEmail } from '../mailer.js';

// Admin: coupons, announcements, support, reports, devices and emails
export const adminExtraRoutes = Router();
adminExtraRoutes.use(requireUser, requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Coupons ----------

const couponInput = z.object({
  code: z.string().trim().min(3).max(40).transform(normalizeCode).refine(c => /^[A-Z0-9_-]+$/.test(c), 'Use only letters, numbers, - and _.'),
  kind: z.enum(['PERCENT', 'FIXED']),
  amount: z.number().int().min(1),
  maxUses: z.number().int().min(1).nullable().default(null),
  onePerUser: z.boolean().default(true),
  planIds: z.array(z.string()).nullable().default(null),
  expiresAt: z.coerce.date().nullable().default(null),
  active: z.boolean().default(true),
  note: z.string().trim().max(300).default(''),
}).refine(c => c.kind !== 'PERCENT' || c.amount <= 100, { message: 'A percent discount can be at most 100.', path: ['amount'] });

adminExtraRoutes.get('/coupons', route(async (_req, res) => {
  const coupons = await db.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  const revenue = await db.payment.groupBy({ by: ['couponId'], where: { status: 'PAID', couponId: { not: null } }, _sum: { amountPaise: true, discountPaise: true } });
  const byId = new Map(revenue.map(r => [r.couponId, r._sum]));
  res.json({ coupons: coupons.map(c => ({ ...c, revenuePaise: byId.get(c.id)?.amountPaise ?? 0, discountGivenPaise: byId.get(c.id)?.discountPaise ?? 0 })) });
}));

adminExtraRoutes.post('/coupons', route(async (req, res) => {
  const data = couponInput.parse(req.body);
  if (await db.coupon.findUnique({ where: { code: data.code } })) throw new HttpError(409, 'A coupon with this code already exists.');
  const coupon = await db.coupon.create({ data: { ...data, planIds: data.planIds ?? Prisma.DbNull } }); // null = every plan
  await audit(req, 'coupon.create', coupon.code, { kind: coupon.kind, amount: coupon.amount });
  res.status(201).json({ coupon });
}));

adminExtraRoutes.patch('/coupons/:id', route(async (req, res) => {
  const data = couponInput.innerType().omit({ code: true }).partial().parse(req.body);
  if (data.kind === 'PERCENT' && data.amount && data.amount > 100) throw new HttpError(400, 'A percent discount can be at most 100.');
  const coupon = await db.coupon.update({
    where: { id: req.params.id },
    data: { ...data, planIds: data.planIds === null ? Prisma.DbNull : data.planIds },
  });
  await audit(req, 'coupon.update', coupon.code, data);
  res.json({ coupon });
}));

// ---------- Announcements ----------

const announcementInput = z.object({
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().max(2000).default(''),
  level: z.enum(['INFO', 'WARNING']).default('INFO'),
  audience: z.enum(['ALL', 'DESKTOP', 'WEBSITE']).default('ALL'),
  active: z.boolean().default(true),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().default(null),
});

adminExtraRoutes.get('/announcements', route(async (_req, res) => {
  res.json({ announcements: await db.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) });
}));

adminExtraRoutes.post('/announcements', route(async (req, res) => {
  const announcement = await db.announcement.create({ data: announcementInput.parse(req.body) });
  await audit(req, 'announcement.create', announcement.title, { audience: announcement.audience });
  res.status(201).json({ announcement });
}));

adminExtraRoutes.patch('/announcements/:id', route(async (req, res) => {
  const announcement = await db.announcement.update({ where: { id: req.params.id }, data: announcementInput.partial().parse(req.body) });
  await audit(req, 'announcement.update', announcement.title, { active: announcement.active });
  res.json({ announcement });
}));

adminExtraRoutes.delete('/announcements/:id', route(async (req, res) => {
  const announcement = await db.announcement.delete({ where: { id: req.params.id } });
  await audit(req, 'announcement.delete', announcement.title);
  res.json({ ok: true });
}));

// ---------- Support ----------

adminExtraRoutes.get('/support', route(async (req, res) => {
  const status = z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional().parse(req.query.status || undefined);
  const tickets = await db.ticket.findMany({
    where: status ? { status } : undefined, orderBy: { updatedAt: 'desc' }, take: 300,
    include: { user: { select: { id: true, email: true, name: true } }, _count: { select: { messages: true } } },
  });
  res.json({ tickets, open: await db.ticket.count({ where: { status: 'OPEN' } }) });
}));

const ticketWithMessages = (id: string) => db.ticket.findUnique({
  where: { id },
  include: {
    user: { select: { id: true, email: true, name: true } },
    messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true, email: true } } } },
  },
});

adminExtraRoutes.get('/support/:id', route(async (req, res) => {
  const ticket = await ticketWithMessages(req.params.id);
  if (!ticket) throw new HttpError(404, 'Request not found.');
  res.json({ ticket });
}));

adminExtraRoutes.post('/support/:id/messages', route(async (req, res) => {
  const text = z.string().trim().min(1, 'Write a reply.').max(10_000).parse(req.body.body);
  const close = z.boolean().default(false).parse(req.body.close);
  const ticket = await db.ticket.update({
    where: { id: req.params.id },
    data: { status: close ? 'CLOSED' : 'ANSWERED', messages: { create: { authorId: req.user!.id, fromAdmin: true, body: text } } },
    include: { user: true },
  });
  queueEmail(await emails.ticketReply(ticket.user, ticket.subject), 'ticket_reply', ticket.userId);
  await audit(req, 'support.reply', ticket.user.email, { subject: ticket.subject, closed: close });
  res.status(201).json({ ticket: await ticketWithMessages(ticket.id) });
}));

adminExtraRoutes.post('/support/:id/status', route(async (req, res) => {
  const status = z.enum(['OPEN', 'ANSWERED', 'CLOSED']).parse(req.body.status);
  await db.ticket.update({ where: { id: req.params.id }, data: { status } });
  res.json({ ticket: await ticketWithMessages(req.params.id) });
}));

// ---------- Devices and emails of a user ----------

adminExtraRoutes.delete('/devices/:id', route(async (req, res) => {
  const device = await db.device.update({ where: { id: req.params.id }, data: { revokedAt: new Date() }, include: { user: { select: { email: true } } } });
  await audit(req, 'device.remove', device.user.email, { device: device.name });
  res.json({ ok: true });
}));

adminExtraRoutes.get('/emails', route(async (req, res) => {
  const query = z.object({ userId: z.string().optional(), status: z.enum(['SENT', 'FAILED', 'SKIPPED']).optional() }).parse(req.query);
  const entries = await db.emailLog.findMany({
    where: { ...(query.userId ? { userId: query.userId } : {}), ...(query.status ? { status: query.status } : {}) },
    orderBy: { id: 'desc' }, take: 200,
  });
  res.json({ emails: entries.map(e => ({ ...e, id: e.id.toString() })) });
}));

adminExtraRoutes.post('/emails/test', route(async (req, res) => {
  const to = z.string().email().parse(req.body.to ?? req.user!.email);
  try {
    await sendTestEmail(to);
    res.json({ ok: true, error: '' });
  } catch (error) {
    res.json({ ok: false, error: error instanceof Error ? error.message : 'Sending failed.' });
  }
}));

// ---------- Reports ----------

type Row = { day: Date | string; n: bigint | number };
const dayKey = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const num = (v: unknown) => Number(v ?? 0);

adminExtraRoutes.get('/reports', route(async (req, res) => {
  const days = z.coerce.number().int().min(7).max(365).default(30).parse(req.query.days);
  const since = new Date(Date.now() - (days - 1) * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);

  // Raw SQL uses the database's snake_case names; the AS aliases give the camelCase names the code reads
  const [signups, revenue, active, usage, byPlan, planUsage, speed] = await Promise.all([
    db.$queryRaw<Row[]>`SELECT DATE(created_at) AS day, COUNT(*) AS n FROM users WHERE created_at >= ${since} GROUP BY day`,
    db.$queryRaw<Row[]>`SELECT DATE(paid_at) AS day, SUM(amount_paise) AS n FROM payments WHERE status = 'PAID' AND paid_at >= ${since} GROUP BY day`,
    db.$queryRaw<Row[]>`SELECT DATE(created_at) AS day, COUNT(DISTINCT user_id) AS n FROM usage_events WHERE created_at >= ${since} GROUP BY day`,
    db.$queryRaw<(UsageTotals & { day: Date | string })[]>`
      SELECT DATE(created_at) AS day, kind, model, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens, SUM(audio_seconds) AS audioSeconds
      FROM usage_events WHERE created_at >= ${since} GROUP BY day, kind, model`,
    db.$queryRaw<{ planName: string; revenue: unknown; sold: unknown }[]>`
      SELECT pl.name AS planName, SUM(p.amount_paise) AS revenue, COUNT(*) AS sold
      FROM payments p JOIN plans pl ON pl.id = p.plan_id WHERE p.status = 'PAID' AND p.paid_at >= ${since} GROUP BY pl.name`,
    db.$queryRaw<(UsageTotals & { planName: string })[]>`
      SELECT pu.plan_name AS planName, u.kind, u.model, SUM(u.input_tokens) AS inputTokens, SUM(u.output_tokens) AS outputTokens, SUM(u.audio_seconds) AS audioSeconds
      FROM usage_events u JOIN purchases pu ON pu.id = u.purchase_id WHERE u.created_at >= ${since} GROUP BY pu.plan_name, u.kind, u.model`,
    // How fast answers start, per provider and model (only answers that were timed)
    db.$queryRaw<{ provider: string; model: string; answers: unknown; averageMs: unknown; slowestMs: unknown }[]>`
      SELECT provider, model, COUNT(*) AS answers, AVG(latency_ms) AS averageMs, MAX(latency_ms) AS slowestMs
      FROM usage_events WHERE kind = 'CHAT' AND latency_ms IS NOT NULL AND created_at >= ${since} GROUP BY provider, model`,
  ]);

  const series = Array.from({ length: days }, (_, i) => ({
    day: new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10), signups: 0, revenuePaise: 0, activeUsers: 0, aiCostPaise: 0,
  }));
  const at = new Map(series.map(s => [s.day, s]));
  for (const r of signups) { const s = at.get(dayKey(r.day)); if (s) s.signups = num(r.n); }
  for (const r of revenue) { const s = at.get(dayKey(r.day)); if (s) s.revenuePaise = num(r.n); }
  for (const r of active) { const s = at.get(dayKey(r.day)); if (s) s.activeUsers = num(r.n); }
  const totals = (u: UsageTotals) => ({ kind: u.kind, model: u.model, inputTokens: num(u.inputTokens), outputTokens: num(u.outputTokens), audioSeconds: num(u.audioSeconds) });
  for (const u of usage) { const s = at.get(dayKey(u.day)); if (s) s.aiCostPaise += costPaise(totals(u)); }

  // Revenue and AI cost per plan (the trial and bonuses earn nothing but still cost)
  const plans = new Map<string, { planName: string; revenuePaise: number; sold: number; aiCostPaise: number }>();
  const plan = (name: string) => plans.get(name) ?? plans.set(name, { planName: name, revenuePaise: 0, sold: 0, aiCostPaise: 0 }).get(name)!;
  for (const r of byPlan) Object.assign(plan(r.planName), { revenuePaise: num(r.revenue), sold: num(r.sold) });
  for (const u of planUsage) plan(u.planName).aiCostPaise += costPaise(totals(u));

  res.json({
    days, series, plans: [...plans.values()].sort((a, b) => b.revenuePaise - a.revenuePaise), usdToInr: USD_TO_INR,
    speed: speed.map(s => ({ provider: s.provider, model: s.model, answers: num(s.answers), averageMs: Math.round(num(s.averageMs)), slowestMs: num(s.slowestMs) }))
      .sort((a, b) => a.averageMs - b.averageMs),
  });
}));
