import { describe, expect, it } from 'vitest';
import { HI } from './i18n.hi';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('Hindi text', () => {
  it('keeps every {placeholder} of the English', () => {
    for (const [english, hindi] of Object.entries(HI)) expect(placeholders(hindi), english).toEqual(placeholders(english));
  });

  it('is written in Hindi (Devanagari), not left empty', () => {
    for (const [english, hindi] of Object.entries(HI)) {
      expect(hindi.trim(), english).not.toBe('');
      if (/[a-z]{3}/i.test(english.replace(/\{\w+\}|Recallr|AI|PDF|URL|STAR|Groq|OpenAI|Claude|Whisper/g, ''))) expect(hindi, english).toMatch(/[ऀ-ॿ]/);
    }
  });
});

// Every t('...') in the code has its Hindi (run with the file name to see what's missing where)
describe('every translated text has Hindi', () => {
  it('finds a Hindi entry for each t() call', () => {
    const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.ts', '!./locales/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const missing: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
        const key = match[2].replace(/\\(['"\\])/g, '$1');
        if (!(key in HI)) missing.push(`${file.slice(2)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
