import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import type { PeerRoom } from '@prisma/client';
import { z } from 'zod';
import type { AiGateway } from '../ai.js';
import { requireUser } from '../auth.js';
import { parseJsonReply, replyText } from '../daily.js';
import { db } from '../db.js';
import { purchaseFor, recordUsageAfter } from '../entitlements.js';
import { publicUrl } from '../env.js';
import { HttpError, route } from '../http.js';

// Peer practice: two people interview each other on any call app (Meet, Zoom, a phone call); Recallr coordinates.
// One is the interviewer (reads the questions, rates each answer), the other the candidate (their app listens to
// their microphone and sends what they said). The AI scores each answer on the CANDIDATE's plan; their listening
// time is counted by /api/ai/transcribe as usual. A room is joined with a 6-character code, holds only its two
// members, and lasts 3 hours. Both apps (or the website, for the interviewer) poll GET /:code every 1-2 seconds;
// the ETag is the room's updatedAt, so an unchanged room costs one small query and a 304.

export type PeerRole = 'interviewer' | 'candidate';

export interface PeerQuestion {
  id: string;
  text: string;
  source: 'resume' | 'common' | 'own';
  kind?: string; // From the resume questions: project, skill...
}

export interface PeerTurn {
  id: string;
  question: string;
  askedAt: number;
  status: 'asked' | 'answering' | 'scoring' | 'scored' | 'failed' | 'skipped';
  transcript: string; // What the candidate has said so far (or typed)
  seconds?: number;   // How long the answer took
  ai?: { score: number | null; good: string; improve: string; better: string };
  aiError?: string;
  rating?: { stars: number; comment: string }; // The interviewer's own rating
}

export interface PeerState {
  hostRole: PeerRole;
  candidate: { summary: string }; // What the candidate chose to show: role, level, the job...
  questions: PeerQuestion[];
  turns: PeerTurn[]; // Asked, in order; the last one is the current question
  endedAt?: number;
  practiceSaved?: boolean;
}

export const ROOM_HOURS = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O or 1/I
const MAX_QUESTIONS = 60;
const MAX_TURNS = 40;

export const COMMON_QUESTIONS = [
  'Tell me about yourself.',
  'Walk me through a project you are proud of. What was your part in it?',
  'Tell me about a time you faced a difficult problem at work or college. How did you solve it?',
  'Tell me about a time you disagreed with someone on your team.',
  'What are your strengths, and one weakness you are working on?',
  'Why do you want this role?',
  'Tell me about a mistake you made and what you learned from it.',
  'How do you learn a new technology or skill quickly?',
  'Where do you see yourself in three years?',
  'Do you have any questions for us?',
];

const PEER_PROMPT = `You coach a candidate during a practice interview with a friend. You get the question and the speech-to-text of the
candidate's spoken answer (ignore small transcription errors and filler words). Be honest and specific, like a good human coach, not generous by default.
Return JSON only: {"score":7,"good":"...","improve":"...","better":"..."}
- "score": 1 to 10 for how well it would land in a real interview (relevance, a concrete example or evidence, clarity, length).
- "good": one or two sentences on what worked. "improve": the one or two changes that would help most.
- "better": a stronger version of THEIR answer, keeping their story and facts (never invent employers, numbers or results;
  use a placeholder like "<your project>" where a detail is missing). Natural speech, plain words, 60 to 150 words.
Write everything in plain, simple words.`;

const newCode = () => Array.from(crypto.randomBytes(6), b => CODE_CHARS[b % 32]).join('');
const newId = () => crypto.randomBytes(6).toString('base64url');

export const parseState = (text: string): PeerState => {
  const state = JSON.parse(text) as PeerState;
  state.questions ??= [];
  state.turns ??= [];
  state.candidate ??= { summary: '' };
  return state;
};

const candidateId = (room: Pick<PeerRoom, 'hostId' | 'guestId'>, state: PeerState) => (state.hostRole === 'candidate' ? room.hostId : room.guestId);
const roleOf = (room: Pick<PeerRoom, 'hostId' | 'guestId'>, state: PeerState, userId: string): PeerRole =>
  room.hostId === userId ? state.hostRole : state.hostRole === 'candidate' ? 'interviewer' : 'candidate';

const average = (values: (number | null | undefined)[]) => {
  const known = values.filter((v): v is number => typeof v === 'number');
  return known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null;
};

