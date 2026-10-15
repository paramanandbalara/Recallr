import { describe, expect, it } from 'vitest';
import type { Turn } from '../components/ConversationFeed';
import { parseReplayFeedback, replayBaseline, replayQuestions, scoreChange, wasSpoken } from './answerReplay';

const turn = (id: string, question: string, spoken?: string, status: Turn['status'] = 'done'): Turn => ({ id, question, answer: 'Suggested.', status, spoken });

describe('answer replay questions', () => {
  it('lists the real questions once, the ones with something said first', () => {
    const questions = replayQuestions([
      turn('a', 'Tell me about yourself please.'),
      turn('b', 'Why did you choose Kafka for the events?', 'We needed replay and the team already knew it well.'),
      turn('c', 'Okay.', 'yes'), // Not a question
      turn('d', 'tell me about yourself, please', 'I am a backend engineer with four years in fintech.'), // A repeat
      turn('e', 'What would you do if a release broke payments?', undefined, 'skipped'),
      turn('f', 'How do you handle a disagreement in your team?', 'umm yes'), // Too short to judge
    ]);
    expect(questions).toEqual([
      { turnId: 'b', question: 'Why did you choose Kafka for the events?', spoken: 'We needed replay and the team already knew it well.' },
      { turnId: 'a', question: 'Tell me about yourself please.', spoken: '' },
      { turnId: 'f', question: 'How do you handle a disagreement in your team?', spoken: '' },
    ]);
    expect(replayQuestions([turn('a', 'Tell me about yourself please.')], 0)).toEqual([]);
    expect(wasSpoken('one two three four')).toBe(true);
    expect(wasSpoken(undefined)).toBe(false);
  });
});

describe('stronger versions', () => {
  const questions = [
    { turnId: 'a', question: 'Q one is here?', spoken: 'I said this.' },
    { turnId: 'b', question: 'Q two is here?', spoken: 'And this.' },
  ];

  it('matches each entry back by its number, in any order', () => {
    const feedback = parseReplayFeedback('```json\n{"answers":[{"n":2,"score":4,"good":"Honest.","fix":"Add a number.","better":"Better two."},{"n":1,"score":"8","good":"Clear.","improve":"Shorter.","better":"Better one."}]}\n```', questions);
    expect(feedback).toEqual([
      { score: 8, good: 'Clear.', fix: 'Shorter.', better: 'Better one.' },
      { score: 4, good: 'Honest.', fix: 'Add a number.', better: 'Better two.' },
    ]);
  });

  it('uses the order when numbers are missing, and skips unusable entries', () => {
    expect(parseReplayFeedback('{"answers":[{"score":20,"better":"B1"},{"score":3}]}', questions)).toEqual([
      { score: 10, good: '', fix: '', better: 'B1' },
      undefined,
    ]);
    expect(parseReplayFeedback('nothing useful', questions)).toEqual([undefined, undefined]);
  });

  it('gives the mock interview a baseline and shows the change', () => {
    expect(replayBaseline([{ ...questions[0], feedback: { score: 5, good: '', fix: '', better: 'x' } }, questions[1]])).toEqual([
      { question: 'Q one is here?', said: 'I said this.', score: 5 },
      { question: 'Q two is here?', said: 'And this.', score: undefined },
    ]);
    expect(scoreChange(5, 8)).toBe('+3');
    expect(scoreChange(7, 4)).toBe('−3');
    expect(scoreChange(6, 6)).toBe('±0');
    expect(scoreChange(undefined, 6)).toBeNull();
  });
});
