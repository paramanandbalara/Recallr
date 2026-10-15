import { describe, expect, it } from 'vitest';
import { isEcho } from './echo';

const call = (secondsAgo: number) => [{ text: 'Can you tell me about a time you handled a production outage?', at: Date.now() - secondsAgo * 1000 }];

describe('isEcho', () => {
  it('drops the mic hearing what the call just said', () => {
    expect(isEcho('tell me about a time you handled a production outage', call(3))).toBe(true);
  });

  it('keeps the user’s own answer, even when it reuses a few of the question’s words', () => {
    expect(isEcho('Last year our payments service went down during a sale', call(3))).toBe(false);
    expect(isEcho('a production outage, so we had one in the payments service', call(3))).toBe(false);
  });

  it('ignores call speech older than the echo window', () => {
    expect(isEcho('tell me about a time you handled a production outage', call(20))).toBe(false);
  });
});
