// Decide whether what the interviewer just said deserves an answer, or is filler/backchannel
// ("okay", "yeah, sure", "thank you") that should wait for the real question.

const FILLER = new Set([
  'ok', 'okay', 'yeah', 'yes', 'yep', 'no', 'nope', 'right', 'sure', 'great', 'cool', 'nice', 'good', 'perfect',
  'awesome', 'thanks', 'thank', 'you', 'alright', 'all', 'so', 'and', 'um', 'uh', 'umm', 'uhh', 'hmm', 'mm', 'mhm',
  'ah', 'oh', 'well', 'got', 'it', 'i', 'see', 'makes', 'sense', 'interesting', 'fine', 'exactly', 'correct',
  'wow', 'hi', 'hello', 'hey', 'the', 'a', 'that', 'this', 'is', 'was', 'very', 'really', 'just', 'let', 'me',
  'one', 'second', 'sec', 'moment', 'hold', 'on', 'sorry', 'go', 'ahead', 'please', 'continue',
]);

const QUESTION_STARTERS = /^(what|why|how|when|where|which|who|whom|whose|can|could|would|will|should|do|does|did|is|are|was|were|have|has|tell|describe|explain|walk|talk|give|share|define|compare|design|implement|write|imagine|suppose|say|let's say)\b/;

const ASKING_PHRASES = /\b(tell me|walk me through|talk me through|can you|could you|would you|how would|how do|what would|what is|what's|what are|why did|why do|give me an example|explain|describe|difference between|your experience|have you ever|a time when)\b/;

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);

export const isLikelyQuestion = (text: string): boolean => {
  const clean = text.trim().toLowerCase();
  const list = words(clean);
  if (list.length === 0) return false;

  // Nothing but filler words ("okay, yeah, great, thank you")
  if (list.every(w => FILLER.has(w))) return false;

  if (clean.includes('?') && list.length >= 2) return true;
  if (ASKING_PHRASES.test(clean)) return true;
  if (QUESTION_STARTERS.test(clean) && list.length >= 3) return true;

  // A longer statement is usually a prompt to respond ("I'd like to hear about your last project")
  const meaningful = list.filter(w => !FILLER.has(w));
  return meaningful.length >= 5;
};
