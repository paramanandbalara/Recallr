import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
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
