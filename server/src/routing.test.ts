import { describe, expect, it } from 'vitest';
import { createLatencyTracker, fastestFirst, hedgeDelay, raceProviders, type RaceAttempt } from './routing.js';

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); });
});

// A provider that starts writing after `startMs`, or fails after it
const provider = (name: string, startMs: number, log: string[], fail?: 'before' | 'during'): RaceAttempt<string> => ({
  provider: name,
  run: async (onText, signal) => {
    log.push(`${name} started`);
    try {
      await sleep(startMs, signal);
      if (fail === 'before') throw new Error(`${name} failed`);
      onText(`${name}-1 `);
      await sleep(10, signal);
      if (fail === 'during') throw new Error(`${name} broke`);
      onText(`${name}-2`);
      return `${name} done`;
    } catch (error) {
      log.push(`${name} stopped`);
      throw error;
    }
  },
});

const race = (attempts: RaceAttempt<string>[], hedge = true, delay = 50) => {
  const text: string[] = [];
  const promise = raceProviders(attempts, d => text.push(d), new AbortController().signal, { hedge, delayFor: () => delay });
  return { text, promise };
};

describe('raceProviders', () => {
  it('uses the first provider when it answers quickly', async () => {
    const log: string[] = [];
    const { text, promise } = race([provider('groq', 5, log), provider('claude', 5, log)]);
    expect((await promise).provider).toBe('groq');
    expect(text.join('')).toBe('groq-1 groq-2');
    expect(log).toEqual(['groq started']);
  });

  it('asks the next provider when the first is slow, and the first to write wins', async () => {
    const log: string[] = [];
    const { text, promise } = race([provider('groq', 400, log), provider('claude', 10, log)]);
    const result = await promise;
    expect(result.provider).toBe('claude');
    expect(text.join('')).toBe('claude-1 claude-2'); // Never mixed with the slow one
    expect(log).toEqual(['groq started', 'claude started', 'groq stopped']);
    expect(result.firstTextMs).toBeGreaterThanOrEqual(50);
  });

  it('moves straight on when a provider fails before answering', async () => {
    const log: string[] = [];
    const { promise } = race([provider('groq', 5, log, 'before'), provider('openai', 5, log)], false);
    expect((await promise).provider).toBe('openai');
  });

  it('fails rather than switching provider halfway through an answer', async () => {
    const log: string[] = [];
    const { promise } = race([provider('groq', 5, log, 'during'), provider('openai', 5, log)], false);
    await expect(promise).rejects.toThrow('groq broke');
  });

  it('reports the last error when every provider fails', async () => {
    const log: string[] = [];
    const { promise } = race([provider('groq', 5, log, 'before'), provider('openai', 5, log, 'before')]);
    await expect(promise).rejects.toThrow('openai failed');
  });

  it('stops everything when the app cancels', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    const promise = raceProviders([provider('groq', 300, log)], () => {}, controller.signal, { hedge: false, delayFor: () => 50 });
    setTimeout(() => controller.abort(), 20);
    await expect(promise).rejects.toThrow();
    await sleep(20);
    expect(log).toEqual(['groq started', 'groq stopped']);
  });
});

describe('choosing the fastest', () => {
  it('orders by measured speed, falling back to guesses and the admin order', () => {
    const tracker = createLatencyTracker();
    expect(fastestFirst(['groq', 'openai', 'claude'], tracker.estimate, { groq: 500, claude: 800, openai: 1000 })).toEqual(['groq', 'claude', 'openai']);
    tracker.record('claude', 300);
    tracker.record('groq', 900);
    expect(fastestFirst(['groq', 'openai', 'claude'], tracker.estimate)).toEqual(['claude', 'groq', 'openai']);
  });

  it('keeps a moving average and pushes failing providers down', () => {
    const tracker = createLatencyTracker();
    tracker.record('groq', 400);
    tracker.record('groq', 1400);
    expect(tracker.estimate('groq')).toBe(700); // 400·0.7 + 1400·0.3
    tracker.failed('groq');
    expect(tracker.estimate('groq')).toBeGreaterThan(1300);
  });

  it('waits a little longer than usual before asking a second provider', () => {
    expect(hedgeDelay(undefined)).toBe(1500);
    expect(hedgeDelay(200)).toBe(700);
    expect(hedgeDelay(1000)).toBe(1600);
    expect(hedgeDelay(5000)).toBe(2500);
  });
});
