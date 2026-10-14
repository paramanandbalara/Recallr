import { describe, expect, it } from 'vitest';
import { scoreAnswer } from './answerScore';
import { cleanAnswer } from './cleanAnswer';

describe('scoreAnswer', () => {
  it('gives plain spoken answers a high score', () => {
    const answer = "It's a really fast store that keeps data in memory. If the app needs the same thing again and again, it gets it from Redis. So pages load a lot faster.";
    expect(scoreAnswer(answer)).toEqual({ score: 10, issues: [] });
  });

  it('marks long sentences, hard words and AI phrases', () => {
    const answer = 'Furthermore, the implementation demonstrated considerable interoperability characteristics, facilitating comprehensive standardization across heterogeneous infrastructure while simultaneously maximizing organizational throughput and operational sustainability for every stakeholder involved in the initiative.';
    const result = scoreAnswer(answer);
    expect(result.score).toBeLessThanOrEqual(4);
    expect(result.issues.join(' ')).toMatch(/long/);
    expect(result.issues.join(' ')).toMatch(/Hard words/);
    expect(result.issues.join(' ')).toMatch(/written, not spoken/);
  });

  it("doesn't count code or words the interviewer used", () => {
    const answer = "I'd loop once and count each character.\n```python\ndef first_unique_character_implementation(s): pass\n```\nThat's linear time.";
    expect(scoreAnswer(answer).score).toBe(10);
    expect(scoreAnswer('We keep authentication simple. The authentication token lives in a cookie and the server checks it on every request.', 'How does authentication work?').issues).toEqual([]);
  });
});

describe('cleanAnswer plain words', () => {
  it('swaps hard-to-say words for short ones', () => {
    expect(cleanAnswer('It took approximately two weeks, and subsequently we demonstrated it. Therefore we shipped.'))
      .toBe('It took about two weeks, and then we showed it. So we shipped.');
  });
});
