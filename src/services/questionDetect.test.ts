import { describe, expect, it } from 'vitest';
import { isLikelyQuestion } from './questionDetect';

describe('isLikelyQuestion', () => {
  it.each([
    'Can you tell me about yourself?',
    'Walk me through your last project',
    'What is the event loop',
    "I'd like to hear about a time you disagreed with your manager",
  ])('answers real questions: %s', text => expect(isLikelyQuestion(text)).toBe(true));

  it.each(['example', 'Example?', 'Any example?', 'why?', 'tell me more', 'code?', 'And in Java?'])(
    'answers short follow-ups: %s',
    text => expect(isLikelyQuestion(text)).toBe(true),
  );

  it.each(['okay', 'yeah great thanks', 'hmm okay', 'Thank you.', 'Sorry, one second'])(
    'waits on filler: %s',
    text => expect(isLikelyQuestion(text)).toBe(false),
  );
});