const cleanText = (max: number) => z.string().transform(s => s.replace(/\s+/g, ' ').trim()).pipe(z.string().max(max));

// ---------- Rate limits (per user) ----------

const limits = { standardHeaders: true, legacyHeaders: false, keyGenerator: (req: Request) => req.user!.id, skip: () => !!process.env.VITEST } as const;
const createLimiter = rateLimit({ ...limits, windowMs: 60 * 60 * 1000, limit: 20, message: { error: 'Too many practice rooms. Try again later.' } });
const joinLimiter = rateLimit({ ...limits, windowMs: 15 * 60 * 1000, limit: 30, message: { error: 'Too many tries. Check the code and try again in a few minutes.' } });
const pollLimiter = rateLimit({ ...limits, windowMs: 60 * 1000, limit: 150 });
const actionLimiter = rateLimit({ ...limits, windowMs: 10 * 60 * 1000, limit: 400 });
const scoreLimiter = rateLimit({ ...limits, windowMs: 60 * 60 * 1000, limit: 60, message: { error: 'Too many answers scored this hour. Try again later.' } });

// ---------- Reading and changing a room ----------

type Members = PeerRoom & { host: { name: string }; guest: { name: string } | null };

const view = (room: Members, userId: string) => {
  const state = parseState(room.state);
  const turns = state.turns;
  const ended = room.status === 'ENDED';
  return {
    code: room.code,
    link: `${publicUrl}/practice/join/${room.code}`,
    status: room.status,
    role: roleOf(room, state, userId),
    hostRole: state.hostRole,
    host: { name: room.host.name, me: room.hostId === userId },
    guest: room.guest ? { name: room.guest.name, me: room.guestId === userId } : null,
    candidate: state.candidate,
    questions: state.questions,
    turns,
    current: turns.length ? turns[turns.length - 1].id : null,
    expiresAt: room.expiresAt,
    updatedAt: room.updatedAt,
    summary: ended || turns.length ? {
      asked: turns.length,
      answered: turns.filter(t => t.status === 'scored' || t.status === 'failed').length,
      averageScore: average(turns.map(t => t.ai?.score)),
      averageRating: average(turns.map(t => t.rating?.stars)),
    } : null,
  };
};

const withMembers = { host: { select: { name: true } }, guest: { select: { name: true } } } as const;

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

// The room, for one of its two members; anyone else is told it doesn't exist
const loadRoom = async (code: string, userId: string) => {
  const room = await db.peerRoom.findUnique({ where: { code: normalizeCode(code) }, include: withMembers });
  if (!room || (room.hostId !== userId && room.guestId !== userId)) throw new HttpError(404, 'No practice room with that code.', 'NO_ROOM');
  if (room.expiresAt <= new Date()) throw new HttpError(410, `This practice room has ended (rooms last ${ROOM_HOURS} hours).`, 'ROOM_EXPIRED');
  return room;
};

// Changes the state safely when both people act at once: written only if no one changed the room since it was
// read (updatedAt), otherwise read again and retried. `change` may throw an HttpError to refuse.
const update = async (code: string, userId: string, change: (state: PeerState, room: Members, role: PeerRole) => Partial<Pick<PeerRoom, 'status'>> | void) => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const room = await loadRoom(code, userId);
    const state = parseState(room.state);
    const extra = change(state, room, roleOf(room, state, userId)) ?? {};
    const updatedAt = new Date(Math.max(Date.now(), room.updatedAt.getTime() + 1));
    const { count } = await db.peerRoom.updateMany({
      where: { id: room.id, updatedAt: room.updatedAt },
      data: { state: JSON.stringify(state), updatedAt, ...extra },
    });
    if (count) return { ...room, ...extra, state: JSON.stringify(state), updatedAt } as Members;
  }
  throw new HttpError(409, 'The room is busy. Try again.');
};

const needRole = (role: PeerRole, wanted: PeerRole) => {
  if (role !== wanted) throw new HttpError(403, wanted === 'interviewer' ? 'Only the interviewer can do that.' : 'Only the candidate can do that.');
};
const needOpen = (room: PeerRoom) => {
  if (room.status === 'ENDED') throw new HttpError(409, 'This practice has ended.', 'ROOM_ENDED');
};
const findTurn = (state: PeerState, turnId: string) => {
  const turn = state.turns.find(t => t.id === turnId);
  if (!turn) throw new HttpError(404, 'That question is not in this room.');
  return turn;
};

