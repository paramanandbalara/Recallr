import { english, LENGTH, PACE, type Translate } from './speaking';

// The "Test interview from my resume": helpers that don't need the AI or the browser (so they're tested in node).
// The AI call itself is resumeInterviewQuestions in ai.ts.

export type ExperienceLevel = 'fresher' | 'junior' | 'mid' | 'senior';
export const EXPERIENCE_LEVELS: ExperienceLevel[] = ['fresher', 'junior', 'mid', 'senior'];

export type ResumeQuestionKind = 'about-you' | 'project' | 'skill' | 'behavioural' | 'situational';
export const RESUME_QUESTION_KINDS: ResumeQuestionKind[] = ['about-you', 'project', 'skill', 'behavioural', 'situational'];

export interface ResumeQuestion {
  question: string;
  kind: ResumeQuestionKind;
}

export interface ResumeInterview {
  role: string;                  // From the resume, e.g. "backend engineer"; '' when unclear
  level: ExperienceLevel | null; // null when neither the AI nor the resume says
  questions: ResumeQuestion[];
}

// The one-button test asks this many (the brief: about 5 to 8)
export const RESUME_TEST_QUESTIONS = 6;

// A short resume can't carry a tailored interview
export const MIN_RESUME_CHARS = 150;
export const hasUsableResume = (cv: string) => cv.replace(/\s+/g, ' ').trim().length >= MIN_RESUME_CHARS;

// ---------- Experience level ----------

export const levelFromYears = (years: number): ExperienceLevel =>
  years < 1 ? 'fresher' : years < 3 ? 'junior' : years < 7 ? 'mid' : 'senior';

// What the AI wrote ("Mid-level", "entry level", "Lead"...) as one of the four levels
export const normalizeLevel = (value: unknown): ExperienceLevel | null => {
  if (typeof value !== 'string') return null;
  const text = value.toLowerCase();
  if (/fresh|graduate|student|intern|entry|trainee|no experience/.test(text)) return 'fresher';
  if (/senior|lead|staff|principal|architect|manager|head|expert/.test(text)) return 'senior';
  if (/mid|intermediate|experienced/.test(text)) return 'mid';
  if (/junior|beginner|associate/.test(text)) return 'junior';
  return null;
};

// Years of experience the resume states itself ("5+ years of experience", "3.5 yrs experience in Java"), or null
export const statedYears = (cv: string): number | null => {
  const found = [...cv.matchAll(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+[\w-]+){0,3}?\s+experience/gi)]
    .map(m => Number(m[1]))
    .filter(n => Number.isFinite(n) && n <= 45);
  return found.length ? Math.max(...found) : null;
};

// A fallback when the AI doesn't give a level: the years the resume states, or a fresher's own words
export const levelFromResume = (cv: string): ExperienceLevel | null => {
  const years = statedYears(cv);
  if (years !== null) return levelFromYears(years);
  return /\b(?:fresher|fresh graduate|final[- ]year student|recent graduate|seeking (?:my )?first)\b/i.test(cv) ? 'fresher' : null;
};

// "Questions for a mid-level backend engineer"
export const levelHeading = (level: ExperienceLevel | null, role: string, t: Translate = english) => {
  if (!level) return role ? t('Questions for your role: {role}', { role }) : t('Questions from your resume');
  const r = role || t('candidate');
  switch (level) {
    case 'fresher': return t('Questions for a fresher {role}', { role: r });
    case 'junior': return t('Questions for a junior {role}', { role: r });
    case 'mid': return t('Questions for a mid-level {role}', { role: r });
    case 'senior': return t('Questions for a senior {role}', { role: r });
  }
};

export const kindLabel = (kind: ResumeQuestionKind, t: Translate = english) => {
  switch (kind) {
    case 'about-you': return t('About you');
    case 'project': return t('Project deep-dive');
    case 'skill': return t('Skills');
    case 'behavioural': return t('Behavioural');
    case 'situational': return t('Situational');
  }
};

// ---------- Parsing the AI's answer ----------

const asText = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

// The JSON object in the reply, even with ```json fences or a sentence around it; null if there isn't one
const extractJson = (raw: string): Record<string, unknown> | null => {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const tryParse = (s: string) => {
    try {
      const value = JSON.parse(s);
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  };
  const whole = tryParse(text);
  if (whole) return Array.isArray(whole) ? { questions: whole } : whole;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const inner = tryParse(text.slice(start, end + 1));
    if (inner) return Array.isArray(inner) ? { questions: inner } : inner;
  }
  const list = text.indexOf('[');
  const listEnd = text.lastIndexOf(']');
  if (list >= 0 && listEnd > list) {
    const inner = tryParse(text.slice(list, listEnd + 1));
    if (Array.isArray(inner)) return { questions: inner };
  }
  return null;
};

const normalizeKind = (value: unknown): ResumeQuestionKind => {
  const text = typeof value === 'string' ? value.toLowerCase() : '';
  if (/about|intro|warm/.test(text)) return 'about-you';
  if (/project/.test(text)) return 'project';
  if (/behaviou?r/.test(text)) return 'behavioural';
  if (/situation|scenario|hypothetical/.test(text)) return 'situational';
  return 'skill';
};

