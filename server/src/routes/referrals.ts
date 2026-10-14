import { Router } from 'express';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { publicUrl } from '../env.js';
import { route } from '../http.js';
import { getSettings, numberSetting } from '../settings.js';
import { ensureReferralCode } from './auth.js';

export const referralRoutes = Router();
referralRoutes.use(requireUser);

// The user's invite link, and who joined with it
referralRoutes.get('/', route(async (req, res) => {
  const code = await ensureReferralCode(req.user!.id);
  const s = await getSettings();
  const invited = await db.user.findMany({
    where: { referredById: req.user!.id }, orderBy: { createdAt: 'desc' },
    select: { name: true, createdAt: true, referralRewardedAt: true },
  });
  res.json({
    code,
    link: `${publicUrl}/register?ref=${code}`,
    bonus: { minutes: numberSetting(s, 'referralBonusMinutes'), days: numberSetting(s, 'referralBonusDays') },
    // Only first names, for privacy
    invited: invited.map(u => ({ name: u.name.split(' ')[0], joinedAt: u.createdAt, rewarded: !!u.referralRewardedAt })),
  });
}));
