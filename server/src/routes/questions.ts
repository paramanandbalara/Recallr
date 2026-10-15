import { Router } from 'express';
import type { Prisma, QuestionCategory } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AiGateway } from '../ai.js';
import { audit } from '../audit.js';
import { requireAdmin, requireDevice, requireUser } from '../auth.js';
import { db } from '../db.js';
import { clearPageCache } from '../seo.js';
import { HttpError, route } from '../http.js';
import { CATEGORY_FROM_KIND, CATEGORY_PAGES, categoryFromSlug, cleanQuestion, isRealQuestion, questionHash, slugify } from '../questions.js';

const CATEGORIES = Object.keys(CATEGORY_PAGES) as [QuestionCategory, ...QuestionCategory[]];

// Adds a question to the bank, or counts it again if it's already there
const recordQuestion = async (text: string, category: QuestionCategory) => {
  const textHash = questionHash(text);
  return db.question.upsert({
    where: { textHash },
    create: { text, textHash, category },
    update: { timesAsked: { increment: 1 }, lastAskedAt: new Date() },
  });
};

// ---------- The user's own questions and answers ----------

export const questionRoutes = Router();
questionRoutes.use(requireUser);

const recordInput = z.object({
  items: z.array(z.object({
    question: z.string().max(2000),
    answer: z.string().max(20_000).default(''),
    kind: z.string().max(20).default('other'),
    source: z.enum(['ai', 'prepared']).default('ai'),
    provider: z.string().max(20).default(''),
  })).min(1).max(20),
});

// The app sends each answered question once. The question always goes into the bank (with no one's name on
// it); the answer is kept on the user's account only while "Save my questions and answers" is on.
questionRoutes.post('/record', requireDevice, route(async (req, res) => {
  const { items } = recordInput.parse(req.body);
  let saved = 0;
  for (const item of items) {
    const text = cleanQuestion(item.question);
    if (!isRealQuestion(text)) continue;
    const category = CATEGORY_FROM_KIND[item.kind] ?? 'OTHER';
    const question = await recordQuestion(text, category);
    if (req.user!.saveAnswers && item.answer.trim()) {
      await db.savedAnswer.create({
        data: {
          userId: req.user!.id, questionId: question.id, questionText: text, category, answer: item.answer.trim(),
          source: item.source === 'prepared' ? 'PREPARED' : 'AI', provider: item.provider,
        },
      });
      saved++;
    }
  }
  res.json({ saved });
}));

questionRoutes.get('/mine', route(async (req, res) => {
  const query = z.object({
    category: z.enum(CATEGORIES).optional(),
    q: z.string().trim().max(200).optional(),
    before: z.string().max(40).optional(), // "Load more": the oldest id shown
  }).parse(req.query);
  const where: Prisma.SavedAnswerWhereInput = {
    userId: req.user!.id,
    ...(query.category ? { category: query.category } : {}),
    ...(query.q ? { OR: [{ questionText: { contains: query.q } }, { answer: { contains: query.q } }] } : {}),
  };
  const cursor = query.before ? await db.savedAnswer.findFirst({ where: { id: query.before, userId: req.user!.id } }) : null;
  const answers = await db.savedAnswer.findMany({
    where: { ...where, ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const counts = await db.savedAnswer.groupBy({ by: ['category'], where: { userId: req.user!.id }, _count: { _all: true } });
  const byCategory = Object.fromEntries(counts.map(c => [c.category, c._count._all]));
  res.json({
    answers: answers.map(a => ({
      id: a.id, question: a.questionText, category: a.category, answer: a.answer, source: a.source, provider: a.provider, createdAt: a.createdAt,
    })),
    byCategory,
    saveAnswers: req.user!.saveAnswers,
  });
}));

questionRoutes.delete('/mine/:id', route(async (req, res) => {
  const { count } = await db.savedAnswer.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (!count) throw new HttpError(404, 'Not found.');
  res.json({ ok: true });
}));

questionRoutes.delete('/mine', route(async (req, res) => {
  const { count } = await db.savedAnswer.deleteMany({ where: { userId: req.user!.id } });
  res.json({ deleted: count });
}));

// ---------- The website's question pages ----------

export const publicQuestionRoutes = Router();

const publicQuestion = (q: { slug: string | null; text: string; category: QuestionCategory; timesAsked: number }) => ({
  slug: q.slug, text: q.text, category: q.category, categorySlug: CATEGORY_PAGES[q.category].slug, timesAsked: q.timesAsked,
});

// Categories with how many published questions each has, and the most asked questions (or one category's)
publicQuestionRoutes.get('/', route(async (req, res) => {
  const query = z.object({ category: z.string().max(40).optional(), q: z.string().trim().max(200).optional() }).parse(req.query);
  const category = query.category ? categoryFromSlug(query.category) : undefined;
  if (query.category && !category) throw new HttpError(404, 'No such category.');
  const counts = await db.question.groupBy({ by: ['category'], where: { published: true }, _count: { _all: true } });
  const questions = await db.question.findMany({
    where: { published: true, ...(category ? { category } : {}), ...(query.q ? { text: { contains: query.q } } : {}) },
    orderBy: [{ timesAsked: 'desc' }, { createdAt: 'asc' }],
    take: category || query.q ? 200 : 60,
  });
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    categories: CATEGORIES.map(c => ({ category: c, ...CATEGORY_PAGES[c], count: counts.find(x => x.category === c)?._count._all ?? 0 })),
    questions: questions.map(publicQuestion),
  });
}));

publicQuestionRoutes.get('/:slug', route(async (req, res) => {
  const question = await db.question.findFirst({ where: { slug: req.params.slug, published: true } });
  if (!question) throw new HttpError(404, 'Question not found.');
  const related = await db.question.findMany({
    where: { published: true, category: question.category, id: { not: question.id } },
    orderBy: { timesAsked: 'desc' }, take: 6,
  });
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    question: { ...publicQuestion(question), guide: question.guide ?? '', updatedAt: question.updatedAt },
    categoryPage: CATEGORY_PAGES[question.category],
    related: related.map(publicQuestion),
  });
}));

