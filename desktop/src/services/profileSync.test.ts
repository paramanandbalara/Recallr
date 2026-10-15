import { describe, expect, it } from 'vitest';
import { debounceDelay, hashText, planSync, retryDelay } from './profileSync';
import type { Profile } from './storage';

const profile = (id: string, overrides: Partial<Profile> = {}): Profile => ({
  id, name: id, cv: 'resume', cvFileName: 'cv.pdf', job: '', company: '', companyNotes: '', interviewer: '', knowledge: [],
  language: 'en', answerLanguage: 'same', answers: [], stories: [], ...overrides,
});
const hashOf = (p: Profile) => hashText(JSON.stringify(p));

describe('hashText', () => {
  it('is the same for the same text and different when anything changes', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
    expect(hashText('')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('planSync', () => {
  it('sends profiles never sent, and those that changed since', () => {
    const a = profile('a');
    const b = profile('b');
    const { upload, remove } = planSync([a, b], { a: hashOf(a), b: 'old' });
    expect(upload.map(u => u.id)).toEqual(['b']);
    expect(JSON.parse(upload[0].body)).toEqual(b);
    expect(upload[0].hash).toBe(hashOf(b));
    expect(remove).toEqual([]);
    expect(planSync([a, b], {}).upload.map(u => u.id)).toEqual(['a', 'b']);
  });

  it('sends nothing when nothing changed', () => {
    const a = profile('a');
    expect(planSync([a], { a: hashOf(a) })).toEqual({ upload: [], remove: [] });
  });

  it('deletes profiles it sent that are gone from this computer, and leaves others alone', () => {
    const a = profile('a');
    const { remove } = planSync([a], { a: hashOf(a), gone: 'x' });
    expect(remove).toEqual(['gone']);
  });

  it('skips profiles with a request in flight, and ones the server refused until they change', () => {
    const a = profile('a');
    const b = profile('b');
    expect(planSync([a, b], {}, {}, new Set(['a'])).upload.map(u => u.id)).toEqual(['b']);
    expect(planSync([a], { gone: 'x' }, {}, new Set(['gone'])).remove).toEqual([]);
    expect(planSync([a], {}, { a: hashOf(a) }).upload).toEqual([]);
    const changed = { ...a, cv: 'new resume' };
    expect(planSync([changed], {}, { a: hashOf(a) }).upload.map(u => u.id)).toEqual(['a']);
  });
});

describe('timing', () => {
  it('waits 5 s after the last change, but at most 30 s after the first', () => {
    expect(debounceDelay(1000, 1000)).toBe(5000);
    expect(debounceDelay(20_000, 0)).toBe(5000);
    expect(debounceDelay(28_000, 0)).toBe(2000);
    expect(debounceDelay(40_000, 0)).toBe(0);
  });

  it('backs off after failures, up to 15 minutes', () => {
    expect(retryDelay(1)).toBe(30_000);
    expect(retryDelay(2)).toBe(60_000);
    expect(retryDelay(3)).toBe(120_000);
    expect(retryDelay(20)).toBe(15 * 60_000);
  });
});
