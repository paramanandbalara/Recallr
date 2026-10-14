import { beforeEach, describe, expect, it } from 'vitest';
import { recordAudioUsage, recordChatUsage, setUsageConversation, usageForConversation, usageSince } from './usage';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  },
});

describe('usage tracker', () => {
  beforeEach(() => {
    store.clear();
    setUsageConversation('one');
  });

  it('adds up tokens and cost per provider and conversation', () => {
    recordChatUsage('groq', 'openai/gpt-oss-20b', 1_000_000, 100_000);
    recordChatUsage('groq', 'openai/gpt-oss-20b', 1_000_000, 100_000);
    setUsageConversation('two');
    recordChatUsage('openai', 'gpt-5-mini', 1_000_000, 0);

    const one = usageForConversation('one').groq!;
    expect(one).toMatchObject({ requests: 2, inputTokens: 2_000_000, outputTokens: 200_000 });
    expect(one.cost).toBeCloseTo(2 * (0.10 + 0.05));
    expect(usageForConversation('two').openai!.cost).toBeCloseTo(0.25);
    expect(usageSince(0).groq!.requests).toBe(2);
  });

  it('bills Groq audio at least 10 seconds per request', () => {
    recordAudioUsage('groq', 'whisper-large-v3-turbo', 2);
    const groq = usageForConversation('one').groq!;
    expect(groq.audioSeconds).toBe(2);
    expect(groq.cost).toBeCloseTo((10 / 3600) * 0.04);
  });

  it('marks usage of models without a known price', () => {
    recordChatUsage('groq', 'some-new-model', 1000, 1000);
    expect(usageForConversation('one').groq).toMatchObject({ cost: 0, unpriced: true });
  });
});
