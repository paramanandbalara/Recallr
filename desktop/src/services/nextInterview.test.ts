import { describe, expect, it } from 'vitest';
import type { Interview } from './calendar';
import { chipRefreshMs, chipTimeText, nextInterviewWithin } from './nextInterview';

const at = (s: string) => new Date(s).getTime(); // Local time
const interview = (id: string, startsAt: string): Interview => ({ id, profileId: 'p1', title: id, startsAt: at(startsAt), notes: '' });
const NOW = at('2026-10-15T09:00'); // A Thursday
const time = (s: string) => new Date(at(s)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

describe('nextInterviewWithin', () => {
  it('is the soonest interview in the coming week', () => {
    const list = [interview('later', '2026-10-18T10:00'), interview('soon', '2026-10-16T10:30'), interview('past', '2026-10-14T10:00')];
    expect(nextInterviewWithin(list, NOW)?.id).toBe('soon');
  });

  it('is nothing when the next one is more than 7 days away, or there are none', () => {
    expect(nextInterviewWithin([interview('far', '2026-10-22T10:00')], NOW)).toBeNull();
    expect(nextInterviewWithin([interview('week', '2026-10-22T08:59')], NOW)?.id).toBe('week');
    expect(nextInterviewWithin([], NOW)).toBeNull();
  });

  it('keeps one that just started for a few minutes', () => {
    expect(nextInterviewWithin([interview('started', '2026-10-15T08:50')], NOW)?.id).toBe('started');
    expect(nextInterviewWithin([interview('over', '2026-10-15T08:30')], NOW)).toBeNull();
  });
});

describe('chipTimeText', () => {
  it('counts down the minutes in the last hour', () => {
    expect(chipTimeText(at('2026-10-15T09:45'), NOW, 'en-GB')).toBe('in 45 min');
    expect(chipTimeText(at('2026-10-15T09:00:20'), NOW, 'en-GB')).toBe('in 1 min');
    expect(chipTimeText(at('2026-10-15T09:59'), NOW, 'en-GB')).toBe('in 59 min');
  });

  it('says Now once it has started', () => {
    expect(chipTimeText(NOW, NOW, 'en-GB')).toBe('Now');
    expect(chipTimeText(at('2026-10-15T08:55'), NOW, 'en-GB')).toBe('Now');
  });

  it('gives the day and time further out', () => {
    expect(chipTimeText(at('2026-10-15T14:00'), NOW, 'en-GB')).toBe(`Today ${time('2026-10-15T14:00')}`);
    expect(chipTimeText(at('2026-10-16T10:30'), NOW, 'en-GB')).toBe(`Tomorrow ${time('2026-10-16T10:30')}`);
    expect(chipTimeText(at('2026-10-16T10:30'), NOW, 'en-GB')).toBe('Tomorrow 10:30');
    expect(chipTimeText(at('2026-10-17T09:00'), NOW, 'en-GB')).toBe('Sat 09:00');
  });

  it('counts calendar days, not 24-hour periods', () => {
    expect(chipTimeText(at('2026-10-16T00:30'), at('2026-10-15T22:00'), 'en-GB')).toBe('Tomorrow 00:30');
  });
});

describe('chipRefreshMs', () => {
  it('ticks every minute near the interview and every few minutes otherwise', () => {
    expect(chipRefreshMs(NOW + 30 * 60_000, NOW)).toBe(60_000);
    expect(chipRefreshMs(NOW + 30 * 60_000, NOW + 15_000)).toBe(45_000);
    expect(chipRefreshMs(NOW + 2 * 24 * 3600_000, NOW)).toBe(5 * 60_000);
    expect(chipRefreshMs(null, NOW)).toBe(5 * 60_000);
  });
});
