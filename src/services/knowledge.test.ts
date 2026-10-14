import { describe, expect, it } from 'vitest';
import { relevantNotes } from './knowledge';

const files = [
  { id: '1', name: 'payments.md', text: 'Payments service\n\nWe retry failed card charges with Kafka and an idempotency key per order.\n\nRefunds go through a nightly batch job.' },
  { id: '2', name: 'infra.md', text: 'Our Redis cluster caches user sessions and rate limit counters.\n\nDeploys run on Kubernetes with Argo.' },
];

describe('relevantNotes', () => {
  it('picks the sections that match the question', () => {
    const notes = relevantNotes(files, 'How did you handle retries for card charges?');
    expect(notes).toContain('idempotency key');
    expect(notes).not.toContain('Kubernetes');
  });

  it('matches word forms (caches / cache)', () => {
    expect(relevantNotes(files, 'What did you cache in Redis?')).toContain('Redis cluster');
  });

  it('returns nothing when no section fits', () => {
    expect(relevantNotes(files, 'What is your notice period?')).toBe('');
  });
});
