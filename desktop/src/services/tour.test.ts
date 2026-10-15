import { describe, expect, it } from 'vitest';
import { HI } from '../i18n.hi';
import { placeCard, spotlightRect, TOUR_STEPS } from './tour';

const view = { w: 400, h: 600 };
const card = { w: 288, h: 140 };

describe('tour layout', () => {
  it('puts the card under a control near the top, pointing at it', () => {
    const hole = { x: 10, y: 6, w: 80, h: 28 };
    const place = placeCard(hole, card, view);
    expect(place.below).toBe(true);
    expect(place.top).toBe(6 + 28 + 10);
    expect(place.left).toBe(8); // Kept inside the window
    expect(place.arrow).toBe(50 - 8);
  });

  it('puts the card above a control near the bottom', () => {
    const place = placeCard({ x: 300, y: 560, w: 30, h: 30 }, card, view);
    expect(place.below).toBe(false);
    expect(place.top).toBe(560 - 10 - 140);
    expect(place.left + card.w).toBe(400 - 8);
    expect(place.arrow).toBeLessThanOrEqual(card.w - 16);
  });

  it('stays inside a very small window', () => {
    const small = { w: 300, h: 200 };
    const place = placeCard({ x: 100, y: 80, w: 40, h: 30 }, { w: 284, h: 150 }, small);
    expect(place.top).toBeGreaterThanOrEqual(8);
    expect(place.left).toBeGreaterThanOrEqual(8);
    expect(place.left + 284).toBeLessThanOrEqual(300 - 8);
  });

  it('centres the card when the control isn’t shown', () => {
    expect(placeCard(null, card, view)).toEqual({ left: 56, top: 230, arrow: null, below: true });
  });

  it('pads the highlight and keeps it in the window; hidden controls have none', () => {
    expect(spotlightRect({ left: 0, top: 0, right: 50, bottom: 20 }, view)).toEqual({ x: 2, y: 2, w: 53, h: 23 });
    expect(spotlightRect({ left: 100, top: 100, right: 100, bottom: 100 }, view)).toBeNull();
  });
});

describe('tour text', () => {
  it('has Hindi for every step', () => {
    for (const step of TOUR_STEPS) {
      expect(HI[step.title], step.title).toBeTruthy();
      expect(HI[step.body], step.body).toBeTruthy();
    }
  });
});
