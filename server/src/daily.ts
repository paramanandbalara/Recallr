import type { DailyQuestion, QuestionCategory } from '@prisma/client';
import type { AiGateway, ChatResult } from './ai.js';
import { db } from './db.js';
import { cleanQuestion } from './questions.js';

// The question of the day: one interview question for everyone, made at 00:05 India time. It's a published question
// from the bank that wasn't used in the last 90 days, rotating through the categories; with an empty bank the AI
// writes one. Users answer it (typed, or spoken in the app) and get the AI's feedback, counted on their plan.
// The streak counts India days with a daily answer or a practice session (mock interview, peer practice).

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 5.5 * 60 * 60 * 1000;

// "2026-10-15": the day in India
export const istDay = (now: Date) => new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
export const istDayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// The model's reply as an object: tolerates ```json fences and text around the JSON
export const parseJsonReply = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
};
export const replyText = (v: unknown, max = 2000) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// ---------- Choosing the day's question ----------

export const CATEGORY_ROTATION: QuestionCategory[] = ['ABOUT_YOU', 'EXPERIENCE', 'CONCEPT', 'CODING', 'SYSTEM_DESIGN', 'OTHER'];

// When the bank is empty and the AI can't help either
const FALLBACK: { text: string; category: QuestionCategory }[] = [
  { text: 'Tell me about yourself.', category: 'ABOUT_YOU' },
  { text: 'Tell me about a time you disagreed with a teammate. What did you do?', category: 'EXPERIENCE' },
  { text: 'What is the difference between a process and a thread?', category: 'CONCEPT' },
  { text: 'How would you find the first non-repeating character in a string?', category: 'CODING' },
  { text: 'How would you design a URL shortener?', category: 'SYSTEM_DESIGN' },
  { text: 'Why do you want to work here?', category: 'OTHER' },
  { text: 'What is your biggest weakness, and what are you doing about it?', category: 'ABOUT_YOU' },
  { text: 'Tell me about a project you are proud of and your part in it.', category: 'EXPERIENCE' },
  { text: 'What happens when you type a URL into the browser and press Enter?', category: 'CONCEPT' },
  { text: 'Where do you see yourself in three years?', category: 'OTHER' },
];

const AI_PROMPT = `You write the "question of the day" for people preparing for job interviews in India and around the world.
Write ONE realistic interview question in the category you are given, the way an interviewer says it out loud: short, clear, one question.
It must not repeat or closely match any recent question you are given.
Reply with JSON only: {"question": "..."}`;

const CATEGORY_NAMES: Record<QuestionCategory, string> = {
  ABOUT_YOU: 'HR / about you', EXPERIENCE: 'behavioral ("tell me about a time")', CODING: 'coding (explain your approach in words)',
  SYSTEM_DESIGN: 'system design', CONCEPT: 'technical concept', OTHER: 'general',
};

const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Categories in rotation order, starting after the one used last
const rotationAfter = (last: QuestionCategory | undefined) => {
  const i = last ? CATEGORY_ROTATION.indexOf(last) : -1;
  return CATEGORY_ROTATION.map((_, n) => CATEGORY_ROTATION[(i + 1 + n) % CATEGORY_ROTATION.length]);
};

export const pickDailyQuestion = async (ai: AiGateway, day: string): Promise<{ text: string; category: QuestionCategory }> => {
  const recent = await db.dailyQuestion.findMany({ where: { date: { gte: addDays(day, -90), lt: day } }, orderBy: { date: 'desc' } });
  const used = new Set(recent.map(q => key(q.text)));
  const order = rotationAfter(recent[0]?.category);

  for (const category of order) {
    const candidates = (await db.question.findMany({
      where: { published: true, category }, orderBy: { timesAsked: 'desc' }, take: 200, select: { text: true },
    })).filter(q => !used.has(key(q.text)));
    if (candidates.length) {
      const top = candidates.slice(0, 20);
      return { text: cleanQuestion(top[Math.floor(Math.random() * top.length)].text), category };
    }
  }

  // Nothing in the bank: the AI writes one for the next category
  const category = order[0];
  try {
    const result = await ai.streamChat({
      tier: 'quality', system: AI_PROMPT, maxTokens: 400, json: true, temperature: 0.9,
      user: `Category: ${CATEGORY_NAMES[category]}\n\nRecent questions:\n${recent.slice(0, 30).map(q => `- ${q.text}`).join('\n') || '(none)'}`,
    }, () => {}, new AbortController().signal);
    const text = cleanQuestion(replyText(parseJsonReply(result.text)?.question, 500));
    if (text.length >= 12 && !used.has(key(text))) return { text, category };
  } catch (error) {
    console.error('The AI could not write the question of the day:', error);
  }
  const fallback = FALLBACK.filter(q => !used.has(key(q.text)));
  return fallback.find(q => q.category === category) ?? fallback[0] ?? FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
};

