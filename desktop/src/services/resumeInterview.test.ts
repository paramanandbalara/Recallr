import { describe, expect, it } from 'vitest';
import {
  estimateListeningMinutes, hasUsableResume, levelFromResume, levelFromYears, levelHeading, normalizeLevel, parseResumeInterview,
  questionsToRetry, statedYears, whatToWorkOn,
} from './resumeInterview';

describe('parseResumeInterview', () => {
  const good = JSON.stringify({
    role: 'Backend engineer', level: 'mid', years: 4,
    questions: [
      { q: 'Tell me about yourself and your work at Acme.', kind: 'about-you' },
      { q: 'In OrderHub, why did you choose Kafka over RabbitMQ?', kind: 'project' },
      { q: 'How does indexing work in PostgreSQL?', kind: 'skill' },
      { q: 'Tell me about a time you disagreed with a teammate.', kind: 'behavioural' },
      { q: 'What would you do if production went down during a release?', kind: 'situational' },
    ],
  });

  it('reads role, level and questions with their kinds', () => {
    const result = parseResumeInterview(good, 8);
    expect(result.role).toBe('Backend engineer');
    expect(result.level).toBe('mid');
    expect(result.questions).toHaveLength(5);
    expect(result.questions.map(q => q.kind)).toEqual(['about-you', 'project', 'skill', 'behavioural', 'situational']);
  });

  it('keeps at most the asked count', () => {
    expect(parseResumeInterview(good, 3).questions).toHaveLength(3);
  });

  it('copes with code fences, text around the JSON, plain strings and other key names', () => {
    const raw = 'Here you go:\n```json\n{"role":"a data analyst.","level":"Senior / Lead","questions":["1. Walk me through your dashboard project at Flipkart?", {"question":"\\"What is a window function?\\"","type":"Technical"}]}\n```';
    const result = parseResumeInterview(raw, 6);
    expect(result.role).toBe('data analyst');
    expect(result.level).toBe('senior');
    expect(result.questions.map(q => q.question)).toEqual(['Walk me through your dashboard project at Flipkart?', 'What is a window function?']);
    expect(result.questions[1].kind).toBe('skill');
  });

  it('accepts a bare array of questions', () => {
    expect(parseResumeInterview('["Tell me about your final-year project.", "Why Python for it?"]', 5).questions).toHaveLength(2);
  });

  it('drops repeats, empty and junk items', () => {
    const raw = JSON.stringify({ questions: ['Tell me about yourself.', 'tell me about yourself', '', 42, null, { q: '' }, { kind: 'skill' }, 'Why?'] });
    expect(parseResumeInterview(raw, 8).questions.map(q => q.question)).toEqual(['Tell me about yourself.']);
  });

  it('never throws on broken output', () => {
    for (const raw of ['', 'not json', '{"questions": [', 'null', '42', '{"questions": "Tell me about yourself"}']) {
      expect(parseResumeInterview(raw, 5)).toEqual({ role: '', level: null, questions: [] });
    }
  });

  it('works out the level from years, then from the resume, when the AI gives no level', () => {
    expect(parseResumeInterview('{"years": 8, "questions": []}', 5).level).toBe('senior');
    expect(parseResumeInterview('{"years": "2", "questions": []}', 5).level).toBe('junior');
    expect(parseResumeInterview('{"level": "?", "questions": []}', 5, 'Java developer with 4 years of experience').level).toBe('mid');
    expect(parseResumeInterview('{"level": "?", "questions": []}', 5, 'B.Tech student').level).toBeNull();
  });

  it('drops an unknown role', () => {
    expect(parseResumeInterview('{"role": "Unknown", "questions": []}', 5).role).toBe('');
  });
});

