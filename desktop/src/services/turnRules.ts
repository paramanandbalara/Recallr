import { isFiller, isLikelyQuestion } from './questionDetect';

// What to do with a new piece of the interviewer's speech while (or just after) an answer is being written.
// Speech arrives in pieces split at pauses, so one question can come in two pieces, and other talk (a remark,
// another voice in the room) can arrive while an answer is streaming. Rules here keep the answer on screen.

const CONTINUATION_START = /^(and|or|but|so|for|with|without|in|on|at|of|to|from|by|about|like|such as|including|especially|where|which|that|who|whose|when|while|if|because|given|assuming|using|via|versus|vs|then|also|as well|plus|e\.g|i mean)\b/i;
const QUESTION_START = /^(what|why|how|when|where|which|who|can|could|would|will|should|do|does|did|is|are|have|has|tell|describe|explain|walk|talk|give|share|okay so|so tell|now tell|next|moving on|let's)\b/i;
const ASKING = /\b(tell me|walk me through|talk me through|can you|could you|would you|how would|how do|what would|what is|what's|what are|why did|why do|give me an example|explain|describe|difference between|have you ever|a time when)\b/i;

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// Clearly a question on its own: a question mark with a few words, asking words, or a question start.
// (isLikelyQuestion also counts any longer statement as a prompt; that's too loose while an answer is on screen.)
export const isStrongQuestion = (text: string, language = 'en') => {
  const clean = text.trim();
  if (!isLikelyQuestion(clean, language)) return false;
  if (language !== 'en') return clean.includes('?');
  // "for a global app?" finishes something said earlier; on its own it isn't a new question
  if (CONTINUATION_START.test(clean) && !ASKING.test(clean)) return false;
  return (clean.includes('?') && wordCount(clean) >= 3) || ASKING.test(clean) || (QUESTION_START.test(clean) && wordCount(clean) >= 4);
};

// `next` finishes `previous` ("How would you design a cache" + "for a global app?")
export const continuesQuestion = (previous: string, next: string) => {
  const prev = previous.trim();
  const text = next.trim().replace(/^[,.…\-–—\s]+/, '');
  if (!text || isFiller(text)) return false;
  if (CONTINUATION_START.test(text)) return true;
  // Starts in lower case (the speech-to-text carries on a sentence), or the first piece stopped mid-sentence
  if (/^[a-z]/.test(text) && !QUESTION_START.test(text)) return true;
  if (!/[?.!]$/.test(prev) && !QUESTION_START.test(text) && !ASKING.test(text)) return true;
  return false;
};

export type Incoming = 'merge' | 'question' | 'aside';

// `answering`: an answer to `early.question` started `sinceMs` ago and has `answerWords` words so far
export const classifyIncoming = (
  text: string,
  { early, sinceMs, answerWords, busy, language = 'en' }: {
    early?: string; sinceMs?: number; answerWords?: number; busy: boolean; language?: string;
  },
): Incoming => {
  // Right after an early answer began: more of the same question, unless it's clearly a new one
  if (early && sinceMs !== undefined && sinceMs < 4000 && continuesQuestion(early, text) && (answerWords ?? 0) < 60) return 'merge';
  // While an answer is on screen, only a clear question starts a new answer; the rest is a remark or other talk
  if (busy) return isStrongQuestion(text, language) ? 'question' : 'aside';
  return 'question';
};

// When the speech stops: answer now? While another answer is streaming, only clear questions count.
export const shouldAnswerOnPause = (question: string, busy: boolean, language = 'en') =>
  busy ? isStrongQuestion(question, language) : isLikelyQuestion(question, language);
