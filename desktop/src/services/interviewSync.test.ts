import { describe, expect, it } from 'vitest';
import type { Interview } from './calendar';
import { hashText } from './profileSync';
import { interviewPayload, planInterviewSync, SYNC_PAST_DAYS } from './interviewSync';

const NOW = new Date('2026-10-15T09:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;
const interview = (id: string, overrides: Partial<Interview> = {}): Interview => ({
  id, profileId: 'p1', title: 'Northwind – system design', startsAt: NOW + 24 * HOUR, notes: '', ...overrides,
});
const hashOf = (i: Interview) => hashText(JSON.stringify(interviewPayload(i)));

describe('interviewPayload', () => {
  it('sends what the account needs, not the app’s own flags', () => {
    const i = interview('a', { notes: 'Zoom link', prepOffered: true, switched: true });
    expect(interviewPayload(i)).toEqual({ title: 'Northwind – system design', startsAt: '2026-10-16T09:00:00.000Z', profileClientId: 'p1', notes: 'Zoom link' });
  });

  it('fits the server’s limits', () => {
    const p = interviewPayload(interview('a', { title: '  ', notes: 'n'.repeat(2000), profileId: 'not a valid id!' }));
    expect(p.title).toBe('Interview');
    expect(p.notes).toHaveLength(1000);
    expect(p.profileClientId).toBe('');
    expect(interviewPayload(interview('a', { title: 'x'.repeat(300) })).title).toHaveLength(200);
  });
});

describe('planInterviewSync', () => {
  it('sends interviews never sent, and those that changed since', () => {
    const a = interview('a');
    const b = interview('b');
    const { upload, remove } = planInterviewSync([a, b], { a: hashOf(a), b: 'old' }, NOW);
    expect(upload.map(u => u.id)).toEqual(['b']);
    expect(JSON.parse(upload[0].body)).toEqual(interviewPayload(b));
    expect(upload[0].hash).toBe(hashOf(b));
    expect(remove).toEqual([]);
    expect(planInterviewSync([a, b], {}, NOW).upload.map(u => u.id)).toEqual(['a', 'b']);
  });

  it('sends a moved or renamed interview again, but not when only the reminders’ flags change', () => {
    const a = interview('a');
    const sent = { a: hashOf(a) };
    expect(planInterviewSync([{ ...a, prepOffered: true, switched: true }], sent, NOW).upload).toEqual([]);
    expect(planInterviewSync([{ ...a, startsAt: a.startsAt + HOUR }], sent, NOW).upload.map(u => u.id)).toEqual(['a']);
    expect(planInterviewSync([{ ...a, title: 'Northwind – final' }], sent, NOW).upload.map(u => u.id)).toEqual(['a']);
  });

  it('deletes interviews it sent that were removed here, and leaves other computers’ alone', () => {
    const a = interview('a');
    const { upload, remove } = planInterviewSync([a], { a: hashOf(a), gone: 'x' }, NOW);
    expect(upload).toEqual([]);
    expect(remove).toEqual(['gone']);
  });

  it('doesn’t send old interviews, and doesn’t delete them from the account either', () => {
    const old = interview('old', { startsAt: NOW - (SYNC_PAST_DAYS + 1) * 24 * HOUR });
    const recent = interview('recent', { startsAt: NOW - 2 * 24 * HOUR });
    const { upload, remove } = planInterviewSync([old, recent], { old: 'whatever' }, NOW);
    expect(upload.map(u => u.id)).toEqual(['recent']);
    expect(remove).toEqual([]);
  });

  it('skips requests in flight, ids the server wouldn’t take, and ones it refused until they change', () => {
    const a = interview('a');
    const b = interview('b');
    expect(planInterviewSync([a, b], {}, NOW, {}, new Set(['a'])).upload.map(u => u.id)).toEqual(['b']);
    expect(planInterviewSync([a], { gone: 'x' }, NOW, {}, new Set(['gone'])).remove).toEqual([]);
    expect(planInterviewSync([interview('bad id!')], {}, NOW).upload).toEqual([]);
    expect(planInterviewSync([a], {}, NOW, { a: hashOf(a) }).upload).toEqual([]);
    expect(planInterviewSync([{ ...a, notes: 'new' }], {}, NOW, { a: hashOf(a) }).upload.map(u => u.id)).toEqual(['a']);
  });
});
