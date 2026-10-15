import { Prisma } from '@prisma/client';
import { db } from './db.js';

// Who brought the most paying friends: friends who signed up with someone's invite and made their first real
// payment (more than ₹0), counted in the month of that payment. Months follow India time.

const IST_MS = 330 * 60 * 1000;

// The first moment of this month in India
export const monthStart = (now = new Date()) => {
  const india = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), 1) - IST_MS);
};

export const monthLabel = (now = new Date()) =>
  new Date(now.getTime() + IST_MS).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// "Priya Sharma" → "Priya S.": never more of a name (and never an email) on a leaderboard
export const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts.some(p => p.includes('@'))) return 'Recallr user';
  const first = parts[0].slice(0, 20);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
};

export interface ReferrerCount {
  userId: string;
  name: string;
  email: string;
  friends: number;
  ambassador: boolean;
}

// Every referrer with at least one paying friend (since `since`, or ever), most first. Blocked and closed accounts are left out.
export const paidFriendsByReferrer = async (since: Date | null): Promise<ReferrerCount[]> => {
  const rows = await db.$queryRaw<{ userId: string; name: string; email: string; friends: bigint | number; ambassador: string | null; reachedAt: Date }[]>`
    SELECT r.id AS userId, r.name AS name, r.email AS email, COUNT(*) AS friends, MAX(p.first_paid) AS reachedAt, a.status AS ambassador
    FROM users u
    JOIN (SELECT user_id, MIN(paid_at) AS first_paid FROM payments WHERE status = 'PAID' AND amount_paise > 0 GROUP BY user_id) p ON p.user_id = u.id
    JOIN users r ON r.id = u.referred_by_id
    LEFT JOIN ambassadors a ON a.user_id = r.id
    WHERE r.status = 'ACTIVE' ${since ? Prisma.sql`AND p.first_paid >= ${since}` : Prisma.empty}
    GROUP BY r.id, r.name, r.email, a.status
    ORDER BY friends DESC, reachedAt ASC, r.id ASC`;
  return rows.map(r => ({ userId: r.userId, name: r.name, email: r.email, friends: Number(r.friends), ambassador: r.ambassador === 'APPROVED' }));
};

// Ranks shared by equal counts (2 people with 5 friends are both 1st; the next is 3rd)
const ranked = (rows: ReferrerCount[]) => rows.map(row => ({ ...row, rank: 1 + rows.filter(r => r.friends > row.friends).length }));

// For the account page: the top 10 with short names only, and where the user stands
export const leaderboardFor = async (userId: string, since: Date | null, size = 10) => {
  const rows = ranked(await paidFriendsByReferrer(since));
  const mine = rows.find(r => r.userId === userId);
  return {
    top: rows.slice(0, size).map(r => ({ rank: r.rank, name: shortName(r.name), friends: r.friends, ambassador: r.ambassador, you: r.userId === userId })),
    me: mine ? { rank: mine.rank, friends: mine.friends } : null,
    total: rows.length,
  };
};