const addQuestions = (state: PeerState, texts: { text: string; kind?: string }[], source: PeerQuestion['source']) => {
  const seen = new Set(state.questions.map(q => q.text.toLowerCase()));
  for (const { text, kind } of texts) {
    if (text.length < 3 || seen.has(text.toLowerCase()) || state.questions.length >= MAX_QUESTIONS) continue;
    seen.add(text.toLowerCase());
    state.questions.push({ id: newId(), text, source, ...(kind ? { kind } : {}) });
  }
};

// The candidate's progress keeps the practice (website → Progress, and the streak), scores only
const savePractice = async (room: PeerRoom, state: PeerState) => {
  const userId = candidateId(room, state);
  const scored = state.turns.filter(t => t.status === 'scored' || t.status === 'failed');
  if (!userId || !scored.length) return;
  await db.practiceSession.create({
    data: {
      userId, role: 'Practice with a friend', questionCount: scored.length,
      averageScore: average(scored.map(t => t.ai?.score)),
      details: scored.map(t => ({ question: t.question.slice(0, 1000), score: t.ai?.score ?? null, wordsPerMinute: null, fillers: 0, seconds: t.seconds ?? 0 })),
    },
  });
};

// Rooms are kept a day after they end, then deleted (by the half-hourly job)
export const cleanupPeerRooms = async (now = new Date()) =>
  (await db.peerRoom.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } })).count;

// ---------- Routes ----------

