import { useState } from 'react';
import { PROVIDERS, testKey, type ProviderId } from '../services/llm';
import type { Settings } from '../services/storage';

export interface KeyTestResult {
  state: 'idle' | 'testing' | 'ok' | 'error';
  message?: string;
}

const IDLE: KeyTestResult = { state: 'idle' };
const ALL: ProviderId[] = ['groq', 'openai'];

// Tracks "Test key" results for each provider
export const useKeyTests = () => {
  const [results, setResults] = useState<Record<ProviderId, KeyTestResult>>({ groq: IDLE, openai: IDLE });

  const set = (provider: ProviderId, result: KeyTestResult) =>
    setResults(prev => ({ ...prev, [provider]: result }));

  const test = async (provider: ProviderId, key: string) => {
    set(provider, { state: 'testing' });
    const error = await testKey(provider, key);
    const result: KeyTestResult = error ? { state: 'error', message: error } : { state: 'ok' };
    set(provider, result);
    return result.state === 'ok';
  };

  // Test every key that was filled in; true if at least one works
  const testAll = async (settings: Settings) => {
    const filled = ALL.filter(p => settings[PROVIDERS[p].keyField].trim());
    const outcomes = await Promise.all(filled.map(p => test(p, settings[PROVIDERS[p].keyField])));
    return outcomes.some(Boolean);
  };

  const reset = (provider: ProviderId) => set(provider, IDLE);

  return { results, test, testAll, reset };
};
