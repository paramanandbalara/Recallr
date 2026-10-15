import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth.js';
import { db } from '../db.js';
import { HttpError, route } from '../http.js';
import { getSettings } from '../settings.js';
import { checkVerification, maskPhone, normalizePhone, sendTemplate, sendVerificationCode, whatsappReady } from '../whatsapp.js';

// The user's WhatsApp number and what they want on it (website: Account → Settings), and the admin's log and test.
//
// Adding a number: we send a 6-digit code to it with the verification template, and give the website a signed
// token for that number (nothing is stored until it's verified). The user types the code; only then is the number
// saved on the account. So User.phone is always a verified number, and nothing is ever sent to an unverified one.

const byUser = { standardHeaders: true, legacyHeaders: false, skip: () => !!process.env.VITEST } as const;
const codeLimiter = rateLimit({ ...byUser, windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: req => req.user!.id, message: { error: 'Too many codes asked for. Try again in an hour.' } });
const verifyLimiter = rateLimit({ ...byUser, windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: req => req.user!.id, message: { error: 'Too many tries. Ask for a new code in 15 minutes.' } });

const mine = (user: { phone: string; whatsappReminders: boolean; whatsappDaily: boolean }, available: boolean) => ({
  available, phone: user.phone, reminders: user.whatsappReminders, daily: user.whatsappDaily,
});

export const whatsappRoutes = Router();
whatsappRoutes.use(requireUser);

whatsappRoutes.get('/', route(async (req, res) => {
  res.json(mine(req.user!, await whatsappReady()));
}));

// Step 1: send a code to the number
whatsappRoutes.post('/phone', codeLimiter, route(async (req, res) => {
  const phone = normalizePhone(z.string().max(30).parse(req.body.phone ?? ''));
  if (!phone) throw new HttpError(400, 'Enter a valid mobile number, e.g. 98765 43210 (India) or +44 7700 900123.');
  if (!await whatsappReady()) throw new HttpError(503, 'WhatsApp messages are not set up yet.', 'WHATSAPP_OFF');
  const { status, error, token } = await sendVerificationCode(req.user!.id, phone);
  if (status !== 'sent') {
    console.error(`Verification code to ${maskPhone(phone)} not sent: ${error}`);
    throw new HttpError(502, 'We could not send a code to that number on WhatsApp. Check the number has WhatsApp, then try again.');
  }
  res.json({ token, phone });
}));

// Step 2: the code from WhatsApp saves the number (reminders and the daily question can then be turned on)
whatsappRoutes.post('/verify', verifyLimiter, route(async (req, res) => {
  const { token, code } = z.object({ token: z.string().max(1000), code: z.string().trim().max(10) }).parse(req.body);
  const phone = checkVerification(req.user!.id, token, code.replace(/\s/g, ''));
  if (!phone) throw new HttpError(400, 'That code is not right, or it is more than 10 minutes old.');
  const user = await db.user.update({ where: { id: req.user!.id }, data: { phone } });
  res.json(mine(user, await whatsappReady()));
}));

whatsappRoutes.delete('/phone', route(async (req, res) => {
  const user = await db.user.update({ where: { id: req.user!.id }, data: { phone: '', whatsappReminders: false, whatsappDaily: false } });
  res.json(mine(user, await whatsappReady()));
}));

whatsappRoutes.patch('/', route(async (req, res) => {
  const body = z.object({ reminders: z.boolean().optional(), daily: z.boolean().optional() }).parse(req.body);
  if ((body.reminders || body.daily) && !req.user!.phone) throw new HttpError(400, 'Add and verify your WhatsApp number first.');
  const user = await db.user.update({
    where: { id: req.user!.id },
    data: { ...(body.reminders !== undefined ? { whatsappReminders: body.reminders } : {}), ...(body.daily !== undefined ? { whatsappDaily: body.daily } : {}) },
  });
  res.json(mine(user, await whatsappReady()));
}));

// ---------- Admin ----------

export const adminWhatsAppRoutes = Router();
adminWhatsAppRoutes.use('/whatsapp', requireUser, requireAdmin);

adminWhatsAppRoutes.get('/whatsapp/logs', route(async (req, res) => {
  const query = z.object({ status: z.enum(['sent', 'failed', 'skipped']).optional(), template: z.string().max(100).optional() }).parse(req.query);
  const [logs, users] = await Promise.all([
    db.whatsAppLog.findMany({
      where: { ...(query.status ? { status: query.status } : {}), ...(query.template ? { template: query.template } : {}) },
      orderBy: { createdAt: 'desc' }, take: 200,
    }),
    db.user.count({ where: { phone: { not: '' } } }),
  ]);
  const emails = new Map((await db.user.findMany({
    where: { id: { in: [...new Set(logs.map(l => l.userId).filter((id): id is string => !!id))] } }, select: { id: true, email: true },
  })).map(u => [u.id, u.email]));
  const [reminders, daily] = await Promise.all([
    db.user.count({ where: { phone: { not: '' }, whatsappReminders: true } }),
    db.user.count({ where: { phone: { not: '' }, whatsappDaily: true } }),
  ]);
  res.json({
    ready: await whatsappReady(),
    counts: { verified: users, reminders, daily },
    logs: logs.map(l => ({ ...l, to: maskPhone(l.to), email: l.userId ? emails.get(l.userId) ?? null : null })),
  });
}));

// Admin → Settings → WhatsApp → "Send a test message": the reminder template with sample values, to the admin's
// verified number or one they type
adminWhatsAppRoutes.post('/whatsapp/test', route(async (req, res) => {
  const given = z.string().max(30).optional().parse(req.body.to);
  const to = given ? normalizePhone(given) : req.user!.phone;
  if (!to) throw new HttpError(400, given ? 'Enter a valid number, e.g. +91 98765 43210.' : 'Type the number to send the test to.');
  const s = await getSettings();
  const result = await sendTemplate({ to, template: s.whatsappTemplateReminder, params: ['Test interview', 'tomorrow at 10:30 am'], userId: req.user!.id });
  await audit(req, 'whatsapp.test', null, { to: maskPhone(to), status: result.status });
  res.json({ ok: result.status === 'sent', error: result.error });
}));
