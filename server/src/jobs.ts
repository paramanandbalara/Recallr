import { db } from './db.js';
import { emails } from './emails.js';
import { queueEmail } from './mailer.js';

// Background work, every 30 minutes on each server. Each email is claimed in the database first,
// so several servers never send it twice.

const EVERY_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// "Your plan ends in 2 days", once per user: for their last-ending pack, if it's not a trial
export const sendEndingSoonEmails = async (now = new Date()) => {
  const ending = await db.purchase.findMany({
    where: { notifiedEnding: false, source: { notIn: ['TRIAL', 'REFERRAL'] }, expiresAt: { gt: now, lte: new Date(now.getTime() + 2 * DAY_MS) } },
    include: { user: true },
  });
  let sent = 0;
  for (const pack of ending) {
    const later = await db.purchase.count({ where: { userId: pack.userId, expiresAt: { gt: pack.expiresAt } } });
    const { count } = await db.purchase.updateMany({ where: { id: pack.id, notifiedEnding: false }, data: { notifiedEnding: true } });
    if (!count || later || pack.user.status !== 'ACTIVE') continue; // Another pack goes on longer: nothing ends yet
    queueEmail(await emails.planEnding(pack.user, pack.planName, pack.expiresAt), 'plan_ending', pack.userId);
    sent++;
  }
  return sent;
};

export const startJobs = () => {
  const run = () => sendEndingSoonEmails().catch(error => console.error('Job failed:', error));
  setTimeout(run, 60_000).unref();
  setInterval(run, EVERY_MS).unref();
};
