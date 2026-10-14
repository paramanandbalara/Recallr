import OpenAI from 'openai';
import type { Settings } from './storage';
import { recordChatUsage } from './usage';

// Groq and OpenAI both speak the OpenAI API, so one SDK covers both.
// "Auto" uses Groq first (fastest: ~1000 tokens/s on gpt-oss-20b), then OpenAI if Groq fails.

export type ProviderId = 'groq' | 'openai';
export type ModelTier = 'fast' | 'quality' | 'vision'; // fast = live answers, quality = background jobs, vision = reads screenshots

export const PROVIDERS: Record<ProviderId, { label: string; baseURL?: string; keyField: 'groqKey' | 'openaiKey'; keyUrl: string; keyHint: string }> = {
  groq: {
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    keyField: 'groqKey',
    keyUrl: 'https://console.groq.com/keys',
    keyHint: 'gsk_...',
  },
  openai: {
    label: 'OpenAI',
    keyField: 'openaiKey',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-...',
  },
};

const SPEED_ORDER: ProviderId[] = ['groq', 'openai'];

export const client = (provider: ProviderId, apiKey: string) => new OpenAI({
  baseURL: PROVIDERS[provider].baseURL,
  apiKey: apiKey.trim(),
  dangerouslyAllowBrowser: true,
  maxRetries: 1,
});

const keyFor = (settings: Pick<Settings, 'groqKey' | 'openaiKey'>, provider: ProviderId) =>
  settings[PROVIDERS[provider].keyField].trim();

// Providers to try, in order, for this user's keys and choice
export const providerOrder = (settings: Settings): ProviderId[] => {
  const withKey = SPEED_ORDER.filter(p => keyFor(settings, p).length > 10);
  if (settings.answerProvider === 'auto') return withKey;
  return withKey.filter(p => p === settings.answerProvider);
};

// ---------- Model selection ----------

// Groq retires models regularly (llama-3.3-70b-versatile was shut down on 2026-08-16)
const GROQ_PREFERRED: Record<ModelTier, string[]> = {
  fast: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
  quality: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  vision: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'],
};

const cacheKey = (provider: ProviderId, tier: ModelTier) => `secondBrain_model_${provider}_${tier}`;
const readCache = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const writeCache = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not critical; we'll rediscover next time
  }
};

// Version parts of gpt-<version>-<suffix>, e.g. gpt-5.4-mini -> [5, 4]; null if it doesn't match
const versionOf = (id: string, suffix: string) => {
  const match = id.match(new RegExp(`^gpt-(\\d+(?:\\.\\d+)*)-${suffix}$`));
  return match ? match[1].split('.').map(Number) : null;
};

// Compare part by part so 5.10 is newer than 5.9
const compareVersions = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
};

// Newest model whose id is exactly gpt-<version>-<suffix>, e.g. gpt-5.4-mini
const newest = (ids: string[], suffix: string) =>
  ids.filter(id => versionOf(id, suffix))
    .sort((a, b) => compareVersions(versionOf(b, suffix)!, versionOf(a, suffix)!))[0];

// OpenAI releases new small models often, so we ask which ones this key can use and take the newest
// (OpenAI's mini models all read images, so vision uses the same one as quality)
const pickOpenAiModel = (ids: string[], tier: ModelTier) =>
  (tier === 'fast' ? newest(ids, 'mini') || newest(ids, 'nano') : newest(ids, 'mini'))
  || ['gpt-4.1-mini', 'gpt-4o-mini'].find(id => ids.includes(id));

const pickGroqModel = (ids: string[], tier: ModelTier) =>
  GROQ_PREFERRED[tier].find(id => ids.includes(id))
  || (tier === 'vision'
    ? ids.find(id => /llama-4|vision|scout|maverick/i.test(id) && !/guard/i.test(id))
    : ids.find(id => /gpt-oss/i.test(id) && !/safeguard/i.test(id))
    || ids.find(id => !/whisper|tts|orpheus|guard|compound/i.test(id)));

const discoverModel = async (provider: ProviderId, apiKey: string, tier: ModelTier) => {
  const { data } = await client(provider, apiKey).models.list();
  const ids = data.map(m => m.id);
  const model = provider === 'groq' ? pickGroqModel(ids, tier) : pickOpenAiModel(ids, tier);
  if (!model) throw new Error(`No ${tier === 'vision' ? 'model that can read images' : 'suitable chat model'} is available for this ${PROVIDERS[provider].label} key.`);
  writeCache(cacheKey(provider, tier), model);
  return model;
};

const resolveModel = async (provider: ProviderId, apiKey: string, tier: ModelTier) => {
  const cached = readCache(cacheKey(provider, tier));
  if (cached) return cached;
  // Groq's ids are known; OpenAI's must be discovered from the key
  return provider === 'groq' ? GROQ_PREFERRED[tier][0] : discoverModel(provider, apiKey, tier);
};

const isModelGone = (error: unknown) =>
  error instanceof OpenAI.APIError &&
  (error.status === 404 || /model_(not_found|decommissioned)|does not exist|decommissioned/i.test(`${error.code} ${error.message}`));

// ---------- Requests ----------

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens: number;
  tier: ModelTier;
  temperature?: number;
  json?: boolean;
  images?: string[]; // Data URLs sent along with `user` (vision tier)
  signal?: AbortSignal; // Cancels the request, e.g. when a newer question arrives
  onFirstText?: (provider: ProviderId) => void; // The first words arrived from this provider
}

