import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { HttpError, route } from '../http.js';

// The desktop app's interview calendar, kept on the account so reminders (email, WhatsApp) and the website's
// dashboard know when the next interview is. The app sends each interview it has in the background
// (desktop/src/services/interviewSync.ts); the app's own id is the key, so sending again just updates it.

export const interviewRoutes = Router();
interviewRoutes.use(requireUser);

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;
const MAX_LIST = 50;

const clientIdOf = (req: Request) => {
  const id = req.params.clientId;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new HttpError(400, 'That isn’t an interview id.');
  return id;
};

const interviewInput = z.object({
  title: z.string().trim().min(1, 'Add a name for the interview.').max(200),
  startsAt: z.coerce.date({ invalid_type_error: 'That isn’t a date.' })
    .refine(d => Math.abs(d.getTime() - Date.now()) < 5 * 365 * DAY_MS, 'That date is too far away.'),
  profileClientId: z.string().max(40).regex(/^[A-Za-z0-9_-]*$/).default(''),
  notes: z.string().max(1000).default(''),
});

type Row = Awaited<ReturnType<typeof db.userInterview.findFirstOrThrow>>;
export const publicInterview = (i: Row) => ({
  clientId: i.clientId, title: i.title, startsAt: i.startsAt, profileClientId: i.profileClientId, notes: i.notes,
  createdAt: i.createdAt, updatedAt: i.updatedAt,
});

// Upcoming interviews (soonest first) and the last month's (most recent first)
interviewRoutes.get('/', route(async (req, res) => {
  const now = new Date();
  const userId = req.user!.id;
  const [upcoming, recent] = await Promise.all([
    db.userInterview.findMany({ where: { userId, startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: MAX_LIST }),
    db.userInterview.findMany({ where: { userId, startsAt: { lt: now, gte: new Date(now.getTime() - RECENT_DAYS * DAY_MS) } }, orderBy: { startsAt: 'desc' }, take: MAX_LIST }),
  ]);
  res.json({ userId, upcoming: upcoming.map(publicInterview), recent: recent.map(publicInterview) });
}));

interviewRoutes.put('/:clientId', route(async (req, res) => {
  const userId = req.user!.id;
  const clientId = clientIdOf(req);
  const input = interviewInput.parse(req.body);
  const existing = await db.userInterview.findUnique({ where: { userId_clientId: { userId, clientId } } });
  // A new time means new reminders
  const moved = existing && existing.startsAt.getTime() !== input.startsAt.getTime();
  const saved = await db.userInterview.upsert({
    where: { userId_clientId: { userId, clientId } },
    create: { userId, clientId, ...input },
    update: { ...input, ...(moved ? { remindedDayAt: null, remindedSoonAt: null } : {}) },
  });
  res.json({ interview: publicInterview(saved) });
}));

interviewRoutes.delete('/:clientId', route(async (req, res) => {
  await db.userInterview.deleteMany({ where: { userId: req.user!.id, clientId: clientIdOf(req) } });
  res.json({ ok: true });
}));
