import { describe, expect, it } from 'vitest';
import { stripPromptEcho } from './transcribe';

describe('stripPromptEcho', () => {
  it.each([
    ['Transcribe accurately. Transcribe.', ''],
    ['This is a corporate job interview. Transcribe accurately.', ''],
    ['Hello. Can you tell me about yourself? Transcribe accurately.', 'Hello. Can you tell me about yourself?'],
    ['Transcribe to the question. Tons are not a good idea.', 'Tons are not a good idea.'],
  ])('removes the echoed prompt: %s', (input, expected) => expect(stripPromptEcho(input)).toBe(expected));

  it('keeps real speech that mentions transcribing', () => {
    expect(stripPromptEcho('We had to transcribe the call logs into our CRM.')).toBe('We had to transcribe the call logs into our CRM.');
  });
});
