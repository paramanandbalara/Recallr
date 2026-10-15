import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AiGateway } from '../ai.js';
import { requireUser } from '../auth.js';
import { DAILY_PROMPT, ensureDailyQuestion, istDay, lastDays, parseFeedback, practiceDays, readFeedback, streakFrom } from '../daily.js';
import { db } from '../db.js';
import { purchaseFor, recordUsageAfter } from '../entitlements.js';
import { HttpError, route } from '../http.js';

// The question of the day (see daily.ts), for the app and the website's Account → Daily practice

const answerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => req.user!.id, skip: () => !!process.env.VITEST,
});

const shape = (answer: { answer: string; score: number | null; feedback: string | null; updatedAt: Date } | null) =>
  answer ? { answer: answer.answer, score: answer.score, feedback: readFeedback(answer.feedback), updatedAt: answer.updatedAt } : null;

export const dailyRoutes = (ai: AiGateway) => {
  const router = Router();
  router.use(requireUser);

  // Today's question, my answer to it, my streak and the last 14 days
  router.get('/', route(async (req, res) => {
    const now = new Date();
    const today = istDay(now);
    const days = lastDays(today, 14);
    const [question, done, past] = await Promise.all([
      ensureDailyQuestion(ai, now),
      practiceDays(req.user!.id, lastDays(today, 401)[0]),
      db.dailyQuestion.findMany({
        where: { date: { gte: days[0], lt: today } }, orderBy: { date: 'desc' },
        include: { answers: { where: { userId: req.user!.id }, select: { score: true } } },
      }),
    ]);
    const answer = question
      ? await db.dailyAnswer.findUnique({ where: { userId_dailyQuestionId: { userId: req.user!.id, dailyQuestionId: question.id } } })
      : null;
    res.json({
      question: question && { id: question.id, date: question.date, text: question.text, category: question.category },
      answer: shape(answer),
      streak: streakFrom(done, today),
      days: days.map(date => ({ date, done: done.has(date) })),
      history: past.map(q => ({ date: q.date, text: q.text, category: q.category, answered: q.answers.length > 0, score: q.answers[0]?.score ?? null })),
    });
  }));

  // Answer today's question (again: "Try again" replaces the answer). The feedback counts on the plan.
  router.post('/answer', answerLimiter, route(async (req, res) => {
    const input = z.object({
      answer: z.string().trim().min(1, 'Write or say your answer first.').max(6000, 'Keep the answer under 6000 characters.'),
      questionId: z.string().max(40).optional(), // The question the user saw: a new day may have started since
    }).parse(req.body);
    const userId = req.user!.id;
    const question = await ensureDailyQuestion(ai);
    if (!question) throw new HttpError(503, "Today's question is being prepared. Try again in a minute.");
    if (input.questionId && input.questionId !== question.id) throw new HttpError(409, "A new day has started: here's today's question.", 'NEW_DAY');
    const purchase = await purchaseFor(userId, 'CHAT');
    let result;
    try {
      result = await ai.streamChat({
        tier: 'quality', system: DAILY_PROMPT, json: true, temperature: 0.3, maxTokens: 2000,
        user: `Question: ${question.text}\n\nThe candidate's answer: ${input.answer}`,
      }, () => {}, new AbortController().signal);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Daily answer feedback failed:', error);
      throw new HttpError(502, 'The AI is having problems right now. Try again in a moment.');
    }
    recordUsageAfter({
      userId, purchaseId: purchase.id, kind: 'CHAT', provider: result.provider, model: result.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
    });
    const { score, feedback } = parseFeedback(result);
    const data = { answer: input.answer, score, feedback: JSON.stringify(feedback) };
    const saved = await db.dailyAnswer.upsert({
      where: { userId_dailyQuestionId: { userId, dailyQuestionId: question.id } },
      create: { userId, dailyQuestionId: question.id, ...data },
      update: data,
    });
    const today = istDay(new Date());
    const done = await practiceDays(userId, lastDays(today, 401)[0]);
    res.json({ answer: shape(saved), streak: streakFrom(done, today) });
  }));

  return router;
};
