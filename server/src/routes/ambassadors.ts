import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth.js';
import { db } from '../db.js';
import { emails } from '../emails.js';
import { HttpError, route } from '../http.js';
import { monthStart, paidFriendsByReferrer } from '../leaderboard.js';
import { queueEmail } from '../mailer.js';
import { getSettings, numberSetting } from '../settings.js';
import { ensureReferralCode } from './auth.js';

// College ambassadors: students apply on /ambassadors, the admin approves them, and an approved ambassador gets
// the ambassador bonus (Admin → Settings → Referrals) for each invited friend's first payment (see fulfil.ts).

export const ambassadorRoutes = Router();

// What the program gives, for the public page
ambassadorRoutes.get('/program', route(async (_req, res) => {
  const s = await getSettings();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    bonusMinutes: numberSetting(s, 'ambassadorBonusMinutes'),
    friendMinutes: numberSetting(s, 'referralBonusMinutes'),
    days: numberSetting(s, 'referralBonusDays'),
  });
}));

const ownView = (a: { status: string; college: string; city: string; course: string; why: string; note: string; createdAt: Date; approvedAt: Date | null }) => ({
  status: a.status, college: a.college, city: a.city, course: a.course, why: a.why, note: a.note, createdAt: a.createdAt, approvedAt: a.approvedAt,
});

ambassadorRoutes.get('/me', requireUser, route(async (req, res) => {
  const ambassador = await db.ambassador.findUnique({ where: { userId: req.user!.id } });
  res.json({ ambassador: ambassador ? ownView(ambassador) : null });
}));

const application = z.object({
  college: z.string().trim().min(2, 'Enter your college.').max(200),
  city: z.string().trim().min(2, 'Enter your city.').max(100),
  course: z.string().trim().min(2, 'Enter your course and year.').max(200),
  why: z.string().trim().min(20, 'Tell us in a sentence or two why you’d like to be an ambassador.').max(1000),
});

// Once per account
ambassadorRoutes.post('/apply', requireUser, route(async (req, res) => {
  const input = application.parse(req.body ?? {});
  const user = req.user!;
  if (await db.ambassador.findUnique({ where: { userId: user.id } })) throw new HttpError(409, 'You’ve already applied. Your application’s status is on your Invite friends page.', 'ALREADY_APPLIED');
  let ambassador;
  try {
    ambassador = await db.ambassador.create({ data: { userId: user.id, ...input } });
  } catch (error) {
    // Two applications sent at the same moment
    if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, 'You’ve already applied.', 'ALREADY_APPLIED');
    throw error;
  }
  const { supportEmail } = await getSettings();
  if (supportEmail) queueEmail(await emails.ambassadorAppliedForAdmin(supportEmail, { name: user.name, email: user.email, ...input }), 'ambassador_admin');
  res.status(201).json({ ambassador: ownView(ambassador) });
}));

// ---------- Admin ----------

export const adminAmbassadorRoutes = Router();
adminAmbassadorRoutes.use(['/ambassadors', '/referrals'], requireUser, requireAdmin);

const STATUSES = ['APPLIED', 'APPROVED', 'REJECTED'] as const;

