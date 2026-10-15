// Speed first: answers come from whichever AI provider is fastest right now.
//
// Each provider's time to first words is measured on every answer (a moving average). The fastest one is asked
// first; if it hasn't started answering in a moment (it's slow or stuck right now), the next fastest is asked as
// well, and whichever starts first answers. The other is stopped at once, so it costs little. A provider that
// fails is skipped, and the next one is asked straight away.

export interface LatencyTracker {
  record: (key: string, ms: number) => void;
  failed: (key: string) => void;
  estimate: (key: string) => number | undefined;
}

const ALPHA = 0.3; // Weight of the newest measurement
const FAILURE_PENALTY_MS = 3000; // A failure counts as a slow answer, so a flaky provider drops down the list

export const createLatencyTracker = (): LatencyTracker => {
  const averages = new Map<string, number>();
  const update = (key: string, ms: number) => {
    const previous = averages.get(key);
    averages.set(key, previous === undefined ? ms : previous * (1 - ALPHA) + ms * ALPHA);
  };
  return {
    record: update,
    failed: key => update(key, Math.max(FAILURE_PENALTY_MS, (averages.get(key) ?? 0) * 2)),
    estimate: key => averages.get(key),
  };
};

// Fastest first. Providers not measured yet keep their place from `order`, using `priors` as their guess.
export const fastestFirst = <P extends string>(order: P[], estimate: (provider: P) => number | undefined, priors: Partial<Record<P, number>> = {}) =>
  order
    .map((provider, i) => ({ provider, i, ms: estimate(provider) ?? priors[provider] ?? 1000 + i }))
    .sort((a, b) => a.ms - b.ms || a.i - b.i)
    .map(x => x.provider);

// How long to wait for the first words before also asking the next provider
export const hedgeDelay = (estimateMs: number | undefined) =>
  estimateMs === undefined ? 1500 : Math.min(2500, Math.max(700, estimateMs * 1.6));

export interface RaceAttempt<R> {
  provider: string;
  run: (onText: (delta: string) => void, signal: AbortSignal) => Promise<R>;
}

export interface RaceResult<R> {
  provider: string;
  result: R;
  firstTextMs: number;
}

// Runs `attempts` in order: each starts when the previous one fails, or (when `hedge` is on) when it hasn't
// written anything after `delayFor(provider)`. The first to write wins; the rest are stopped. Text from the
// loser never reaches `onText`, so an answer never mixes two providers.
export const raceProviders = <R>(
  attempts: RaceAttempt<R>[],
  onText: (delta: string, provider: string) => void,
  signal: AbortSignal,
  options: { hedge: boolean; delayFor: (provider: string) => number; onFirstText?: (provider: string, ms: number) => void; onFailure?: (provider: string, error: unknown) => void },
): Promise<RaceResult<R>> => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const running = new Map<string, AbortController>();
  let winner: string | null = null;
  let firstTextMs = 0;
  let next = 0;
  let finished = false;
  let lastError: unknown = new Error('No AI provider is available.');
  let hedgeTimer: ReturnType<typeof setTimeout> | null = null;

  const finish = (fn: () => void) => {
    if (finished) return;
    finished = true;
    if (hedgeTimer) clearTimeout(hedgeTimer);
    signal.removeEventListener('abort', onAbort);
    fn();
  };
  const stopOthers = (keep: string) => {
    for (const [provider, controller] of running) if (provider !== keep) controller.abort();
  };
  const onAbort = () => {
    for (const controller of running.values()) controller.abort();
    finish(() => reject(signal.reason ?? new Error('Cancelled')));
  };
  signal.addEventListener('abort', onAbort);

  const startNext = () => {
    if (finished || winner) return;
    if (hedgeTimer) clearTimeout(hedgeTimer);
    const attempt = attempts[next++];
    if (!attempt) {
      if (running.size === 0) finish(() => reject(lastError));
      return;
    }
    const controller = new AbortController();
    running.set(attempt.provider, controller);
    if (options.hedge && next < attempts.length) hedgeTimer = setTimeout(startNext, options.delayFor(attempt.provider));

    attempt.run(delta => {
      if (finished || (winner && winner !== attempt.provider)) return;
      if (!winner) {
        winner = attempt.provider;
        firstTextMs = Date.now() - startedAt;
        if (hedgeTimer) clearTimeout(hedgeTimer);
        stopOthers(winner);
        options.onFirstText?.(winner, firstTextMs);
      }
      onText(delta, attempt.provider);
    }, controller.signal).then(result => {
      running.delete(attempt.provider);
      if (winner === null) {
        // Finished without writing anything (an empty answer): it still answered first
        winner = attempt.provider;
        firstTextMs = Date.now() - startedAt;
        stopOthers(winner);
      }
      if (winner === attempt.provider) finish(() => resolve({ provider: attempt.provider, result, firstTextMs }));
    }, error => {
      running.delete(attempt.provider);
      if (signal.aborted || (winner && winner !== attempt.provider)) return; // Stopped on purpose
      options.onFailure?.(attempt.provider, error);
      lastError = error;
      if (winner === attempt.provider) {
        finish(() => reject(error)); // Failed mid-answer: don't continue with another provider's words
        return;
      }
      startNext();
    });
  };

  startNext();
});
