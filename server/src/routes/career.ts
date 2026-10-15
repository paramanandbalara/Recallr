import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { CareerReportKind } from '@prisma/client';
import { requireUser } from '../auth.js';
import type { AiGateway } from '../ai.js';
import {
  buildCoverLetter, buildInterviewer, buildLinkedIn, buildResumeRewrite, buildResumeScore, coverLetterPrompt, extractFileText,
  fileHintsSchema, interviewerPrompt, isLinkedInLink, jobTitleOf, LIMITS, LINKEDIN_LINK_MESSAGE, linkedInPrompt, parseAiJson,
  resumeChecks, resumeRewritePrompt, resumeScorePrompt, TONES,
} from '../career.js';
import { db } from '../db.js';
import { purchaseFor, recordUsageAfter } from '../entitlements.js';
import { HttpError, route } from '../http.js';

// Career tools for the website account and the desktop app (any signed-in token, no device needed).
// Each run is one or two "quality" AI calls (the best model; the gateway falls back to the next provider
// on errors), counted against the user's plan, and saved as a CareerReport so it shows in the history.
// Nothing here is on the live-answer path, and nothing is fetched from the web (LinkedIn text is pasted or uploaded).

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.fileBytes, files: 1, fields: 20, fieldSize: 200_000 } });

// A file in the "file" field (multipart) → its text in req.body[field], and its layout hints in req.body.fileHints
const fileInto = (field: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.is('multipart/form-data')) return next();
  upload.single('file')(req, res, error => {
    if (error) {
      return next(error instanceof multer.MulterError
        ? error.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, 'The file is too big. The limit is 5 MB.', 'FILE_TOO_BIG') : new HttpError(400, 'Send one file in the “file” field.')
        : error);
    }
    if (!req.file) return next();
    extractFileText(req.file.buffer, req.file.originalname, req.file.mimetype).then(({ text, hints }) => {
      req.body[field] = text;
      req.body.fileHints = hints;
      next();
    }, next);
  });
};

const text = (min: number, max: number, what: string) =>
  z.string({ required_error: `Add ${what}.` }).trim().min(min, `${what[0].toUpperCase()}${what.slice(1)} looks too short.`).max(max, `${what[0].toUpperCase()}${what.slice(1)} is too long.`);
const optional = (max: number) => z.string().trim().max(max).optional().transform(v => v || undefined);
// Checked before anything else about the text, so a pasted link gets the helpful message
const noLinkedInLink = (field: string) => (req: Request, _res: Response, next: NextFunction) => {
  const value: unknown = req.body?.[field];
  next(typeof value === 'string' && isLinkedInLink(value) ? new HttpError(400, LINKEDIN_LINK_MESSAGE, 'LINKEDIN_LINK') : undefined);
};
const hints = z.preprocess(v => (v && typeof v === 'object' ? v : undefined), fileHintsSchema.optional());

const schemas = {
  resumeScore: z.object({ resumeText: text(200, LIMITS.resume, 'your resume'), targetRole: optional(200), jobDescription: optional(LIMITS.job), fileHints: hints }),
  resumeRewrite: z.object({ resumeText: text(200, LIMITS.resume, 'your resume'), jobDescription: text(80, LIMITS.job, 'the job description') }),
  linkedIn: z.object({
    profileText: text(150, LIMITS.profile, 'your LinkedIn profile'),
    targetRole: optional(200),
  }),
  coverLetter: z.object({
    resumeText: text(200, LIMITS.resume, 'your resume'), jobDescription: text(80, LIMITS.job, 'the job description'),
    company: optional(120), tone: z.enum(TONES).optional(),
  }),
  interviewer: z.object({
    interviewerText: text(80, LIMITS.profile, "the interviewer's profile"),
    resumeText: optional(LIMITS.resume), jobDescription: optional(LIMITS.job),
  }),
};

