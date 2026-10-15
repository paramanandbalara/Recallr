import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { publicUrl } from '../env.js';
import { checkUnsubscribeToken } from '../weekly.js';
import { route } from '../http.js';
import { getSettings } from '../settings.js';

export const contentRoutes = Router();

// Messages from the admin, for the desktop app or the website
contentRoutes.get('/announcements', route(async (req, res) => {
  const where = z.enum(['desktop', 'website']).parse(req.query.for);
  const now = new Date();
  const announcements = await db.announcement.findMany({
    where: {
      active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      audience: { in: ['ALL', where === 'desktop' ? 'DESKTOP' : 'WEBSITE'] },
    },
    orderBy: { startsAt: 'desc' },
    select: { id: true, title: true, body: true, level: true, startsAt: true },
  });
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ announcements });
}));

// Which desktop versions are current and which must update
contentRoutes.get('/app/version', route(async (_req, res) => {
  const s = await getSettings();
  res.json({
    latest: s.latestAppVersion || null, minimum: s.minimumAppVersion || null, notes: s.releaseNotes,
    downloads: { windows: s.downloadUrlWindows, mac: s.downloadUrlMac },
  });
}));

// One click from the weekly email turns it off (no sign-in: the link is signed)
contentRoutes.get('/emails/weekly/off', route(async (req, res) => {
  const userId = String(req.query.u ?? '');
  const token = String(req.query.t ?? '');
  const page = (title: string, text: string) => res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;background:#020617;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:20px">${title}</h1><p style="color:#94a3b8">${text}</p>
<p><a href="${publicUrl}/account/settings" style="color:#60a5fa">Email settings</a></p></div></body>`);
  if (!userId || !checkUnsubscribeToken(userId, token)) return page('That link doesn’t work', 'You can turn the weekly email off in your account settings.');
  await db.user.updateMany({ where: { id: userId }, data: { weeklyEmail: false } });
  page('Weekly email turned off', 'You won’t get the Monday practice email any more. You can turn it back on in your account settings.');
}));