// Reasoning models think before answering; ask for as little as the model allows so answers start fast.
// OpenAI's GPT-5 family also rejects custom temperature, so we only send it to Groq.
const optionalParams = (provider: ProviderId, model: string, req: ChatRequest) => {
  const params: Record<string, unknown> = {};
  if (provider === 'groq') {
    if (req.temperature !== undefined) params.temperature = req.temperature;
    if (model.includes('gpt-oss')) params.reasoning_effort = 'low';
  } else if (/^gpt-5/.test(model)) {
    params.reasoning_effort = readCache(`secondBrain_effort_${model}`) || 'none';
  }
  return params;
};

// Some models reject a parameter (e.g. reasoning_effort "none"); retry without it, remembering what works
const rejectedParam = (error: unknown) => {
  if (!(error instanceof OpenAI.APIError) || error.status !== 400) return null;
  const text = `${error.param ?? ''} ${error.message}`;
  return ['reasoning_effort', 'temperature'].find(p => text.includes(p)) ?? null;
};

class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly original: unknown;
  constructor(provider: ProviderId, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.provider = provider;
    this.original = cause;
  }
}

const streamFrom = async (provider: ProviderId, apiKey: string, req: ChatRequest, onText: (text: string) => void) => {
  let model = await resolveModel(provider, apiKey, req.tier);
  let params = optionalParams(provider, model, req);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const stream = await client(provider, apiKey).chat.completions.create({
        model,
        ...params,
        ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
        messages: [
          { role: 'system', content: req.system },
          {
            role: 'user',
            content: req.images?.length
              ? [{ type: 'text' as const, text: req.user }, ...req.images.map(url => ({ type: 'image_url' as const, image_url: { url } }))]
              : req.user,
          },
        ],
        max_completion_tokens: req.maxTokens,
        stream: true,
        // OpenAI only sends token counts when asked; Groq always adds them (as x_groq.usage)
        ...(provider === 'openai' ? { stream_options: { include_usage: true } } : {}),
      }, { signal: req.signal });

      let text = '';
      let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          text += delta;
          onText(text);
        }
        usage = chunk.usage ?? (chunk as { x_groq?: { usage?: typeof usage } }).x_groq?.usage ?? usage;
      }
      if (usage) recordChatUsage(provider, model, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
      return text;
    } catch (error) {
      if (req.signal?.aborted) throw error;
      const param = rejectedParam(error);
      if (param === 'reasoning_effort' && params.reasoning_effort === 'none') {
        params = { ...params, reasoning_effort: 'minimal' };
        writeCache(`secondBrain_effort_${model}`, 'minimal');
      } else if (param && param in params) {
        const { [param]: _dropped, ...rest } = params;
        void _dropped;
        params = rest;
      } else if (isModelGone(error)) {
        model = await discoverModel(provider, apiKey, req.tier);
        params = optionalParams(provider, model, req);
      } else {
        throw error;
      }
    }
  }
  throw new Error('The AI request kept failing.');
};

// Streams from the first provider that works. onText receives the full text so far.
export const streamChat = async (settings: Settings, req: ChatRequest, onText: (text: string) => void): Promise<string> => {
  const order = providerOrder(settings);
  if (order.length === 0) {
    throw new Error(settings.answerProvider === 'auto'
      ? 'No API key set. Add a Groq or OpenAI key in Settings → API keys.'
      : `No ${PROVIDERS[settings.answerProvider].label} key set. Add it in Settings → API keys.`);
  }

  let lastError: unknown;
  for (const provider of order) {
    let emitted = false;
    try {
      return await streamFrom(provider, keyFor(settings, provider), req, text => {
        if (!emitted) req.onFirstText?.(provider);
        emitted = true;
        onText(text);
      });
    } catch (error) {
      if (req.signal?.aborted) throw error; // Cancelled on purpose: don't try the next provider
      lastError = new ProviderError(provider, error);
      console.error(`${PROVIDERS[provider].label} error:`, error);
      if (emitted) break; // Don't mix two providers' text in one answer
    }
  }
  throw lastError;
};

export const completeChat = (settings: Settings, req: ChatRequest) => streamChat(settings, req, () => {});

// Turn any provider/network error into a message the user can act on
export const describeAiError = (error: unknown): string => {
  const provider = error instanceof ProviderError ? PROVIDERS[error.provider].label : 'The AI';
  const cause = error instanceof ProviderError ? error.original : error;
  if (cause instanceof OpenAI.APIConnectionError) return `Could not reach ${provider}. Check your internet connection.`;
  if (cause instanceof OpenAI.APIError) {
    if (cause.status === 401) return `${provider} rejected the API key. Check it in Settings → API keys.`;
    if (cause.status === 429) return `${provider} rate limit or quota reached. Wait a moment, or check your plan's credits.`;
    if (cause.status && cause.status >= 500) return `${provider} is having problems right now. Try again in a moment.`;
    return `${provider} error${cause.status ? ` (${cause.status})` : ''}: ${cause.message}`;
  }
  return cause instanceof Error ? cause.message : 'Unknown error talking to the AI.';
};

// The first provider (in the user's order) with a model that can read screenshots, or null
export const findVisionModel = async (settings: Settings): Promise<{ provider: ProviderId; model: string } | null> => {
  for (const provider of providerOrder(settings)) {
    try {
      return { provider, model: await discoverModel(provider, keyFor(settings, provider), 'vision') };
    } catch {
      // Try the next provider
    }
  }
  return null;
};

// Check a key works. Returns an error message, or '' if the key is valid.
export const testKey = async (provider: ProviderId, apiKey: string): Promise<string> => {
  try {
    await client(provider, apiKey).models.list();
    return '';
  } catch (error) {
    return describeAiError(new ProviderError(provider, error));
  }
};
