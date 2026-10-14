// Decide whether what the interviewer just said deserves an answer, or is filler/backchannel
// ("okay", "yeah, sure", "thank you") that should wait for the real question.

const FILLER = new Set([
  'ok', 'okay', 'yeah', 'yes', 'yep', 'no', 'nope', 'right', 'sure', 'great', 'cool', 'nice', 'good', 'perfect',
  'awesome', 'thanks', 'thank', 'you', 'alright', 'all', 'so', 'and', 'um', 'uh', 'umm', 'uhh', 'hmm', 'mm', 'mhm',
  'ah', 'oh', 'well', 'got', 'it', 'i', 'see', 'makes', 'sense', 'interesting', 'fine', 'exactly', 'correct',
  'wow', 'hi', 'hello', 'hey', 'the', 'a', 'that', 'this', 'is', 'was', 'very', 'really', 'just', 'let', 'me',
  'one', 'second', 'sec', 'moment', 'hold', 'on', 'sorry', 'go', 'ahead', 'please', 'continue',
  // Hindi / Hinglish
  'haan', 'han', 'ha', 'ji', 'achha', 'acha', 'accha', 'theek', 'thik', 'hai', 'bilkul', 'sahi', 'chalo', 'dhanyavaad', 'shukriya',
]);

const QUESTION_STARTERS = /^(what|why|how|when|where|which|who|whom|whose|can|could|would|will|should|do|does|did|is|are|was|were|have|has|tell|describe|explain|walk|talk|give|share|define|compare|design|implement|write|imagine|suppose|say|let's say)\b/;

const ASKING_PHRASES = /\b(tell me|walk me through|talk me through|can you|could you|would you|how would|how do|what would|what is|what's|what are|why did|why do|give me an example|explain|describe|difference between|your experience|have you ever|a time when)\b/;

// Short follow-ups to the previous answer ("Example?", "Why?", "Tell me more", "Code?")
const FOLLOW_UP_WORDS = new Set([
  'example', 'examples', 'instance', 'elaborate', 'detail', 'details', 'more', 'why', 'how', 'code', 'snippet',
  'explain', 'clarify', 'deeper', 'demo', 'show', 'meaning', 'difference', 'pros', 'cons', 'tradeoffs', 'alternative',
]);

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);

// `language` is the profile's interview language; the phrase rules below only know English
export const isLikelyQuestion = (text: string, language = 'en'): boolean => {
  const clean = text.trim().toLowerCase();
  const list = words(clean);
  // Words in other scripts (Devanagari, Arabic...) don't match a-z, so count them separately
  const allWords = clean.split(/\s+/).filter(Boolean);
  if (allWords.length === 0) return false;

  // Nothing but filler words ("okay, yeah, great, thank you")
  if (list.length === allWords.length && list.every(w => FILLER.has(w))) return false;

  // Other languages: a question mark, or a few words, is enough
  if (language !== 'en' && (clean.includes('?') || allWords.length >= 3)) return true;

  if (list.length <= 5 && list.some(w => FOLLOW_UP_WORDS.has(w))) return true;
  if (clean.includes('?') && list.length >= 2) return true;
  if (ASKING_PHRASES.test(clean)) return true;
  if (QUESTION_STARTERS.test(clean) && list.length >= 3) return true;

  // A longer statement is usually a prompt to respond ("I'd like to hear about your last project")
  const meaningful = list.filter(w => !FILLER.has(w));
  return meaningful.length >= 5;
};

// ---------- Question type ----------
// Fast keyword rules (no AI call), checked in this order; the answer gets a matching shape

export type QuestionKind = 'coding' | 'design' | 'experience' | 'about-you' | 'concept' | 'other';

const KIND_RULES: [QuestionKind, RegExp][] = [
  ['coding', /(^code\b|\bshow (me )?(the )?code\b|\bin code\b|\b(write (a |an |the )?(query|function|program|code|script|sql|regex|method|class)|implement|code (it|this|that)|reverse (a|an|the)|find the (first|second|nth|longest|shortest|missing|duplicate)|time complexity of your|leetcode|coding (problem|question))\b)/],
  ['design', /\b(design (a|an|the|our|your)\b|system design|how would you (design|build|architect|scale)|architecture (for|of)|high[- ]level design|scale (it|this|that) to|handle (millions|billions))/],
  ['experience', /\b(tell me about a time|describe a (time|situation)|give (me )?an example of a time|have you ever|a time when|conflict|disagree|mistake|failure|failed|proud|toughest|hardest|most challenging|challenging project|difficult (person|situation|stakeholder|teammate)|how did you handle|in your (last|current|previous) (role|job|company|team)|walk me through (a|your) project)\b/],
  ['about-you', /\b(about yourself|introduce yourself|your background|why (do you want|are you (leaving|looking)|should we hire|this (company|role)|us)|your (greatest )?strengths?|your weakness(es)?|five years|salary|notice period|expected ctc|current ctc|relocat|why (did you|are you) (leave|leaving|switch))/],
  ['concept', /\b(what is|what's|what are|what does|explain|difference between|how does|how do .+ work|why (is|are|do|does|would)|when (would|should) you use|pros and cons|advantages|disadvantages|compare)\b/],
];

export const classifyQuestion = (text: string): QuestionKind => {
  const clean = text.toLowerCase();
  return KIND_RULES.find(([, rule]) => rule.test(clean))?.[0] ?? 'other';
};
