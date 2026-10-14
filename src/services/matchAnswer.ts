import type { PreparedAnswer } from './storage';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about', 'from', 'by',
  'me', 'my', 'i', 'you', 'your', 'we', 'us', 'our', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been',
  'do', 'does', 'did', 'can', 'could', 'would', 'will', 'should', 'so', 'just', 'bit', 'little', 'some',
  'what', 'how', 'this', 'that', 'there', 'here', 'please', 'okay', 'ok', 'well', 'um', 'uh', 'like', 'maybe',
]);

const tokens = (text: string) => text
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(word => word.length > 1 && !STOPWORDS.has(word))
  // Light stemming so "challenges" matches "challenge"
  .map(word => word.replace(/(ing|ed|es|s)$/, ''));

// Find the prepared answer whose question best matches what the interviewer just said
export const matchPreparedAnswer = (spoken: string, answers: PreparedAnswer[]): PreparedAnswer | null => {
  const spokenTokens = new Set(tokens(spoken));
  if (spokenTokens.size === 0) return null;

  let best: PreparedAnswer | null = null;
  let bestScore = 0;

  for (const candidate of answers) {
    if (!candidate.answer.trim()) continue;
    const questionTokens = [...new Set(tokens(candidate.question))];
    if (questionTokens.length < 2) continue; // Too short to match reliably

    const hits = questionTokens.filter(t => spokenTokens.has(t)).length;
    const score = hits / questionTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= 0.8 ? best : null;
};
