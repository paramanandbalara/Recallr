import { describe, expect, it } from 'vitest';
import { REMIND_LATER_MS, updateToOffer, type VersionInfo } from './account';

const info = (latest: string | null, minimum: string | null = null): VersionInfo =>
  ({ latest, minimum, notes: '', downloads: { windows: '', mac: '' } });
const NOW = 1_800_000_000_000;

describe('updateToOffer', () => {
  it('offers a newer version', () => {
    expect(updateToOffer('1.0.0', info('1.1.0'), null, NOW)).toBe('1.1.0');
    expect(updateToOffer('1.9.3', info('1.10.0'), null, NOW)).toBe('1.10.0');
  });

  it('offers nothing when up to date or nothing is published', () => {
    expect(updateToOffer('1.1.0', info('1.1.0'), null, NOW)).toBeNull();
    expect(updateToOffer('1.2.0', info('1.1.0'), null, NOW)).toBeNull();
    expect(updateToOffer('1.0.0', info(null), null, NOW)).toBeNull();
    expect(updateToOffer('1.0.0', null, null, NOW)).toBeNull();
  });

  it('waits after "Remind me later", then asks again', () => {
    const snooze = { version: '1.1.0', until: NOW + REMIND_LATER_MS };
    expect(updateToOffer('1.0.0', info('1.1.0'), snooze, NOW)).toBeNull();
    expect(updateToOffer('1.0.0', info('1.1.0'), snooze, NOW + REMIND_LATER_MS + 1)).toBe('1.1.0');
  });

  it('offers a version newer than the one put off right away', () => {
    const snooze = { version: '1.1.0', until: NOW + REMIND_LATER_MS };
    expect(updateToOffer('1.0.0', info('1.2.0'), snooze, NOW)).toBe('1.2.0');
  });
});
