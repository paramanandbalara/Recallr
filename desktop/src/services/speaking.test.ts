import { describe, expect, it } from 'vitest';
import { analyzeSpeech } from './speaking';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('analyzeSpeech', () => {
  it('works out the pace', () => {
    expect(analyzeSpeech(words(140), 60).wordsPerMinute).toBe(140);
    expect(analyzeSpeech(words(5), 4).wordsPerMinute).toBeNull(); // Too short to judge
  });

  it('counts fillers but not the same words used normally', () => {
    const result = analyzeSpeech('Um, so I, uh, led the team. Like, we had, like, three weeks. I would like to add that you know what matters. You know, basically it worked. Hmm.', 40);
    expect(Object.fromEntries(result.fillerWords.map(f => [f.word, f.count]))).toEqual({ um: 1, uh: 1, like: 2, 'you know': 1, basically: 1, hmm: 1 });
    expect(result.fillers).toBe(7);
  });

  it('notes pace, fillers and length to work on', () => {
    expect(analyzeSpeech(words(200), 60).notes[0]).toMatch(/fast/);
    expect(analyzeSpeech(words(60), 60).notes[0]).toMatch(/slow/);
    expect(analyzeSpeech(`${words(30)} um um uh like, like, um`, 20).notes.join(' ')).toMatch(/filler words.*Short answer/s);
    expect(analyzeSpeech(words(400), 180).notes.join(' ')).toMatch(/Long answer \(3:00\)/);
    expect(analyzeSpeech(words(140), 60).notes).toEqual([]);
  });
});