export const peerRoutes = (ai: AiGateway) => {
  const router = Router();
  router.use(requireUser);

  // A new room. The host picks their role; a candidate needs the app (it listens to their microphone).
  router.post('/', createLimiter, route(async (req, res) => {
    const input = z.object({ role: z.enum(['interviewer', 'candidate']), summary: cleanText(600).default('') }).parse(req.body);
    if (input.role === 'candidate' && !req.device) throw new HttpError(403, 'The candidate answers in the Recallr app. Open the app to practise as the candidate.', 'APP_NEEDED');
    const bank = await db.question.findMany({ where: { published: true, category: { in: ['ABOUT_YOU', 'EXPERIENCE'] } }, orderBy: { timesAsked: 'desc' }, take: 6, select: { text: true } });
    const state: PeerState = { hostRole: input.role, candidate: { summary: input.role === 'candidate' ? input.summary : '' }, questions: [], turns: [] };
    addQuestions(state, [...COMMON_QUESTIONS, ...bank.map(q => q.text)].map(text => ({ text })), 'common');
    for (let attempt = 0; ; attempt++) {
      try {
        const room = await db.peerRoom.create({
          data: { code: newCode(), hostId: req.user!.id, state: JSON.stringify(state), expiresAt: new Date(Date.now() + ROOM_HOURS * 60 * 60 * 1000) },
          include: withMembers,
        });
        return res.status(201).json({ room: view(room, req.user!.id) });
      } catch (error) {
        if (attempt >= 4) throw error; // A code already taken: another one
      }
    }
  }));

  // Joining with the code: the guest takes the other role
  router.post('/join', joinLimiter, route(async (req, res) => {
    const input = z.object({ code: z.string().max(20), summary: cleanText(600).default('') }).parse(req.body);
    const code = normalizeCode(input.code);
    const found = code.length === 6 ? await db.peerRoom.findUnique({ where: { code } }) : null;
    if (!found) throw new HttpError(404, 'No practice room with that code. Check it with your friend.', 'NO_ROOM');
    if (found.expiresAt <= new Date()) throw new HttpError(410, `This practice room has ended (rooms last ${ROOM_HOURS} hours).`, 'ROOM_EXPIRED');
    const userId = req.user!.id;
    if (found.hostId === userId || found.guestId === userId) return res.json({ room: view(await loadRoom(code, userId), userId) });
    if (found.guestId) throw new HttpError(409, 'Two people are already in this room.', 'ROOM_FULL');
    if (found.status === 'ENDED') throw new HttpError(409, 'This practice has ended.', 'ROOM_ENDED');
    const state = parseState(found.state);
    const role: PeerRole = state.hostRole === 'candidate' ? 'interviewer' : 'candidate';
    if (role === 'candidate' && !req.device) {
      throw new HttpError(403, 'Your friend is the interviewer, so you answer as the candidate: join from the Recallr app (it listens to your microphone).', 'APP_NEEDED');
    }
    if (role === 'candidate') state.candidate.summary = input.summary;
    const updatedAt = new Date(Math.max(Date.now(), found.updatedAt.getTime() + 1));
    const { count } = await db.peerRoom.updateMany({
      where: { id: found.id, guestId: null, status: 'WAITING' },
      data: { guestId: userId, status: 'ACTIVE', state: JSON.stringify(state), updatedAt },
    });
    if (!count) throw new HttpError(409, 'Two people are already in this room.', 'ROOM_FULL');
    res.json({ room: view(await loadRoom(code, userId), userId) });
  }));

  // The room as it is now. Send If-None-Match with the last ETag: 304 when nothing changed.
  router.get('/:code', pollLimiter, route(async (req, res) => {
    const userId = req.user!.id;
    const light = await db.peerRoom.findUnique({
      where: { code: normalizeCode(req.params.code) }, select: { hostId: true, guestId: true, expiresAt: true, updatedAt: true },
    });
    res.set('Cache-Control', 'no-cache');
    if (light && (light.hostId === userId || light.guestId === userId) && light.expiresAt > new Date()) {
      const etag = `"${light.updatedAt.getTime()}"`;
      res.set('ETag', etag);
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
    }
    const room = await loadRoom(req.params.code, userId);
    res.set('ETag', `"${room.updatedAt.getTime()}"`);
    res.json({ room: view(room, userId) });
  }));

  // Questions to pick from: the candidate's app adds ones from their resume, the interviewer their own
  router.post('/:code/questions', actionLimiter, route(async (req, res) => {
    const input = z.object({
      questions: z.array(z.object({ text: cleanText(400), kind: z.string().max(30).optional() })).min(1).max(20),
    }).parse(req.body);
    const room = await update(req.params.code, req.user!.id, (state, r, role) => {
      needOpen(r);
      addQuestions(state, input.questions, role === 'candidate' ? 'resume' : 'own');
    });
    res.json({ room: view(room, req.user!.id) });
  }));

  // What the candidate shows the interviewer about themselves
  router.post('/:code/profile', actionLimiter, route(async (req, res) => {
    const summary = cleanText(600).parse(req.body.summary ?? '');
    const room = await update(req.params.code, req.user!.id, (state, r, role) => {
      needRole(role, 'candidate');
      needOpen(r);
      state.candidate.summary = summary;
    });
    res.json({ room: view(room, req.user!.id) });
  }));

  // The interviewer asks a question: one from the list (questionId) or their own words (text)
  router.post('/:code/ask', actionLimiter, route(async (req, res) => {
    const input = z.object({ questionId: z.string().max(20).optional(), text: cleanText(400).optional() }).parse(req.body);
    const room = await update(req.params.code, req.user!.id, (state, r, role) => {
      needRole(role, 'interviewer');
      needOpen(r);
      if (!r.guestId) throw new HttpError(409, 'Wait for your friend to join first.');
      if (state.turns.length >= MAX_TURNS) throw new HttpError(409, `That's ${MAX_TURNS} questions: end this practice and start a new one.`);
      let question = input.text ?? '';
      if (input.questionId) question = state.questions.find(q => q.id === input.questionId)?.text ?? '';
      else if (!question) question = state.questions.find(q => !state.turns.some(t => t.question === q.text))?.text ?? ''; // The next one not asked yet
      if (question.length < 3) throw new HttpError(400, 'Choose or type a question.');
      if (input.text && !input.questionId) addQuestions(state, [{ text: question }], 'own');
      // The question before, never answered, was skipped
      const previous = state.turns[state.turns.length - 1];
      if (previous && previous.status === 'asked' && !previous.transcript) previous.status = 'skipped';
      state.turns.push({ id: newId(), question, askedAt: Date.now(), status: 'asked', transcript: '' });
    });
    res.json({ room: view(room, req.user!.id) });
  }));

  // The candidate's words so far, as their app hears them (the interviewer sees them live)
  router.post('/:code/transcript', actionLimiter, route(async (req, res) => {
    const input = z.object({ turnId: z.string().max(20), text: z.string().max(10_000) }).parse(req.body);
    const room = await update(req.params.code, req.user!.id, (state, r, role) => {
      needRole(role, 'candidate');
      needOpen(r);
      const turn = findTurn(state, input.turnId);
      if (turn.status !== 'asked' && turn.status !== 'answering') return;
      turn.transcript = input.text.trim();
      turn.status = 'answering';
    });
    res.json({ room: view(room, req.user!.id) });
  }));

  // The candidate finished the answer: the AI scores it, on the candidate's plan
  router.post('/:code/answer', scoreLimiter, route(async (req, res) => {
    const input = z.object({ turnId: z.string().max(20), text: z.string().max(10_000), seconds: z.number().min(0).max(3600).optional() }).parse(req.body);
    const userId = req.user!.id;
    if (!req.device) throw new HttpError(403, 'The candidate answers in the Recallr app.', 'APP_NEEDED');
    const answer = input.text.replace(/\s+/g, ' ').trim();
    let question = '';
    let summary = '';
    const purchase = answer ? await purchaseFor(userId, 'CHAT') : null; // Checked before anything changes: no plan, no score
    const marked = await update(req.params.code, userId, (state, r, role) => {
      needRole(role, 'candidate');
      needOpen(r);
      const turn = findTurn(state, input.turnId);
      if (turn.status === 'scoring' || turn.status === 'scored') throw new HttpError(409, 'That answer was already sent.');
      turn.transcript = answer;
      turn.seconds = input.seconds;
      turn.status = answer ? 'scoring' : 'skipped';
      question = turn.question;
      summary = state.candidate.summary;
    });
    if (!answer || !purchase) return res.json({ room: view(marked, userId) });

    let result: Awaited<ReturnType<AiGateway['streamChat']>> | null = null;
    let aiError = '';
    try {
      result = await ai.streamChat({
        tier: 'quality', system: PEER_PROMPT, json: true, temperature: 0.3, maxTokens: 2000,
        user: `${summary ? `About the candidate: ${summary}\n\n` : ''}Question: ${question}\n\nWhat the candidate said: ${answer}`,
      }, () => {}, new AbortController().signal);
      recordUsageAfter({
        userId, purchaseId: purchase.id, kind: 'CHAT', provider: result.provider, model: result.model,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      });
    } catch (error) {
      console.error('Peer practice scoring failed:', error);
      aiError = error instanceof HttpError ? error.message : 'The AI could not score this answer. Your friend’s rating still counts.';
    }
    const data = result ? parseJsonReply(result.text) ?? {} : {};
    const raw = Math.round(Number(data.score));
    const room = await update(req.params.code, userId, state => {
      const turn = findTurn(state, input.turnId);
      if (result) {
        turn.status = 'scored';
        turn.ai = { score: Number.isFinite(raw) ? Math.min(10, Math.max(1, raw)) : null, good: replyText(data.good), improve: replyText(data.improve), better: replyText(data.better, 3000) };
      } else {
        turn.status = 'failed';
        turn.aiError = aiError;
      }
    });
    res.json({ room: view(room, userId) });
  }));

  // The interviewer's own 1-5 rating and a comment on one answer
  router.post('/:code/rate', actionLimiter, route(async (req, res) => {
    const input = z.object({ turnId: z.string().max(20), stars: z.number().int().min(1).max(5), comment: cleanText(1000).default('') }).parse(req.body);
    const room = await update(req.params.code, req.user!.id, (state, _r, role) => {
      needRole(role, 'interviewer');
      findTurn(state, input.turnId).rating = { stars: input.stars, comment: input.comment };
    });
    res.json({ room: view(room, req.user!.id) });
  }));

  // Either person ends it; both then see the summary (until the room expires)
  router.post('/:code/end', actionLimiter, route(async (req, res) => {
    let save = false;
    const room = await update(req.params.code, req.user!.id, state => {
      const last = state.turns[state.turns.length - 1];
      if (last && last.status === 'asked' && !last.transcript) last.status = 'skipped';
      state.endedAt ??= Date.now();
      save = !state.practiceSaved;
      state.practiceSaved = true;
      return { status: 'ENDED' };
    });
    if (save) await savePractice(room, parseState(room.state)).catch(error => console.error('Could not save the peer practice:', error));
    res.json({ room: view(room, req.user!.id) });
  }));

  return router;
};
