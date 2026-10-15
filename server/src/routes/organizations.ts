import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth.js';
import { db } from '../db.js';
import { emails } from '../emails.js';
import { HttpError, route } from '../http.js';
import { queueEmail } from '../mailer.js';
import { getSettings } from '../settings.js';

// Plans for colleges, bootcamps and companies: an organization buys seats (arranged with the admin), shares an
// invite link, and each student who joins gets the member pack. Coaches see their students' practice progress
// (scores and speaking feedback), never their interview answers.

const DAY_MS = 24 * 60 * 60 * 1000;
const newInviteCode = () => Array.from(crypto.randomBytes(10), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: () => !!process.env.VITEST });

const studentCount = (organizationId: string) => db.organizationMember.count({ where: { organizationId, role: 'STUDENT' } });

const isOpen = (org: { active: boolean; expiresAt: Date | null }) => org.active && (!org.expiresAt || org.expiresAt > new Date());

// The organization with its seats, coaches and each student's progress
const organizationDetail = async (id: string) => {
  const org = await db.organization.findUnique({
    where: { id },
    include: { members: { include: { user: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!org) throw new HttpError(404, 'Organization not found.');
  const students = org.members.filter(m => m.role === 'STUDENT');
  const userIds = students.map(m => m.userId);
  const [packs, sessions] = await Promise.all([
    db.purchase.findMany({ where: { organizationId: id, userId: { in: userIds } } }),
    db.practiceSession.findMany({ where: { userId: { in: userIds } }, orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    organization: {
      id: org.id, name: org.name, kind: org.kind, seats: org.seats, seatsUsed: students.length, inviteCode: org.inviteCode,
      memberMinutes: org.memberMinutes, memberTokens: org.memberTokens, memberDays: org.memberDays, active: org.active,
      expiresAt: org.expiresAt, contactEmail: org.contactEmail, notes: org.notes, createdAt: org.createdAt, open: isOpen(org),
    },
    coaches: org.members.filter(m => m.role === 'COACH').map(m => ({ userId: m.userId, name: m.user.name, email: m.user.email })),
    students: students.map(m => {
      const own = sessions.filter(s => s.userId === m.userId);
      const recent = own.slice(0, 5);
      const avg = (values: (number | null)[]) => {
        const known = values.filter((v): v is number => v !== null);
        return known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null;
      };
      const pack = packs.find(p => p.userId === m.userId);
      return {
        userId: m.userId, name: m.user.name, email: m.user.email, joinedAt: m.createdAt, lastSeenAt: m.user.lastSeenAt,
        listeningMinutesUsed: pack ? Math.round(pack.usedSeconds / 60) : 0,
        packEndsAt: pack?.expiresAt ?? null,
        mockInterviews: own.length,
        recentScore: avg(recent.map(s => s.averageScore)),
        firstScore: own.length ? own[own.length - 1].averageScore : null,
        wordsPerMinute: avg(recent.map(s => s.wordsPerMinute)),
        fillersPerMinute: avg(recent.map(s => s.fillersPerMinute)),
        lastPracticeAt: own[0]?.createdAt ?? null,
      };
    }),
  };
};

// Takes a student out of the organization; their seat's pack ends now, so the seat can be given to someone else
const removeStudent = async (organizationId: string, userId: string) => {
  const { count } = await db.organizationMember.deleteMany({ where: { organizationId, userId, role: 'STUDENT' } });
  if (!count) throw new HttpError(404, 'Student not found.');
  await db.purchase.updateMany({ where: { organizationId, userId, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
};

// ---------- Website: enquiries and invite links ----------

export const organizationPublicRoutes = Router();

organizationPublicRoutes.post('/enquiries', limiter, route(async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(1, 'Enter your name.').max(100),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    phone: z.string().trim().max(30).default(''),
    organization: z.string().trim().min(2, 'Enter the name of your college or company.').max(200),
    size: z.number().int().min(1).max(100_000).nullable().default(null),
    message: z.string().trim().max(2000).default(''),
  }).parse(req.body);
  await db.enquiry.create({ data: input });
  const { supportEmail } = await getSettings();
  if (supportEmail) queueEmail(await emails.enquiryForAdmin(supportEmail, input), 'enquiry_admin');
  res.status(201).json({ ok: true });
}));

organizationPublicRoutes.get('/organizations/invite/:code', route(async (req, res) => {
  const org = await db.organization.findUnique({ where: { inviteCode: req.params.code.toUpperCase() } });
  if (!org) throw new HttpError(404, 'This invite link is not valid. Ask your coach for a new one.');
  const seatsLeft = Math.max(0, org.seats - await studentCount(org.id));
  res.json({ name: org.name, kind: org.kind, open: isOpen(org) && seatsLeft > 0, seatsLeft, memberDays: org.memberDays, memberMinutes: org.memberMinutes });
}));

// ---------- Students and coaches ----------

export const organizationRoutes = Router();
organizationRoutes.use(requireUser);

organizationRoutes.post('/join', route(async (req, res) => {
  const code = z.string().trim().toUpperCase().min(6).max(20).parse(req.body.code);
  const user = req.user!;
  const result = await db.$transaction(async tx => {
    const org = await tx.organization.findUnique({ where: { inviteCode: code } });
    if (!org) throw new HttpError(404, 'This invite link is not valid. Ask your coach for a new one.');
    if (!isOpen(org)) throw new HttpError(409, `${org.name} isn't taking new students right now.`, 'ORG_CLOSED');
    const existing = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } } });
    if (existing) throw new HttpError(409, existing.role === 'COACH' ? `You're a coach of ${org.name}.` : `You've already joined ${org.name}.`, 'ALREADY_MEMBER');
    if (await tx.organizationMember.count({ where: { organizationId: org.id, role: 'STUDENT' } }) >= org.seats) {
      throw new HttpError(409, `All of ${org.name}'s seats are taken. Ask your coach to add more.`, 'ORG_FULL');
    }
    await tx.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'STUDENT' } });
    const now = new Date();
    await tx.purchase.create({
      data: {
        userId: user.id, organizationId: org.id, planName: org.name, source: 'ORGANIZATION', startsAt: now,
        expiresAt: new Date(now.getTime() + org.memberDays * DAY_MS),
        listeningMinutes: org.memberMinutes, tokenLimit: org.memberTokens,
      },
    });
    return org;
  });
  queueEmail(await emails.joinedOrganization(user, result.name, result.memberDays), 'joined_organization', user.id);
  res.status(201).json({ organization: { id: result.id, name: result.name } });
}));