// "1. Tell me…", "- Tell me…", "Q: Tell me…", quoted → the bare question
const cleanQuestion = (text: string) => text
  .replace(/^\s*(?:[-*•]|\d{1,2}[.)]|q\d*[:.)])\s*/i, '')
  .replace(/^["“']+|["”']+$/g, '')
  .trim();

const toQuestion = (item: unknown): ResumeQuestion | null => {
  if (typeof item === 'string') return { question: cleanQuestion(asText(item)), kind: 'skill' };
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const question = cleanQuestion(asText(o.q ?? o.question ?? o.text));
  return question ? { question, kind: normalizeKind(o.kind ?? o.type ?? o.category) } : null;
};

// Defensive: anything unexpected becomes "no questions" rather than an error, and repeats are dropped
export const parseResumeInterview = (raw: string, count: number, cv = ''): ResumeInterview => {
  const data = extractJson(raw ?? '') ?? {};
  const seen = new Set<string>();
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .map(toQuestion)
    .filter((q): q is ResumeQuestion => {
      if (!q || q.question.length < 8 || q.question.length > 400) return false;
      const key = q.question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, count));

  const years = typeof data.years === 'number' ? data.years : Number.parseFloat(asText(data.years));
  const level = normalizeLevel(data.level)
    ?? (Number.isFinite(years) && years >= 0 && years <= 45 ? levelFromYears(years) : null)
    ?? levelFromResume(cv);
  const role = asText(data.role).replace(/^(?:a|an)\s+/i, '').replace(/[.!,;:]+$/, '').slice(0, 60).trim();
  return { role: /^(?:unknown|n\/a|none|not clear|unclear)$/i.test(role) ? '' : role, level, questions };
};

// ---------- What the test uses from the plan ----------

// A typical spoken interview answer is one to two minutes; only the time spent answering is listened to
export const TYPICAL_ANSWER_SECONDS = 90;

// Minutes of listening time a test of `questions` answers will likely use (rounded up, at least 1)
export const estimateListeningMinutes = (questions: number, secondsPerAnswer = TYPICAL_ANSWER_SECONDS) =>
  Math.max(1, Math.ceil((Math.max(0, questions) * secondsPerAnswer) / 60));

// ---------- After the test ----------

export interface TestAnswer {
  question: string;
  answer: string;
  score?: number;   // Missing when skipped or not scored
  improve?: string; // The coach's main point
  speaking?: { seconds: number; wordsPerMinute: number | null; fillers: number };
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

// A short "What to work on" list from the scores and the speaking numbers, most useful first (no extra AI call)
export const whatToWorkOn = (answers: TestAnswer[], t: Translate = english, max = 4): string[] => {
  const items: string[] = [];
  const weak = answers
    .filter(a => typeof a.score === 'number' && a.score < 7 && a.improve)
    .sort((a, b) => a.score! - b.score!);
  for (const a of weak.slice(0, 2)) items.push(t('“{question}”: {tip}', { question: a.question, tip: a.improve! }));

  const skipped = answers.filter(a => !a.answer.trim()).length;
  if (skipped === 1) items.push(t('You skipped 1 question: prepare a short answer for it from your resume.'));
  else if (skipped > 1) items.push(t('You skipped {n} questions: prepare a short answer for each from your resume.', { n: skipped }));

  const spoken = answers.filter(a => a.speaking && a.answer.trim()).map(a => a.speaking!);
  const pace = mean(spoken.map(s => s.wordsPerMinute).filter((n): n is number => n !== null));
  if (pace !== null && pace < PACE.slow) items.push(t('Speak a little faster: about {wpm} words a minute now, aim for {slow}–{fast}.', { wpm: Math.round(pace), slow: PACE.slow, fast: PACE.fast }));
  if (pace !== null && pace > PACE.fast) items.push(t('Slow down: about {wpm} words a minute now, aim for {slow}–{fast}.', { wpm: Math.round(pace), slow: PACE.slow, fast: PACE.fast }));
  const fillers = mean(spoken.map(s => s.fillers));
  if (fillers !== null && fillers >= 3) items.push(t('Cut the filler words (about {n} per answer): pause silently instead.', { n: Math.round(fillers) }));
  const length = mean(spoken.map(s => s.seconds));
  if (length !== null && length < LENGTH.short) items.push(t('Give fuller answers: add one real example from your projects and its result.'));
  if (length !== null && length > LENGTH.long) items.push(t('Keep answers shorter: lead with the point and stay under 2 minutes.'));

  // Everything went well: still one thing to keep doing
  if (!items.length && answers.some(a => typeof a.score === 'number')) items.push(t('Strong round. Next time, try it with a job description added to the profile for harder questions.'));
  return items.slice(0, max);
};

// The questions worth another go: low scores and skipped ones (all of them when everything went well)
export const questionsToRetry = (answers: TestAnswer[]): string[] => {
  const weak = answers.filter(a => !a.answer.trim() || typeof a.score !== 'number' || a.score < 7).map(a => a.question);
  return weak.length ? weak : answers.map(a => a.question);
};
