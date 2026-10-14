// How natural and simple an answer sounds when said out loud, from 1 to 10, with what to fix.
// Worked out on the computer from the text (no AI call), so it shows the moment the answer finishes.

export interface AnswerScore {
  score: number;
  issues: string[]; // Plain notes, most important first; empty when it reads well
}

// Phrases that make speech sound written by AI
const AI_PHRASES = [
  'great question', 'certainly', 'absolutely', "i'd be happy to", 'delve', 'leverage', 'utilize', 'robust', 'seamless', 'streamline',
  'harness', 'foster', 'elevate', 'empower', 'crucial', 'pivotal', 'paramount', 'comprehensive', 'holistic', 'intricate', 'meticulous',
  'cutting-edge', 'game-changer', 'synergy', 'landscape', 'realm', 'tapestry', 'testament', 'spearhead', 'furthermore', 'moreover',
  'additionally', "it's worth noting", 'in summary', 'in conclusion', 'not only', 'this allows', 'this ensures', 'this enables',
];

// Long words that are normal in interviews, so they don't count as hard to say
const EVERYDAY_LONG = new Set([
  'application', 'applications', 'information', 'experience', 'everything', 'everyone', 'actually', 'basically', 'especially',
  'probably', 'usually', 'really', 'company', 'database', 'databases', 'interviewer', 'responsibility', 'responsibilities',
  'organization', 'communication', 'documentation', 'anything', 'something', 'different', 'difference', 'definitely',
  'performance', 'production', 'customer', 'customers', 'important', 'available', 'automatically', 'immediately',
]);

const syllables = (word: string) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
};

// Spoken text only: code blocks and `names` are the code, not the speech
const spokenText = (text: string) => text.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`]*`/g, 'it');

export const scoreAnswer = (answer: string, question = ''): AnswerScore => {
  const text = spokenText(answer).trim();
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  if (words.length < 8) return { score: 10, issues: [] };
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => /[A-Za-z]/.test(s));
  const asked = new Set((question.toLowerCase().match(/[a-z]+/g) ?? []));

  let score = 10;
  const issues: string[] = [];

  const average = words.length / Math.max(1, sentences.length);
  const longest = Math.max(...sentences.map(s => (s.match(/[A-Za-z]+/g) ?? []).length));
  if (average > 16) {
    score -= Math.min(3, (average - 16) * 0.25);
    issues.push(`Sentences are long (${Math.round(average)} words on average). Shorter ones are easier to say.`);
  } else if (longest > 32) {
    score -= 1;
    issues.push(`One sentence has ${longest} words. Split it in two.`);
  }

  const hard = [...new Set(words
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 9 && syllables(w) >= 4 && !EVERYDAY_LONG.has(w) && !asked.has(w)))];
  if (hard.length / words.length > 0.04 || hard.length >= 4) {
    score -= Math.min(2.5, hard.length * 0.5);
    issues.push(`Hard words to say: ${hard.slice(0, 3).join(', ')}.`);
  }

  const lower = ` ${text.toLowerCase()} `;
  const ai = AI_PHRASES.filter(p => lower.includes(p.includes(' ') ? p : ` ${p}`));
  if (ai.length) {
    score -= Math.min(3, ai.length);
    issues.push(`Sounds written, not spoken: “${ai.slice(0, 2).join('”, “')}”.`);
  }

  if (/^\s*([-*•]|\d+\.)\s/m.test(text) || /\n\s*\n.*\n\s*\n/.test(text) && sentences.length > 12) {
    score -= 1;
    issues.push('Reads like a list. Say it as a few connected sentences.');
  }

  if (words.length > 45 && !/\b\w+['’](?:m|s|re|ve|ll|d|t)\b/i.test(text)) {
    score -= 0.5;
    issues.push('No short forms (I’m, it’s, we’d). People use them when they talk.');
  }

  return { score: Math.max(1, Math.min(10, Math.round(score))), issues };
};