// ---------- Admin: review, write the guide, publish ----------

const GUIDE_PROMPT = `You write short, practical guides for job seekers on how to answer one interview question well.
Write for anyone (no particular candidate, company or resume). Plain text with these sections, each starting with "## ":
## What the interviewer wants to learn
## How to structure your answer
## Example answer
## Mistakes to avoid
Use short paragraphs and "- " bullet points. The example answer is spoken, natural and about 120 words; use an invented,
clearly generic situation. For coding questions, explain the approach and complexity, and include a short code block.
No preamble and no closing remarks.`;

const draftLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: () => !!process.env.VITEST });

export const adminQuestionRoutes = (ai: AiGateway) => {
  const router = Router();
  router.use(requireUser, requireAdmin);

  router.get('/questions', route(async (req, res) => {
    const query = z.object({
      category: z.enum(CATEGORIES).optional(),
      status: z.enum(['all', 'published', 'unpublished']).default('all'),
      q: z.string().trim().max(200).optional(),
      sort: z.enum(['popular', 'recent']).default('popular'),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }).parse(req.query);
    const where: Prisma.QuestionWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.status === 'all' ? {} : { published: query.status === 'published' }),
      ...(query.q ? { text: { contains: query.q } } : {}),
    };
    const [total, questions] = await Promise.all([
      db.question.count({ where }),
      db.question.findMany({
        where, skip: (query.page - 1) * 50, take: 50,
        orderBy: query.sort === 'popular' ? [{ timesAsked: 'desc' }, { lastAskedAt: 'desc' }] : [{ lastAskedAt: 'desc' }],
        include: { _count: { select: { answers: true } } },
      }),
    ]);
    res.json({ total, questions: questions.map(({ _count, ...q }) => ({ ...q, savedAnswers: _count.answers })) });
  }));

  router.patch('/questions/:id', route(async (req, res) => {
    const input = z.object({
      text: z.string().trim().min(12).max(500).optional(),
      category: z.enum(CATEGORIES).optional(),
      guide: z.string().max(20_000).optional(),
      published: z.boolean().optional(),
      slug: z.string().trim().max(90).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and dashes.').optional(),
    }).parse(req.body);
    const question = await db.question.findUnique({ where: { id: req.params.id } });
    if (!question) throw new HttpError(404, 'Question not found.');
    const data: Prisma.QuestionUpdateInput = { ...input };
    if (input.text && input.text !== question.text) {
      data.textHash = questionHash(input.text);
      if (await db.question.findFirst({ where: { textHash: data.textHash, id: { not: question.id } } })) {
        throw new HttpError(409, 'That question is already in the bank.');
      }
    }
    if (input.published && !(input.guide ?? question.guide)?.trim()) throw new HttpError(400, 'Write the guide before publishing.');
    // Published questions need an address; it stays the same afterwards so links keep working
    let slug = input.slug ?? question.slug ?? (input.published ? slugify(input.text ?? question.text) : undefined);
    if (slug && slug !== question.slug && await db.question.findFirst({ where: { slug, id: { not: question.id } } })) {
      if (input.slug) throw new HttpError(409, 'Another question has that address.');
      slug = `${slug}-${question.id.slice(-5)}`;
    }
    if (slug) data.slug = slug;
    const updated = await db.question.update({ where: { id: question.id }, data });
    await audit(req, input.published === undefined ? 'question.update' : input.published ? 'question.publish' : 'question.unpublish', updated.text);
    clearPageCache(); // Search engines see the change straight away
    res.json({ question: updated });
  }));

  // A first draft of the guide, for the admin to check and edit before publishing
  router.post('/questions/:id/draft-guide', draftLimiter, route(async (req, res) => {
    const question = await db.question.findUnique({ where: { id: req.params.id } });
    if (!question) throw new HttpError(404, 'Question not found.');
    const result = await ai.streamChat({
      tier: 'quality', system: GUIDE_PROMPT, maxTokens: 2500,
      user: `Interview question (${CATEGORY_PAGES[question.category].title}): ${question.text}`,
    }, () => {}, new AbortController().signal);
    res.json({ guide: result.text.trim() });
  }));

  router.delete('/questions/:id', route(async (req, res) => {
    const question = await db.question.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!question) throw new HttpError(404, 'Question not found.');
    await audit(req, 'question.delete', question.text);
    clearPageCache();
    res.json({ ok: true });
  }));

  return router;
};