describe('experience level', () => {
  it('maps years to a level', () => {
    expect([0, 0.5, 1, 2.9, 3, 6, 7, 15].map(levelFromYears)).toEqual(['fresher', 'fresher', 'junior', 'junior', 'mid', 'mid', 'senior', 'senior']);
  });

  it('normalizes what the AI wrote', () => {
    expect(normalizeLevel('Fresher')).toBe('fresher');
    expect(normalizeLevel('entry-level')).toBe('fresher');
    expect(normalizeLevel('Junior')).toBe('junior');
    expect(normalizeLevel('mid-level')).toBe('mid');
    expect(normalizeLevel('Staff engineer')).toBe('senior');
    expect(normalizeLevel('')).toBeNull();
    expect(normalizeLevel(3)).toBeNull();
  });

  it('reads the years a resume states, and freshers', () => {
    expect(statedYears('Backend developer with 5+ years of experience in Go. 2 years experience leading.')).toBe(5);
    expect(statedYears('3.5 yrs professional experience')).toBe(3.5);
    expect(statedYears('Worked on 3 projects')).toBeNull();
    expect(levelFromResume('Fresher, B.Tech CSE 2025, seeking my first role')).toBe('fresher');
    expect(levelFromResume('Software engineer at Infosys')).toBeNull();
  });

  it('writes the heading', () => {
    expect(levelHeading('mid', 'backend engineer')).toBe('Questions for a mid-level backend engineer');
    expect(levelHeading('senior', '')).toBe('Questions for a senior candidate');
    expect(levelHeading(null, 'data analyst')).toBe('Questions for your role: data analyst');
    expect(levelHeading(null, '')).toBe('Questions from your resume');
  });
});

describe('resume check and plan estimate', () => {
  it('needs a real resume', () => {
    expect(hasUsableResume('')).toBe(false);
    expect(hasUsableResume('   John   ')).toBe(false);
    expect(hasUsableResume('Experience '.repeat(20))).toBe(true);
  });

  it('estimates listening minutes from questions × a typical answer', () => {
    expect(estimateListeningMinutes(6)).toBe(9);
    expect(estimateListeningMinutes(5)).toBe(8); // 7.5 rounded up
    expect(estimateListeningMinutes(8, 60)).toBe(8);
    expect(estimateListeningMinutes(0)).toBe(1);
  });
});

describe('after the test', () => {
  const speaking = (seconds: number, wordsPerMinute: number | null, fillers: number) => ({ seconds, wordsPerMinute, fillers });

  it('lists the weakest answers first, then skips and speaking habits', () => {
    const items = whatToWorkOn([
      { question: 'Q1', answer: 'a', score: 6, improve: 'Add a result.', speaking: speaking(20, 90, 4) },
      { question: 'Q2', answer: 'b', score: 3, improve: 'Answer the question asked.', speaking: speaking(25, 100, 5) },
      { question: 'Q3', answer: 'c', score: 9, improve: 'Fine.', speaking: speaking(20, 95, 3) },
      { question: 'Q4', answer: '' },
    ], undefined, 10);
    expect(items[0]).toBe('“Q2”: Answer the question asked.');
    expect(items[1]).toBe('“Q1”: Add a result.');
    expect(items.some(i => i.includes('skipped 1 question'))).toBe(true);
    expect(items.some(i => i.startsWith('Speak a little faster'))).toBe(true);
    expect(items.some(i => i.startsWith('Cut the filler words'))).toBe(true);
    expect(items.some(i => i.startsWith('Give fuller answers'))).toBe(true);
  });

  it('keeps the list short and still says something after a strong round', () => {
    expect(whatToWorkOn([{ question: 'Q', answer: 'a', score: 9, speaking: speaking(60, 140, 0) }])).toHaveLength(1);
    expect(whatToWorkOn([])).toEqual([]);
  });

  it('retries the weak and skipped questions, or all when everything went well', () => {
    expect(questionsToRetry([
      { question: 'Q1', answer: 'a', score: 8 },
      { question: 'Q2', answer: 'b', score: 5 },
      { question: 'Q3', answer: '' },
    ])).toEqual(['Q2', 'Q3']);
    expect(questionsToRetry([{ question: 'Q1', answer: 'a', score: 8 }])).toEqual(['Q1']);
  });
});
