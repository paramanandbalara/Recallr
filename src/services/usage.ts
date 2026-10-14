import type { ProviderId } from './llm';

// Tokens and audio sent to each AI, per conversation, with an approximate cost.
// Kept in localStorage for the most recent conversations only.

export interface ProviderUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  cost: number;      // USD, approximate
  unpriced: boolean; // Some of it used a model missing from the price table
}

interface ConversationUsage {
  updatedAt: number;
  providers: Partial<Record<ProviderId, ProviderUsage>>;
}

const KEY = 'secondBrain_usage';
const MAX_CONVERSATIONS = 200;
export const USAGE_EVENT = 'recallr-usage'; // Fired on window whenever usage is recorded

// ---------- Prices (USD) ----------
// APPROXIMATE list prices; providers change them, so check their pricing pages for exact numbers.
// Groq's free plan costs nothing: for Groq this is what the same use would cost on a paid plan.

const CHAT_PRICES: { match: RegExp; input: number; output: number }[] = [ // Per million tokens
  { match: /^openai\/gpt-oss-20b$/, input: 0.10, output: 0.50 },
  { match: /^openai\/gpt-oss-120b$/, input: 0.15, output: 0.75 },
  { match: /llama-4-scout/, input: 0.11, output: 0.34 },
  { match: /llama-4-maverick/, input: 0.20, output: 0.60 },
  { match: /^gpt-5(\.\d+)*-nano/, input: 0.05, output: 0.40 },
  { match: /^gpt-5(\.\d+)*-mini/, input: 0.25, output: 2.00 },
  { match: /^gpt-4\.1-mini/, input: 0.40, output: 1.60 },
  { match: /^gpt-4o-mini$/, input: 0.15, output: 0.60 },
];

const AUDIO_PRICES: { match: RegExp; perHour: number }[] = [
  { match: /^whisper-large-v3-turbo$/, perHour: 0.04 },
  { match: /^whisper-large-v3$/, perHour: 0.111 },
  { match: /^gpt-4o-mini-transcribe$/, perHour: 0.18 },
  { match: /^whisper-1$/, perHour: 0.36 },
];

// Groq bills at least 10 seconds of audio per request
const minimumAudioSeconds = (provider: ProviderId) => (provider === 'groq' ? 10 : 0);

// ---------- Storage ----------

let currentConversation = 'none';
export const setUsageConversation = (id: string) => { currentConversation = id; };

export const loadUsage = (): Record<string, ConversationUsage> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const save = (all: Record<string, ConversationUsage>) => {
  const kept = Object.entries(all).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or unavailable: usage is only informational
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USAGE_EVENT));
};

const record = (provider: ProviderId, change: (usage: ProviderUsage) => void) => {
  const all = loadUsage();
  const conversation = all[currentConversation] ?? { updatedAt: 0, providers: {} };
  const usage = conversation.providers[provider] ?? { requests: 0, inputTokens: 0, outputTokens: 0, audioSeconds: 0, cost: 0, unpriced: false };
  usage.requests += 1;
  change(usage);
  conversation.providers[provider] = usage;
  conversation.updatedAt = Date.now();
  all[currentConversation] = conversation;
  save(all);
};

export const recordChatUsage = (provider: ProviderId, model: string, inputTokens: number, outputTokens: number) =>
  record(provider, usage => {
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    const price = CHAT_PRICES.find(p => p.match.test(model));
    if (price) usage.cost += (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
    else usage.unpriced = true;
  });

export const recordAudioUsage = (provider: ProviderId, model: string, seconds: number) =>
  record(provider, usage => {
    const billed = Math.max(seconds, minimumAudioSeconds(provider));
    usage.audioSeconds += seconds;
    const price = AUDIO_PRICES.find(p => p.match.test(model));
    if (price) usage.cost += (billed / 3600) * price.perHour;
    else usage.unpriced = true;
  });

// ---------- Totals ----------

export const addUp = (list: Partial<Record<ProviderId, ProviderUsage>>[]) => {
  const total: Partial<Record<ProviderId, ProviderUsage>> = {};
  for (const providers of list) {
    for (const [provider, usage] of Object.entries(providers) as [ProviderId, ProviderUsage][]) {
      const sum = total[provider] ?? { requests: 0, inputTokens: 0, outputTokens: 0, audioSeconds: 0, cost: 0, unpriced: false };
      sum.requests += usage.requests;
      sum.inputTokens += usage.inputTokens;
      sum.outputTokens += usage.outputTokens;
      sum.audioSeconds += usage.audioSeconds;
      sum.cost += usage.cost;
      sum.unpriced ||= usage.unpriced;
      total[provider] = sum;
    }
  }
  return total;
};

export const usageForConversation = (id: string) => loadUsage()[id]?.providers ?? {};

export const usageSince = (since: number) =>
  addUp(Object.values(loadUsage()).filter(c => c.updatedAt >= since).map(c => c.providers));

export const clearUsage = () => save({});
