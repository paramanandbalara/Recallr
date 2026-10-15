import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { checkPassword, hashPassword, publicUser, requireUser, signToken } from '../auth.js';
import { db } from '../db.js';
import { activeDevices, deviceInput, publicDevice, signInDevice } from '../devices.js';
import { emails } from '../emails.js';
import { allowance } from '../entitlements.js';
import { env } from '../env.js';
import { HttpError, route } from '../http.js';
import { queueEmail } from '../mailer.js';
import { getSettings, numberSetting } from '../settings.js';

export const authRoutes = Router();

// Slow down password guessing
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  skip: () => !!process.env.VITEST, // Not during automated tests
});

const RESET_MS = 60 * 60 * 1000;
const newPassword = z.string().min(8, 'Use a password of at least 8 characters.').max(200);
const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const credentials = z.object({ email, password: newPassword });

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// Short, readable codes for invite links (no 0/O or 1/I)
const newReferralCode = () => Array.from(crypto.randomBytes(8), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

export const ensureReferralCode = async (userId: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.referralCode) return user.referralCode;
  for (;;) {
    try {
      return (await db.user.update({ where: { id: userId }, data: { referralCode: newReferralCode() } })).referralCode!;
    } catch {
      // Taken (very unlikely): try another
    }
  }
};

authRoutes.post('/register', limiter, route(async (req, res) => {
  const { email: address, password } = credentials.parse(req.body);
  const name = z.string().trim().min(1, 'Enter your name.').max(100).parse(req.body.name);
  const ref = z.string().trim().toUpperCase().max(20).optional().parse(req.body.ref);
  if (await db.user.findUnique({ where: { email: address } })) throw new HttpError(409, 'This email already has an account. Sign in instead.');
  const referrer = ref ? await db.user.findUnique({ where: { referralCode: ref } }) : null;
  const user = await db.user.create({
    data: {
      email: address, name, passwordHash: await hashPassword(password),
      role: env.ADMIN_EMAIL && address === env.ADMIN_EMAIL.toLowerCase() ? 'ADMIN' : 'USER',
      referredById: referrer?.id,
    },
  });
  queueEmail(await emails.welcome(user), 'welcome', user.id);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

// The website signs in with email and password; the desktop app also sends `device`, which counts against the
// account's computer limit and may start the free trial
authRoutes.post('/login', limiter, route(async (req, res) => {
  const { email: address, password } = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body);
  const user = await db.user.findUnique({ where: { email: address } });
  if (!user || !(await checkPassword(password, user.passwordHash))) throw new HttpError(401, 'Wrong email or password.');
  if (user.status === 'BLOCKED') throw new HttpError(403, 'Your access has been turned off.', 'BLOCKED');
  if (req.body.device === undefined) return res.json({ token: signToken(user), user: publicUser(user) });

  const { device, trial } = await signInDevice(user.id, deviceInput.parse(req.body.device));
  res.json({ token: signToken(user, device.id), user: publicUser(user), trial });
}));

// Who's signed in, and what their plan still allows
authRoutes.get('/me', requireUser, route(async (req, res) => {
  const s = await getSettings();
  res.json({
    user: publicUser(req.user!),
    allowance: await allowance(req.user!.id),
    lowMinutesWarning: numberSetting(s, 'lowMinutesWarning'),
  });
}));

authRoutes.patch('/me', requireUser, route(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(1, 'Enter your name.').max(100).optional(),
    saveAnswers: z.boolean().optional(), // Keep interview questions and answers on the account
    weeklyEmail: z.boolean().optional(),  // The Monday practice email
  }).parse(req.body);
  res.json({ user: publicUser(await db.user.update({ where: { id: req.user!.id }, data })) });
}));

authRoutes.post('/password', requireUser, limiter, route(async (req, res) => {
  const body = z.object({ current: z.string().min(1, 'Enter your current password.'), password: newPassword }).parse(req.body);
  if (!(await checkPassword(body.current, req.user!.passwordHash))) throw new HttpError(400, 'Your current password is wrong.');
  await db.user.update({ where: { id: req.user!.id }, data: { passwordHash: await hashPassword(body.password) } });
  res.json({ ok: true });
}));

// ---------- The user's own data ----------