organizationRoutes.get('/mine', route(async (req, res) => {
  const memberships = await db.organizationMember.findMany({ where: { userId: req.user!.id }, include: { organization: true }, orderBy: { createdAt: 'desc' } });
  res.json({ memberships: memberships.map(m => ({ role: m.role, joinedAt: m.createdAt, organization: { id: m.organization.id, name: m.organization.name, kind: m.organization.kind } })) });
}));

const requireCoach = async (organizationId: string, userId: string) => {
  const member = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (member?.role !== 'COACH') throw new HttpError(403, 'Only coaches of this organization can see this.');
};

organizationRoutes.get('/:id', route(async (req, res) => {
  await requireCoach(req.params.id, req.user!.id);
  res.json(await organizationDetail(req.params.id));
}));

organizationRoutes.delete('/:id/students/:userId', route(async (req, res) => {
  await requireCoach(req.params.id, req.user!.id);
  await removeStudent(req.params.id, req.params.userId);
  res.json({ ok: true });
}));

// ---------- Admin ----------

export const adminOrganizationRoutes = Router();
adminOrganizationRoutes.use(requireUser, requireAdmin);

const orgInput = z.object({
  name: z.string().trim().min(2).max(200),
  kind: z.enum(['COLLEGE', 'BOOTCAMP', 'COMPANY', 'OTHER']),
  seats: z.number().int().min(1).max(100_000),
  memberMinutes: z.number().int().min(1).max(1_000_000).nullable(),
  memberTokens: z.number().int().min(1).max(1_000_000_000).nullable(),
  memberDays: z.number().int().min(1).max(3650),
  expiresAt: z.coerce.date().nullable(),
  contactEmail: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  active: z.boolean(),
});

adminOrganizationRoutes.get('/organizations', route(async (_req, res) => {
  const orgs = await db.organization.findMany({ orderBy: { createdAt: 'desc' }, include: { members: { select: { role: true } } } });
  res.json({
    organizations: orgs.map(({ members, ...org }) => ({
      ...org, seatsUsed: members.filter(m => m.role === 'STUDENT').length, coaches: members.filter(m => m.role === 'COACH').length, open: isOpen(org),
    })),
  });
}));

adminOrganizationRoutes.post('/organizations', route(async (req, res) => {
  const input = orgInput.partial({ expiresAt: true, contactEmail: true, notes: true, active: true, memberTokens: true }).parse(req.body);
  const org = await db.organization.create({ data: { ...input, inviteCode: newInviteCode() } });
  await audit(req, 'organization.create', org.name, { seats: org.seats });
  res.status(201).json({ organization: org });
}));

adminOrganizationRoutes.get('/organizations/:id', route(async (req, res) => {
  res.json(await organizationDetail(req.params.id));
}));

adminOrganizationRoutes.patch('/organizations/:id', route(async (req, res) => {
  const input = orgInput.partial().extend({ newInviteCode: z.boolean().optional() }).parse(req.body);
  const { newInviteCode: rotate, ...data } = input;
  const org = await db.organization.update({ where: { id: req.params.id }, data: { ...data, ...(rotate ? { inviteCode: newInviteCode() } : {}) } })
    .catch(() => { throw new HttpError(404, 'Organization not found.'); });
  await audit(req, 'organization.update', org.name, { changed: Object.keys(input) });
  res.json({ organization: org });
}));

// Coaches must have an account already (they register on the website like everyone)
adminOrganizationRoutes.post('/organizations/:id/coaches', route(async (req, res) => {
  const email = z.string().trim().toLowerCase().email('Enter a valid email address.').parse(req.body.email);
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(404, 'No account has that email. Ask the coach to register on the website first.');
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: req.params.id, userId: user.id } },
    create: { organizationId: req.params.id, userId: user.id, role: 'COACH' },
    update: { role: 'COACH' },
  });
  await audit(req, 'organization.coach_add', email);
  res.json(await organizationDetail(req.params.id));
}));

adminOrganizationRoutes.delete('/organizations/:id/coaches/:userId', route(async (req, res) => {
  await db.organizationMember.deleteMany({ where: { organizationId: req.params.id, userId: req.params.userId, role: 'COACH' } });
  res.json(await organizationDetail(req.params.id));
}));

adminOrganizationRoutes.delete('/organizations/:id/students/:userId', route(async (req, res) => {
  await removeStudent(req.params.id, req.params.userId);
  res.json({ ok: true });
}));

adminOrganizationRoutes.get('/enquiries', route(async (_req, res) => {
  res.json({ enquiries: await db.enquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) });
}));

adminOrganizationRoutes.patch('/enquiries/:id', route(async (req, res) => {
  const status = z.enum(['NEW', 'CONTACTED', 'CLOSED']).parse(req.body.status);
  const enquiry = await db.enquiry.update({ where: { id: req.params.id }, data: { status } }).catch(() => { throw new HttpError(404, 'Enquiry not found.'); });
  res.json({ enquiry });
}));
