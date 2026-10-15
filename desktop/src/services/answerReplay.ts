import type { Turn } from '../components/ConversationFeed';
import { extractJsonObject } from './salaryNegotiation';

// Answer replay after a real interview: what the user actually said to each question (heard on the mic in
// "Call + mic" mode), a stronger version of it, and a second try in the mock interview.
// Helpers that don't need the AI or the browser; the AI call is in practiceAi.ts.

export interface ReplayQuestion {
  turnId: string;
  question: string;
  spoken: string; // '' when the mic wasn't heard for this one
}

export interface ReplayFeedback {
  score: number;  // 1..10, for what they said
  good: string;   // What was good
  fix: string;    // What to fix
  better: string; // A stronger version, in their voice
}

export interface ReplayItem extends ReplayQuestion {
  feedback?: ReplayFeedback;
}

// At most this many questions go into one replay (one AI call, one short practice)
export const MAX_REPLAY_QUESTIONS = 8;

// Too short to judge ("yes", "okay so")
const MIN_SPOKEN_WORDS = 4;
export const wasSpoken = (text: string | undefined) => (text ?? '').trim().split(/\s+/).filter(Boolean).length >= MIN_SPOKEN_WORDS;

// The interview's real questions, in order, with what was said to each; repeats are dropped
export const replayQuestions = (turns: Turn[], max = MAX_REPLAY_QUESTIONS): ReplayQuestion[] => {
  const seen = new Set<string>();
  const out: ReplayQuestion[] = [];
  for (const turn of turns) {
    const question = turn.question.replace(/\s+/g, ' ').trim();
    if (turn.status === 'skipped' || question.length < 12) continue;
    const key = question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ turnId: turn.id, question, spoken: wasSpoken(turn.spoken) ? turn.spoken!.replace(/\s+/g, ' ').trim() : '' });
  }
  // The ones with something said come first: those are the ones with a "before"
  return [...out.filter(q => q.spoken), ...out.filter(q => !q.spoken)].slice(0, max);
};

const asText = (value: unknown) => (typeof value === 'string' ? value.replace(/[ \t]+/g, ' ').trim() : '');

// The batched reply: {"answers":[{"n":1,"score":6,"good":"...","fix":"...","better":"..."}]}, matched back by number
// (or by order when numbers are missing). Questions without a usable entry get none.
export const parseReplayFeedback = (raw: string, questions: ReplayQuestion[]): (ReplayFeedback | undefined)[] => {
  const data = extractJsonObject(raw) ?? {};
  const items = Array.isArray(data.answers) ? data.answers : Array.isArray(data.items) ? data.items : [];
  const result: (ReplayFeedback | undefined)[] = questions.map(() => undefined);
  items.forEach((item: unknown, i: number) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const n = Number(o.n ?? o.index ?? o.number);
    const at = Number.isInteger(n) && n >= 1 && n <= questions.length ? n - 1 : i;
    if (at >= questions.length || result[at]) return;
    const better = asText(o.better ?? o.stronger);
    if (!better) return;
    const score = Math.round(Number(o.score));
    result[at] = {
      score: Number.isFinite(score) ? Math.min(10, Math.max(1, score)) : 5,
      good: asText(o.good),
      fix: asText(o.fix ?? o.improve),
      better,
    };
  });
  return result;
};

// What the mock interview needs for "Say it again": the question, the old answer and its score
export interface ReplayBaseline {
  question: string;
  said: string;
  score?: number;
}

export const replayBaseline = (items: ReplayItem[]): ReplayBaseline[] =>
  items.map(item => ({ question: item.question, said: item.spoken, score: item.feedback?.score }));

// "+2", "−1", "same"
export const scoreChange = (before: number | undefined, after: number | undefined) => {
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  const diff = after - before;
  return diff === 0 ? '±0' : diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
};