// A tool can run for over a minute. Past 25 s a space is sent every 20 s (allowed before JSON), so a proxy
// that closes quiet connections (Nginx's 60 s default) doesn't cut it off. The status is 200 by then, so an
// error after that comes as {"error", "code", "status"} in the body.
export const slowJson = (handler: (req: Request) => Promise<object>, { after = 25_000, every = 20_000 } = {}) =>
  (req: Request, res: Response, next: NextFunction) => {
    const tick = () => {
      if (!res.headersSent) {
        res.status(200).type('application/json').setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();
      }
      res.write(' ');
      timer = setTimeout(tick, every);
    };
    let timer = setTimeout(tick, after);
    handler(req).then(body => {
      clearTimeout(timer);
      if (res.headersSent) res.end(JSON.stringify(body));
      else res.json(body);
    }, error => {
      clearTimeout(timer);
      if (!res.headersSent) return next(error);
      if (!(error instanceof HttpError)) console.error(error);
      res.end(JSON.stringify(error instanceof HttpError
        ? { error: error.message, code: error.code, status: error.status }
        : { error: 'Something went wrong. Try again in a moment.', status: 500 }));
    });
  };

const KINDS: CareerReportKind[] = ['RESUME_SCORE', 'RESUME_REWRITE', 'LINKEDIN_REVIEW', 'COVER_LETTER', 'INTERVIEWER_INSIGHTS', 'SALARY_PRACTICE'];

const summaryOf = (r: { id: string; kind: CareerReportKind; title: string; score: number | null; model: string; createdAt: Date }) =>
  ({ id: r.id, kind: r.kind, title: r.title, score: r.score, model: r.model, createdAt: r.createdAt });

const parseStored = (value: string | null) => {
  if (value === null) return null;
  try { return JSON.parse(value) as unknown; } catch { return value; }
};

// For "Download my data"
export const exportCareerReports = async (userId: string) =>
  (await db.careerReport.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }))
    .map(r => ({ kind: r.kind, title: r.title, score: r.score, model: r.model, createdAt: r.createdAt, input: parseStored(r.input), result: parseStored(r.result) }));

