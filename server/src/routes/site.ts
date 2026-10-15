import { Router } from 'express';
import { route } from '../http.js';
import { publicSettings } from '../settings.js';

export const siteRoutes = Router();

// Business name, support email and download links for the website (set in Admin → Settings)
siteRoutes.get('/', route(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(await publicSettings());
}));