adminAmbassadorRoutes.get('/ambassadors', route(async (req, res) => {
  const status = z.enum(STATUSES).optional().catch(undefined).parse(req.query.status);
  const [ambassadors, invited, paid, paidMonth, counts] = await Promise.all([
    db.ambassador.findMany({
      where: status ? { status } : {}, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 500,
      include: { user: { select: { id: true, name: true, email: true, referralCode: true, createdAt: true } } },
    }),
    db.user.groupBy({ by: ['referredById'], where: { referredBy: { ambassador: { isNot: null } } }, _count: { _all: true } }),
    paidFriendsByReferrer(null),
    paidFriendsByReferrer(monthStart()),
    db.ambassador.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const invitedBy = new Map(invited.map(r => [r.referredById, r._count._all]));
  const paidBy = new Map(paid.map(r => [r.userId, r.friends]));
  const monthBy = new Map(paidMonth.map(r => [r.userId, r.friends]));
  res.json({
    counts: Object.fromEntries(STATUSES.map(s => [s, counts.find(c => c.status === s)?._count._all ?? 0])),
    ambassadors: ambassadors.map(a => ({
      ...a, invited: invitedBy.get(a.userId) ?? 0, paidFriends: paidBy.get(a.userId) ?? 0, paidFriendsThisMonth: monthBy.get(a.userId) ?? 0,
    })),
  });
}));

const decision = z.object({ note: z.string().trim().max(1000).default('') });

const decide = (status: 'APPROVED' | 'REJECTED') => route(async (req, res) => {
  const { note } = decision.parse(req.body ?? {});
  const existing = await db.ambassador.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!existing) throw new HttpError(404, 'Application not found.');
  const ambassador = await db.ambassador.update({
    where: { id: existing.id },
    data: { status, note, approvedAt: status === 'APPROVED' ? existing.approvedAt ?? new Date() : null },
    include: { user: { select: { id: true, name: true, email: true, referralCode: true, createdAt: true } } },
  });
  if (status === 'APPROVED') await ensureReferralCode(existing.userId);
  // An email only when the decision changes (saving a new note again doesn't send another)
  if (existing.status !== status && existing.user.status === 'ACTIVE') {
    const s = await getSettings();
    const email = status === 'APPROVED'
      ? await emails.ambassadorApproved(existing.user, existing.college, numberSetting(s, 'ambassadorBonusMinutes'), note)
      : await emails.ambassadorRejected(existing.user, note, existing.status === 'APPROVED');
    queueEmail(email, status === 'APPROVED' ? 'ambassador_approved' : 'ambassador_rejected', existing.userId);
  }
  await audit(req, status === 'APPROVED' ? 'ambassador.approve' : 'ambassador.reject', existing.user.email, { college: existing.college, note });
  res.json({ ambassador });
});

adminAmbassadorRoutes.post('/ambassadors/:id/approve', decide('APPROVED'));
adminAmbassadorRoutes.post('/ambassadors/:id/reject', decide('REJECTED'));

// Referrals in full for the admin: totals, every referrer (with email), and the latest friends who joined
adminAmbassadorRoutes.get('/referrals', route(async (_req, res) => {
  const since = monthStart();
  const [invitedTotal, rewardedTotal, bonus, invitedBy, paid, paidMonth, recent] = await Promise.all([
    db.user.count({ where: { referredById: { not: null } } }),
    db.user.count({ where: { referralRewardedAt: { not: null } } }),
    db.purchase.aggregate({ where: { source: 'REFERRAL' }, _count: { _all: true }, _sum: { listeningMinutes: true } }),
    db.user.groupBy({ by: ['referredById'], where: { referredById: { not: null } }, _count: { _all: true } }),
    paidFriendsByReferrer(null),
    paidFriendsByReferrer(since),
    db.user.findMany({
      where: { referredById: { not: null } }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, name: true, email: true, createdAt: true, referralRewardedAt: true, referredBy: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  const paidBy = new Map(paid.map(r => [r.userId, r.friends]));
  const monthBy = new Map(paidMonth.map(r => [r.userId, r.friends]));
  const ids = invitedBy.map(r => r.referredById!).filter(Boolean);
  const people = await db.user.findMany({
    where: { id: { in: ids } }, select: { id: true, name: true, email: true, status: true, referralCode: true, ambassador: { select: { status: true, college: true } } },
  });
  const referrers = people.map(p => ({
    ...p,
    invited: invitedBy.find(r => r.referredById === p.id)?._count._all ?? 0,
    paidFriends: paidBy.get(p.id) ?? 0,
    paidFriendsThisMonth: monthBy.get(p.id) ?? 0,
  })).sort((a, b) => b.paidFriends - a.paidFriends || b.paidFriendsThisMonth - a.paidFriendsThisMonth || b.invited - a.invited);
  res.json({
    totals: {
      invited: invitedTotal,
      paidFriends: paid.reduce((n, r) => n + r.friends, 0),
      paidFriendsThisMonth: paidMonth.reduce((n, r) => n + r.friends, 0),
      rewarded: rewardedTotal,
      bonusPacks: bonus._count._all,
      bonusMinutes: bonus._sum.listeningMinutes ?? 0,
      referrers: referrers.length,
    },
    referrers: referrers.slice(0, 200),
    recent,
  });
}));