export const careerRoutes = (ai: AiGateway) => {
  const router = Router();
  router.use(requireUser);

  const running = new Set<string>(); // One tool at a time per user

  // Runs the AI for a tool: checks the plan first, records the usage of every call, and asks once more if
  // the reply couldn't be read (an answer cut off or not JSON)
  const runTool = async <T>(userId: string, prompt: { system: string; user: string }, options: { maxTokens: number; temperature: number }, build: (raw: Record<string, unknown>) => T) => {
    const purchase = await purchaseFor(userId, 'CHAT');
    if (running.has(userId)) throw new HttpError(429, 'One of your career tools is still working. Wait for it to finish.', 'BUSY');
    running.add(userId);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        // Not cancelled when the page closes: the result is saved, so it's in the history
        const result = await ai.streamChat({ tier: 'quality', json: true, ...prompt, ...options }, () => {}, new AbortController().signal);
        recordUsageAfter({
          userId, purchaseId: purchase.id, kind: 'CHAT', provider: result.provider, model: result.model,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        });
        try {
          return { data: build(parseAiJson(result.text)), model: result.model };
        } catch (error) {
          console.error('Career tool reply could not be read:', error);
        }
      }
      throw new HttpError(502, "The AI's answer came back incomplete. Please try again.", 'BAD_REPLY');
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Career tool error:', error);
      throw new HttpError(503, 'The AI is having problems right now. Try again in a minute.', 'AI_ERROR');
    } finally {
      running.delete(userId);
    }
  };

  const save = async (userId: string, kind: CareerReportKind, report: { title: string; input: object; result: object; score: number | null; model: string }) => {
    const saved = await db.careerReport.create({
      data: { userId, kind, title: report.title.slice(0, 200), input: JSON.stringify(report.input), result: JSON.stringify(report.result), score: report.score, model: report.model.slice(0, 80) },
    });
    return { ...summaryOf(saved), result: report.result };
  };

  // The text of an uploaded resume or LinkedIn PDF, to check before running a tool (no AI, not counted)
  router.post('/extract-text', fileInto('text'), route(async (req, res) => {
    if (typeof req.body?.text !== 'string') throw new HttpError(400, 'Choose a PDF or Word (.docx) file.');
    res.json({ text: req.body.text, fileHints: req.body.fileHints, words: req.body.text.split(/\s+/).filter(Boolean).length });
  }));

  router.post('/resume-score', fileInto('resumeText'), slowJson(async req => {
    const input = schemas.resumeScore.parse(req.body);
    const fileHints = input.fileHints ?? null;
    const checks = resumeChecks(input.resumeText, fileHints);
    const { data, model } = await runTool(req.user!.id, resumeScorePrompt(input, checks), { maxTokens: 8000, temperature: 0.2 },
      raw => buildResumeScore(raw, input, checks, fileHints));
    const role = input.targetRole || jobTitleOf(input.jobDescription) || data.detectedRole;
    return { report: await save(req.user!.id, 'RESUME_SCORE', { title: role ? `Resume score: ${role}` : 'Resume score', input, result: data, score: data.overall, model }) };
  }));

  router.post('/resume-rewrite', fileInto('resumeText'), slowJson(async req => {
    const input = schemas.resumeRewrite.parse(req.body);
    const { data, model } = await runTool(req.user!.id, resumeRewritePrompt(input), { maxTokens: 12_000, temperature: 0.3 },
      raw => buildResumeRewrite(raw, input));
    const job = jobTitleOf(input.jobDescription);
    return { report: await save(req.user!.id, 'RESUME_REWRITE', { title: job ? `Resume for: ${job}` : 'Tailored resume', input, result: data, score: data.match, model }) };
  }));

  router.post('/linkedin-review', fileInto('profileText'), noLinkedInLink('profileText'), slowJson(async req => {
    const input = schemas.linkedIn.parse(req.body);
    const { data, model } = await runTool(req.user!.id, linkedInPrompt(input), { maxTokens: 8000, temperature: 0.4 },
      raw => buildLinkedIn(raw, input));
    return { report: await save(req.user!.id, 'LINKEDIN_REVIEW', { title: 'LinkedIn review', input, result: data, score: data.score, model }) };
  }));

  router.post('/cover-letter', fileInto('resumeText'), slowJson(async req => {
    const input = schemas.coverLetter.parse(req.body);
    const { data, model } = await runTool(req.user!.id, coverLetterPrompt(input), { maxTokens: 5000, temperature: 0.6 },
      raw => buildCoverLetter(raw, input));
    const job = input.company || jobTitleOf(input.jobDescription);
    return { report: await save(req.user!.id, 'COVER_LETTER', { title: job ? `Cover letter: ${job}` : 'Cover letter', input, result: data, score: null, model }) };
  }));

  router.post('/interviewer-insights', fileInto('interviewerText'), noLinkedInLink('interviewerText'), slowJson(async req => {
    const input = schemas.interviewer.parse(req.body);
    const { data, model } = await runTool(req.user!.id, interviewerPrompt(input), { maxTokens: 8000, temperature: 0.4 },
      raw => buildInterviewer(raw));
    const who = [data.who.name, data.who.role].filter(Boolean).join(', ');
    return { report: await save(req.user!.id, 'INTERVIEWER_INSIGHTS', { title: who ? `Interviewer: ${who}` : 'Interviewer insights', input, result: data, score: null, model }) };
  }));

  // ---------- History ----------

  router.get('/reports', route(async (req, res) => {
    const query = z.object({
      kind: z.enum(KINDS as [CareerReportKind, ...CareerReportKind[]]).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    const where = { userId: req.user!.id, ...(query.kind ? { kind: query.kind } : {}) };
    const [reports, total] = await Promise.all([
      db.careerReport.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit,
        select: { id: true, kind: true, title: true, score: true, model: true, createdAt: true },
      }),
      db.careerReport.count({ where }),
    ]);
    res.json({ reports, total, page: query.page, pages: Math.max(1, Math.ceil(total / query.limit)) });
  }));

  router.get('/reports/:id', route(async (req, res) => {
    const report = await db.careerReport.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!report) throw new HttpError(404, 'That report was not found.');
    res.json({ report: { ...summaryOf(report), input: parseStored(report.input), result: parseStored(report.result) } });
  }));

  router.delete('/reports/:id', route(async (req, res) => {
    const { count } = await db.careerReport.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!count) throw new HttpError(404, 'That report was not found.');
    res.json({ ok: true });
  }));

  return router;
};
