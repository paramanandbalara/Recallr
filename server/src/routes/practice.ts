import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { route } from '../http.js';

// Mock interview results: scores and speaking feedback (never the recording). They show the user's progress
// on the website, and their coach's view if they joined through a college or bootcamp.
export const practiceRoutes = Router();
practiceRoutes.use(requireUser);

const answer = z.object({
  question: z.string().max(1000),
  score: z.number().min(0).max(10).nullable(),
  wordsPerMinute: z.number().min(0).max(400).nullable(),
  fillers: z.number().int().min(0).max(1000),
  seconds: z.number().min(0).max(3600),
});

const sessionInput = z.object({
  role: z.string().trim().max(200).default(''),
  answers: z.array(answer).min(1).max(50),
});

const average = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null;
};

practiceRoutes.post('/', route(async (req, res) => {
  const input = sessionInput.parse(req.body);
  const minutes = input.answers.reduce((sum, a) => sum + a.seconds, 0) / 60;
  const fillers = input.answers.reduce((sum, a) => sum + a.fillers, 0);
  const session = await db.practiceSession.create({
    data: {
      userId: req.user!.id,
      role: input.role,
      questionCount: input.answers.length,
      averageScore: average(input.answers.map(a => a.score)),
      wordsPerMinute: average(input.answers.map(a => a.wordsPerMinute)),
      fillersPerMinute: minutes > 0 ? Math.round((fillers / minutes) * 10) / 10 : null,
      details: input.answers,
    },
  });
  res.status(201).json({ session });
}));

practiceRoutes.get('/', route(async (req, res) => {
  const sessions = await db.practiceSession.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ sessions });
}));