// Everything Recallr keeps about the user, as one JSON file (never the password)
authRoutes.get('/me/export', requireUser, route(async (req, res) => {
  const id = req.user!.id;
  const [purchases, payments, savedAnswers, practice, devices, tickets, memberships] = await Promise.all([
    db.purchase.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } }),
    db.payment.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' }, select: { amountPaise: true, currency: true, method: true, status: true, reference: true, createdAt: true, paidAt: true, plan: { select: { name: true } } } }),
    db.savedAnswer.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' }, select: { questionText: true, category: true, answer: true, source: true, createdAt: true } }),
    db.practiceSession.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } }),
    db.device.findMany({ where: { userId: id }, select: { name: true, platform: true, appVersion: true, createdAt: true, lastSeenAt: true, revokedAt: true } }),
    db.ticket.findMany({ where: { userId: id }, include: { messages: { select: { fromAdmin: true, body: true, createdAt: true } } } }),
    db.organizationMember.findMany({ where: { userId: id }, include: { organization: { select: { name: true } } } }),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="recallr-my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportedAt: new Date(), account: publicUser(req.user!), purchases, payments, savedAnswers, mockInterviews: practice, devices,
    supportTickets: tickets, organizations: memberships.map(m => ({ name: m.organization.name, role: m.role, joinedAt: m.createdAt })),
  });
}));

// Closing the account: personal data is deleted; payment records are kept (with the name and email removed)
// because the law requires invoices to be kept
authRoutes.post('/me/delete', requireUser, limiter, route(async (req, res) => {
  const password = z.string().min(1, 'Enter your password.').max(200).parse(req.body.password);
  const user = req.user!;
  if (!(await checkPassword(password, user.passwordHash))) throw new HttpError(400, 'That password is wrong.');
  if (user.role === 'ADMIN' && (await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })) <= 1) {
    throw new HttpError(400, 'You are the only admin. Make someone else an admin first.');
  }
  await db.$transaction([
    db.savedAnswer.deleteMany({ where: { userId: user.id } }),
    db.practiceSession.deleteMany({ where: { userId: user.id } }),
    db.backup.deleteMany({ where: { userId: user.id } }),
    db.device.deleteMany({ where: { userId: user.id } }),
    db.organizationMember.deleteMany({ where: { userId: user.id } }),
    db.passwordReset.deleteMany({ where: { userId: user.id } }),
    db.ticket.deleteMany({ where: { userId: user.id } }),
    db.user.update({
      where: { id: user.id },
      data: {
        email: `deleted-${user.id}@deleted.invalid`, name: 'Deleted user', status: 'BLOCKED', referralCode: null, saveAnswers: false,
        passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
      },
    }),
  ]);
  res.json({ ok: true });
}));

// ---------- Forgot password ----------

// Always answers the same, so it can't be used to find out who has an account
authRoutes.post('/forgot', limiter, route(async (req, res) => {
  const address = email.parse(req.body.email);
  const user = await db.user.findUnique({ where: { email: address } });
  if (user && user.status === 'ACTIVE') {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MS) } });
    queueEmail(await emails.passwordReset(user, token), 'password_reset', user.id);
  }
  res.json({ ok: true });
}));

authRoutes.post('/reset', limiter, route(async (req, res) => {
  const body = z.object({ token: z.string().min(10).max(200), password: newPassword }).parse(req.body);
  const reset = await db.passwordReset.findUnique({ where: { tokenHash: sha256(body.token) } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw new HttpError(400, 'This link has expired or was already used. Ask for a new one.', 'RESET_INVALID');
  }
  // The new password also signs out every computer, in case someone else knew the old one
  const [user] = await db.$transaction([
    db.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(body.password) } }),
    db.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } }),
    db.device.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

// ---------- Devices (the computers the app is signed in on) ----------

authRoutes.get('/devices', requireUser, route(async (req, res) => {
  const s = await getSettings();
  res.json({
    devices: (await activeDevices(req.user!.id)).map(d => ({ ...publicDevice(d), current: d.id === req.device?.id })),
    maxDevices: numberSetting(s, 'maxDevices'),
  });
}));

authRoutes.delete('/devices/:id', requireUser, route(async (req, res) => {
  const { count } = await db.device.updateMany({ where: { id: req.params.id, userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!count) throw new HttpError(404, 'Device not found.');
  res.json({ ok: true });
}));
