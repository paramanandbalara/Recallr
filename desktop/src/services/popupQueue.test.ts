import { describe, expect, it } from 'vitest';
import { hasTurn, type PopupId } from './popupQueue';

describe('one popup at a time', () => {
  it('lets the most important waiting popup show, and the rest wait', () => {
    const all = new Set<PopupId>(['tour', 'profile-copy', 'calendar']);
    expect(hasTurn('profile-copy', all)).toBe(true);
    expect(hasTurn('tour', all)).toBe(false);
    expect(hasTurn('calendar', all)).toBe(false);
    expect(hasTurn('tour', new Set<PopupId>(['tour', 'calendar']))).toBe(true);
    expect(hasTurn('update', new Set<PopupId>(['tour']))).toBe(false); // Doesn't want to show
  });
});
