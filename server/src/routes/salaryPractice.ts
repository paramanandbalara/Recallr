import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { route } from '../http.js';

// Salary negotiation practice from the desktop app: the setup and the coach's verdict, kept on the account as a
// career report (kind SALARY_PRACTICE). The AI calls themselves go through /api/ai/chat and count against the plan.
export const salaryPracticeRoutes = Router();
salaryPracticeRoutes.use(requireUser);

const text = (max: number) => z.string().trim().max(max).default('');

const setupInput = z.object({
  role: text(200),
  city: text(100),
  market: z.enum(['india', 'global']).default('india'),
  currency: text(10),
  currentCtc: text(60),
  offer: text(60),
  target: text(60),
  noticePeriod: text(60),
  otherOffers: text(500),
});

const resultInput = z.object({
  score: z.number().int().min(0).max(10),
  verdict: text(1000),
  worked: z.array(z.string().max(500)).max(10).default([]),
  costMoney: z.array(z.string().max(500)).max(10).default([]),
  betterPhrasings: z.array(z.object({ instead: z.string().max(500).default(''), say: z.string().max(800) })).max(10).default([]),
  finalDeal: text(1000),
  turns: z.array(z.object({ who: z.enum(['hr', 'you']), text: z.string().max(4000) })).max(40).default([]),
});

const reportInput = z.object({ setup: setupInput, result: resultInput });

const toReport = (r: { id: string; title: string; input: string | null; result: string; score: number | null; createdAt: Date }) => {
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  return { id: r.id, title: r.title, setup: parse(r.input), result: parse(r.result), score: r.score, createdAt: r.createdAt };
};

salaryPracticeRoutes.post('/', route(async (req, res) => {
  const { setup, result } = reportInput.parse(req.body);
  const title = [setup.role || 'Salary negotiation', setup.city].filter(Boolean).join(' · ').slice(0, 200);
  const report = await db.careerReport.create({
    data: {
      userId: req.user!.id, kind: 'SALARY_PRACTICE', title, input: JSON.stringify(setup), result: JSON.stringify(result), score: result.score,
    },
  });
  res.status(201).json({ report: toReport(report) });
}));

salaryPracticeRoutes.get('/', route(async (req, res) => {
  const reports = await db.careerReport.findMany({
    where: { userId: req.user!.id, kind: 'SALARY_PRACTICE' }, orderBy: { createdAt: 'desc' }, take: 20,
  });
  res.json({ reports: reports.map(toReport) });
}));
