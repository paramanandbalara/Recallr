import { Router } from 'express';
import { db } from '../db.js';
import { route } from '../http.js';

export const planRoutes = Router();

// The plans on sale, for the website
planRoutes.get('/', route(async (_req, res) => {
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { pricePaise: 'asc' }] });
  res.json({ plans });
}));