// ---------- Making it once a day, on one server ----------

const CLAIM_KEY = 'job.dailyQuestion'; // "2026-10-15@<ms>": the day being made, and when the claim was taken
const CLAIM_STALE_MS = 5 * 60 * 1000;   // A server that crashed while making it: another may try after this

const claim = async (day: string, now: number) => {
  const value = `${day}@${now}`;
  const previous = await db.setting.findUnique({ where: { key: CLAIM_KEY } });
  if (previous) {
    const [claimedDay, at] = previous.value.split('@');
    if (claimedDay === day && now - Number(at) < CLAIM_STALE_MS) return false;
    const { count } = await db.setting.updateMany({ where: { key: CLAIM_KEY, value: previous.value }, data: { value } });
    return count > 0;
  }
  try {
    await db.setting.create({ data: { key: CLAIM_KEY, value } });
    return true;
  } catch {
    return false; // Another server created it first
  }
};

// Today's question, made now if it doesn't exist yet. null while another server is making it.
export const ensureDailyQuestion = async (ai: AiGateway, now = new Date()): Promise<DailyQuestion | null> => {
  const day = istDay(now);
  const existing = await db.dailyQuestion.findUnique({ where: { date: day } });
  if (existing) return existing;
  if (!await claim(day, now.getTime())) return null;
  const picked = await pickDailyQuestion(ai, day);
  try {
    return await db.dailyQuestion.create({ data: { date: day, text: picked.text, category: picked.category } });
  } catch {
    return db.dailyQuestion.findUnique({ where: { date: day } }); // Made at the same moment elsewhere
  }
};

// The half-hourly job: from 00:05 in India. Returns the question when this call made it.
export const createDailyQuestion = async (ai: AiGateway, now = new Date()) => {
  const ist = new Date(now.getTime() + IST_MS);
  if (ist.getUTCHours() === 0 && ist.getUTCMinutes() < 5) return null;
  try {
    const before = await db.dailyQuestion.findUnique({ where: { date: istDay(now) }, select: { id: true } });
    if (before) return null;
    return await ensureDailyQuestion(ai, now);
  } catch (error) {
    console.error('Question of the day failed:', error);
    return null;
  }
};

// ---------- Feedback on an answer ----------

export const DAILY_PROMPT = `You coach a candidate on one interview question they answered for daily practice. The answer was typed or spoken
(speech-to-text: ignore small transcription errors and filler words). Be honest and specific, like a good human coach, not generous by default.
Return JSON only: {"score":7,"good":"...","improve":"...","better":"..."}
- "score": 0 to 10 for how well it would land in a real interview (relevance, a concrete example or evidence, clarity, length). 0 when it's empty or off-topic.
- "good": one or two sentences on what worked ("" if nothing did).
- "improve": the one or two changes that would help most.
- "better": a stronger version of THEIR answer, keeping their story and facts (never invent employers, numbers or results;
  use a clear placeholder like "<your project>" where a detail is missing). Natural speech, plain words, 60 to 150 words.
Write everything in plain, simple words.`;

export interface DailyFeedback {
  good: string;
  improve: string;
  better: string;
}

export const parseFeedback = (result: ChatResult) => {
  const data = parseJsonReply(result.text) ?? {};
  const raw = Math.round(Number(data.score));
  return {
    score: Number.isFinite(raw) ? Math.min(10, Math.max(0, raw)) : null,
    feedback: { good: replyText(data.good), improve: replyText(data.improve), better: replyText(data.better, 3000) } satisfies DailyFeedback,
  };
};

export const readFeedback = (stored: string | null): DailyFeedback | null => {
  if (!stored) return null;
  try {
    const data = JSON.parse(stored) as Partial<DailyFeedback>;
    return { good: data.good ?? '', improve: data.improve ?? '', better: data.better ?? '' };
  } catch {
    return null;
  }
};

// ---------- Streak ----------

// Days in a row (India time) with a daily answer or a practice session, up to today; a day not done yet doesn't break it
export const practiceDays = async (userId: string, since: string) => {
  const [answers, sessions] = await Promise.all([
    db.dailyAnswer.findMany({ where: { userId, dailyQuestion: { date: { gte: since } } }, select: { dailyQuestion: { select: { date: true } } } }),
    db.practiceSession.findMany({ where: { userId, createdAt: { gte: istDayStart(since) } }, select: { createdAt: true } }),
  ]);
  return new Set([...answers.map(a => a.dailyQuestion.date), ...sessions.map(s => istDay(s.createdAt))]);
};

export const streakFrom = (days: Set<string>, today: string) => {
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
};

export const streakFor = async (userId: string, now = new Date()) => {
  const today = istDay(now);
  return streakFrom(await practiceDays(userId, addDays(today, -400)), today);
};

export const lastDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
