// Speaking feedback for mock interviews, from the transcript and how long the answer took: pace, filler words
// and length. (The transcript keeps fillers in mock interviews; see "keepFillers" in transcribe.ts.)

export interface SpeakingFeedback {
  seconds: number;
  words: number;
  wordsPerMinute: number | null; // null for very short answers, where a pace means little
  fillers: number;
  fillerWords: { word: string; count: number }[]; // Most used first
  notes: string[]; // What to work on, in plain words
}

export const PACE = { slow: 110, fast: 165 }; // A comfortable interview pace, in words per minute
export const LENGTH = { short: 30, long: 150 }; // Seconds; most answers fit in between

// Sounds and phrases that fill a pause. "like" counts only where it's used as a filler (", like," or
// starting a sentence), not "I'd like to" or "something like this".
const FILLERS: [string, RegExp][] = [
  ['um', /\b(?:um+|umm+|erm+)\b/gi],
  ['uh', /\b(?:uh+|er+|ah+)\b/gi],
  ['hmm', /\bhm+\b/gi],
  ['like', /(?:^|[,.?!]\s*)like\b(?=\s*,)|,\s*like\s*,/gi],
  ['you know', /\byou know\b(?!\s+(?:what|how|that|the|about|if|when|why|who|where))/gi],
  ['I mean', /\bI mean\b(?=\s*,)/gi],
  ['basically', /\bbasically\b/gi],
  ['actually', /\bactually\b/gi],
  ['literally', /\bliterally\b/gi],
  ['kind of', /\bkind of\b/gi],
  ['sort of', /\bsort of\b/gi],
  ['so yeah', /\bso yeah\b/gi],
];

const formatLength = (seconds: number) => (seconds < 60 ? `${Math.round(seconds)} s` : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`);

export const analyzeSpeech = (transcript: string, seconds: number): SpeakingFeedback => {
  const text = transcript.trim();
  const words = text ? text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length : 0;
  const wordsPerMinute = seconds >= 10 && words >= 15 ? Math.round(words / (seconds / 60)) : null;
  const fillerWords = FILLERS
    .map(([word, pattern]) => ({ word, count: text.match(pattern)?.length ?? 0 }))
    .filter(f => f.count > 0)
    .sort((a, b) => b.count - a.count);
  const fillers = fillerWords.reduce((sum, f) => sum + f.count, 0);
  const perMinute = seconds > 0 ? fillers / (seconds / 60) : 0;

  const notes: string[] = [];
  if (wordsPerMinute !== null && wordsPerMinute < PACE.slow) notes.push(`A little slow (${wordsPerMinute} words a minute). Aim for ${PACE.slow}–${PACE.fast}: shorter pauses, and say the main point first.`);
  if (wordsPerMinute !== null && wordsPerMinute > PACE.fast) notes.push(`A little fast (${wordsPerMinute} words a minute). Slow down and pause between points; aim for ${PACE.slow}–${PACE.fast}.`);
  if (fillers >= 3 && perMinute >= 3) notes.push(`${fillers} filler words (most: “${fillerWords[0].word}”). A short silent pause sounds more confident than a filler.`);
  if (words > 0 && seconds < LENGTH.short) notes.push(`Short answer (${formatLength(seconds)}). Add an example or a result to show what you did.`);
  if (seconds > LENGTH.long) notes.push(`Long answer (${formatLength(seconds)}). Keep most answers under 2 minutes; lead with the point.`);
  return { seconds: Math.round(seconds), words, wordsPerMinute, fillers, fillerWords, notes };
};

export { formatLength };
