import { Router } from 'express';
import { requireUser } from '../auth.js';
import { dashboardFor } from '../dashboard.js';
import { route } from '../http.js';

// The website's account dashboard, in one request (see dashboard.ts)
export const dashboardRoutes = Router();
dashboardRoutes.use(requireUser);

dashboardRoutes.get('/dashboard', route(async (req, res) => {
  res.json(await dashboardFor(req.user!));
}));
