import { describe, expect, it } from 'vitest';
import { pickEnglishVoice } from './voice';

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService });

describe('pickEnglishVoice', () => {
  it('prefers a natural English voice over novelty and robotic ones', () => {
    const voices = [voice('Lekha', 'hi-IN'), voice('Zarvox', 'en-US'), voice('Bubbles', 'en-US'), voice('Samantha', 'en-US'), voice('Fred', 'en-US')];
    expect(pickEnglishVoice(voices)?.name).toBe('Samantha');
  });

  it('prefers installed voices, and "Natural" ones', () => {
    expect(pickEnglishVoice([voice('Google US English', 'en-US', false), voice('Microsoft Zira', 'en-US')])?.name).toBe('Microsoft Zira');
    expect(pickEnglishVoice([voice('Microsoft David', 'en-US'), voice('Microsoft Aria Online (Natural)', 'en-US')])?.name).toBe('Microsoft Aria Online (Natural)');
  });

  it('takes any English voice before none, and never a non-English one', () => {
    expect(pickEnglishVoice([voice('English (America)+espeak', 'en_US')])?.name).toBe('English (America)+espeak');
    expect(pickEnglishVoice([voice('Lekha', 'hi-IN')])).toBeNull();
    expect(pickEnglishVoice([])).toBeNull();
  });
});
