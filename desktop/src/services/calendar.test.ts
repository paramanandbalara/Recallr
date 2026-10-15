import { describe, expect, it } from 'vitest';
import { fromLocalInput, nextAction, toLocalInput, upcoming, whenText, type Interview } from './calendar';

const at = (s: string) => new Date(s).getTime(); // Local time
const interview = (startsAt: string, extra: Partial<Interview> = {}): Interview => ({
  id: startsAt, profileId: 'p1', title: 'Northwind', startsAt: at(startsAt), notes: '', ...extra,
});

describe('interview calendar', () => {
  it('offers the prep pack from the day before, until an hour before', () => {
    const list = [interview('2026-10-20T10:00')];
    expect(nextAction(list, at('2026-10-18T22:00'))).toBeNull();
    expect(nextAction(list, at('2026-10-19T00:05'))).toEqual({ kind: 'prep', interview: list[0] });
    expect(nextAction(list, at('2026-10-20T08:30'))?.kind).toBe('prep');
    expect(nextAction(list, at('2026-10-20T09:05'))).toBeNull();
    expect(nextAction([{ ...list[0], prepOffered: true }], at('2026-10-19T18:00'))).toBeNull();
  });

  it('offers it for an interview added the same day', () => {
    expect(nextAction([interview('2026-10-20T18:00')], at('2026-10-20T09:00'))?.kind).toBe('prep');
  });

  it('switches the profile shortly before, once', () => {
    const list = [interview('2026-10-20T10:00', { prepOffered: true })];
    expect(nextAction(list, at('2026-10-20T09:10'))).toBeNull();
    expect(nextAction(list, at('2026-10-20T09:20'))).toEqual({ kind: 'switch', interview: list[0] });
    expect(nextAction(list, at('2026-10-20T10:50'))?.kind).toBe('switch'); // App opened late
    expect(nextAction(list, at('2026-10-20T11:30'))).toBeNull();
    expect(nextAction([{ ...list[0], switched: true }], at('2026-10-20T09:30'))).toBeNull();
  });

  it('switching wins over a prep offer for another interview', () => {
    const list = [interview('2026-10-21T10:00'), interview('2026-10-20T10:00', { prepOffered: true })];
    expect(nextAction(list, at('2026-10-20T09:30'))?.interview.id).toBe('2026-10-20T10:00');
    expect(nextAction(list, at('2026-10-20T12:00'))?.interview.id).toBe('2026-10-21T10:00');
  });

  it('lists upcoming interviews soonest first and drops old ones', () => {
    const list = [interview('2026-10-25T10:00'), interview('2026-10-20T10:00'), interview('2026-10-10T10:00')];
    expect(upcoming(list, at('2026-10-20T12:00')).map(i => i.id)).toEqual(['2026-10-20T10:00', '2026-10-25T10:00']);
  });

  it('says today and tomorrow', () => {
    expect(whenText(at('2026-10-20T10:00'), at('2026-10-20T08:00')).day).toBe('today');
    expect(whenText(at('2026-10-21T00:30'), at('2026-10-20T23:00')).day).toBe('tomorrow');
    expect(whenText(at('2026-10-23T10:00'), at('2026-10-20T08:00')).day).not.toMatch(/today|tomorrow/);
  });

  it('round-trips the date input', () => {
    const value = toLocalInput(at('2026-10-20T09:05'));
    expect(value).toBe('2026-10-20T09:05');
    expect(fromLocalInput(value)).toBe(at('2026-10-20T09:05'));
    expect(fromLocalInput('')).toBeNull();
  });
});
