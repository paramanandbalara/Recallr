import { Router } from 'express';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { publicUrl } from '../env.js';
import { route } from '../http.js';
import { getSettings, numberSetting } from '../settings.js';
import { ensureReferralCode } from './auth.js';
import { leaderboardFor, monthLabel, monthStart } from '../leaderboard.js';

export const referralRoutes = Router();
referralRoutes.use(requireUser);

// The user's invite link, and who joined with it
referralRoutes.get('/', route(async (req, res) => {
  const code = await ensureReferralCode(req.user!.id);
  const s = await getSettings();
  const [invited, ambassador] = await Promise.all([
    db.user.findMany({
      where: { referredById: req.user!.id }, orderBy: { createdAt: 'desc' },
      select: { name: true, createdAt: true, referralRewardedAt: true },
    }),
    db.ambassador.findUnique({ where: { userId: req.user!.id }, select: { status: true, college: true } }),
  ]);
  res.json({
    code,
    link: `${publicUrl}/register?ref=${code}`,
    bonus: { minutes: numberSetting(s, 'referralBonusMinutes'), days: numberSetting(s, 'referralBonusDays') },
    // An approved college ambassador gets this for each paying friend instead (the friend still gets `bonus`)
    ambassador: ambassador ? { ...ambassador, bonusMinutes: numberSetting(s, 'ambassadorBonusMinutes') } : null,
    // Only first names, for privacy
    invited: invited.map(u => ({ name: u.name.split(' ')[0], joinedAt: u.createdAt, rewarded: !!u.referralRewardedAt })),
  });
}));

// Who brought the most paying friends this month and ever: short names only (never emails), and the user's own place
referralRoutes.get('/leaderboard', route(async (req, res) => {
  const [month, allTime] = await Promise.all([leaderboardFor(req.user!.id, monthStart()), leaderboardFor(req.user!.id, null)]);
  res.set('Cache-Control', 'private, max-age=60');
  res.json({ month: { label: monthLabel(), ...month }, allTime });
}));
