import { createAiFromSettings, type AiGateway } from './ai.js';
import { postDailyBlog } from './blog.js';
import { createDailyQuestion } from './daily.js';
import { cleanupPeerRooms } from './routes/peer.js';
import { sendDailyQuestionMessages, sendInterviewReminders } from './whatsapp.js';
import { db } from './db.js';
import { emails } from './emails.js';
import { getSettings } from './settings.js';
import { queueEmail } from './mailer.js';
import { isWeeklyEmailTime, unsubscribeUrl, weeklyTip, weekStats } from './weekly.js';

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

// The Monday email with practice progress and one tip, once a week, to people who used Recallr in the last month
export const sendWeeklyEmails = async (now = new Date()) => {
  if (!isWeeklyEmailTime(now)) return 0;
  const monthAgo = new Date(now.getTime() - 28 * DAY_MS);
  const sixDaysAgo = new Date(now.getTime() - 6 * DAY_MS);
  const users = await db.user.findMany({
    where: {
      status: 'ACTIVE', weeklyEmail: true,
      OR: [{ lastWeeklyEmailAt: null }, { lastWeeklyEmailAt: { lt: sixDaysAgo } }],
      AND: [{ OR: [{ lastSeenAt: { gte: monthAgo } }, { practiceSessions: { some: { createdAt: { gte: monthAgo } } } }] }],
    },
    take: 500,
  });
  let sent = 0;
  for (const user of users) {
    // Claim it first, so two servers never both send it
    const { count } = await db.user.updateMany({
      where: { id: user.id, OR: [{ lastWeeklyEmailAt: null }, { lastWeeklyEmailAt: { lt: sixDaysAgo } }] },
      data: { lastWeeklyEmailAt: now },
    });
    if (!count) continue;
    const stats = await weekStats(user.id, now);
    queueEmail(await emails.weeklyProgress(user, stats, weeklyTip(stats), unsubscribeUrl(user)), 'weekly_progress', user.id);
    sent++;
  }
  return sent;
};

export const startJobs = (ai: AiGateway = createAiFromSettings(getSettings)) => {
  const run = () => {
    void postDailyBlog(ai); // The day's AI blog post (logs its own failures)
    // The question of the day (from 00:05 India time), then its WhatsApp messages (from 09:00)
    void createDailyQuestion(ai).then(() => sendDailyQuestionMessages()).catch(error => console.error('Daily question job failed:', error));
    void cleanupPeerRooms().catch(error => console.error('Peer room cleanup failed:', error));
    return Promise.all([sendEndingSoonEmails(), sendWeeklyEmails()]).catch(error => console.error('Job failed:', error));
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, EVERY_MS).unref();
  // WhatsApp interview reminders (the evening before, and about an hour before) are checked more often
  setInterval(() => { sendInterviewReminders().catch(error => console.error('WhatsApp reminders failed:', error)); }, 5 * 60 * 1000).unref();
};
