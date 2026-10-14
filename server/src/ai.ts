import OpenAI, { toFile } from 'openai';
import { CLAUDE_DEFAULT_MODELS, createClaude, testClaudeKey, type ClaudeModels } from './claude.js';
import { HttpError } from './http.js';

// The AI providers, with the server's own keys, tried in the admin's order (Groq first by default: fastest).
// Groq's model ids are known, OpenAI's newest mini is discovered; Claude is in claude.ts.
// Claude has no speech-to-text, so transcription only uses Groq and OpenAI.

export type ProviderId = 'groq' | 'openai' | 'claude';
type OpenAiCompatible = Exclude<ProviderId, 'claude'>;
export const PROVIDER_IDS: ProviderId[] = ['groq', 'openai', 'claude'];
export type ModelTier = 'fast' | 'quality' | 'vision';

export interface ChatRequest {
  tier: ModelTier;
  system: string;
  user: string;
  images?: string[];
  maxTokens: number;
  temperature?: number;
  json?: boolean;
}

export interface ChatResult {
  text: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TranscribeResult {
  text: string;
  provider: ProviderId;
  model: string;
}

export interface AiGateway {
  streamChat: (req: ChatRequest, onText: (delta: string, provider: ProviderId) => void, signal: AbortSignal) => Promise<ChatResult>;
  transcribe: (audio: Buffer, language: string) => Promise<TranscribeResult>;
}

const BASE_URLS: Record<OpenAiCompatible, string | undefined> = { groq: 'https://api.groq.com/openai/v1', openai: undefined };

const GROQ_PREFERRED: Record<ModelTier, string[]> = {
  fast: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
  quality: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  vision: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'],
};

const TRANSCRIBE_MODELS: Record<OpenAiCompatible, string[]> = {
  groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  openai: ['gpt-4o-mini-transcribe', 'whisper-1'],
};
const ENGLISH_HINT = 'This is a corporate job interview. Transcribe accurately.';

const versionOf = (id: string, suffix: string) => {
  const match = id.match(new RegExp(`^gpt-(\\d+(?:\\.\\d+)*)-${suffix}$`));
  return match ? match[1].split('.').map(Number) : null;
};
const compareVersions = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
};
const newest = (ids: string[], suffix: string) =>
  ids.filter(id => versionOf(id, suffix)).sort((a, b) => compareVersions(versionOf(b, suffix)!, versionOf(a, suffix)!))[0];

const pickOpenAiModel = (ids: string[], tier: ModelTier) =>
  (tier === 'fast' ? newest(ids, 'mini') || newest(ids, 'nano') : newest(ids, 'mini'))
  || ['gpt-4.1-mini', 'gpt-4o-mini'].find(id => ids.includes(id));

const pickGroqModel = (ids: string[], tier: ModelTier) =>
  GROQ_PREFERRED[tier].find(id => ids.includes(id))
  || (tier === 'vision'
    ? ids.find(id => /llama-4|vision|scout|maverick/i.test(id) && !/guard/i.test(id))
    : ids.find(id => /gpt-oss/i.test(id) && !/safeguard/i.test(id))
    || ids.find(id => !/whisper|tts|orpheus|guard|compound/i.test(id)));

const isModelGone = (error: unknown) =>
  error instanceof OpenAI.APIError
  && (error.status === 404 || /model_(not_found|decommissioned)|does not exist|decommissioned/i.test(`${error.code} ${error.message}`));

const rejectedParam = (error: unknown) => {
  if (!(error instanceof OpenAI.APIError) || error.status !== 400) return null;
  const text = `${error.param ?? ''} ${error.message}`;
  return ['reasoning_effort', 'temperature'].find(p => text.includes(p)) ?? null;
};

// `order`: which provider is tried first
export const createAi = (
  keys: Partial<Record<ProviderId, string>>,
  order: ProviderId[] = PROVIDER_IDS,
  claudeModels: ClaudeModels = CLAUDE_DEFAULT_MODELS,
): AiGateway => {
  const providers = order.filter(p => keys[p]);
  const transcribers = providers.filter((p): p is OpenAiCompatible => p !== 'claude');
  const claude = keys.claude ? createClaude(keys.claude, claudeModels) : null;
  const clients = new Map<OpenAiCompatible, OpenAI>();
  const client = (provider: OpenAiCompatible) => {
    if (!clients.has(provider)) clients.set(provider, new OpenAI({ apiKey: keys[provider], baseURL: BASE_URLS[provider], maxRetries: 1 }));
    return clients.get(provider)!;
  };

  // Remembered while the server runs
  const modelCache = new Map<string, string>();
  const effortCache = new Map<string, string>();
  const transcribeCache = new Map<OpenAiCompatible, string>();

  const discover = async (provider: OpenAiCompatible, tier: ModelTier) => {
    const ids = (await client(provider).models.list()).data.map(m => m.id);
    const model = provider === 'groq' ? pickGroqModel(ids, tier) : pickOpenAiModel(ids, tier);
    if (!model) throw new Error(`No ${tier} model available on ${provider}`);
    modelCache.set(`${provider}:${tier}`, model);
    return model;
  };
  const resolve = async (provider: OpenAiCompatible, tier: ModelTier) =>
    modelCache.get(`${provider}:${tier}`) ?? (provider === 'groq' ? GROQ_PREFERRED[tier][0] : discover(provider, tier));

  const params = (provider: OpenAiCompatible, model: string, req: ChatRequest) => {
    const result: Record<string, unknown> = {};
    if (provider === 'groq') {
      if (req.temperature !== undefined) result.temperature = req.temperature;
      if (model.includes('gpt-oss')) result.reasoning_effort = 'low';
    } else if (/^gpt-5/.test(model)) {
      result.reasoning_effort = effortCache.get(model) ?? 'none';
    }
    return result;
  };

  const streamFrom = async (provider: OpenAiCompatible, req: ChatRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<ChatResult> => {
    let model = await resolve(provider, req.tier);
    let extra = params(provider, model, req);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const stream = await client(provider).chat.completions.create({
          model,
          ...extra,
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
          ...(provider === 'openai' ? { stream_options: { include_usage: true } } : {}),
        }, { signal });

        let text = '';
        let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            text += delta;
            onText(delta);
          }
          usage = chunk.usage ?? (chunk as { x_groq?: { usage?: typeof usage } }).x_groq?.usage ?? usage;
        }
        // Without counts from the provider, estimate (about 4 characters per token)
        const estimate = (s: string) => Math.ceil(s.length / 4);
        return {
          text, provider, model,
          inputTokens: usage?.prompt_tokens ?? estimate(req.system + req.user),
          outputTokens: usage?.completion_tokens ?? estimate(text),
        };
      } catch (error) {
        if (signal.aborted) throw error;
        const param = rejectedParam(error);
        if (param === 'reasoning_effort' && extra.reasoning_effort === 'none') {
          extra = { ...extra, reasoning_effort: 'minimal' };
          effortCache.set(model, 'minimal');
        } else if (param && param in extra) {
          const { [param]: _dropped, ...rest } = extra;
          void _dropped;
          extra = rest;
        } else if (isModelGone(error)) {
          model = await discover(provider, req.tier);
          extra = params(provider, model, req);
        } else {
          throw error;
        }
      }
    }
    throw new Error('The AI request kept failing.');
  };

  const noProvider = () => new HttpError(503, 'The AI service is not set up yet. Please try again later.', 'NO_AI');

  return {
    streamChat: async (req, onText, signal) => {
      if (providers.length === 0) throw noProvider();
      let lastError: unknown;
      for (const provider of providers) {
        let emitted = false;
        try {
          const onDelta = (delta: string) => { emitted = true; onText(delta, provider); };
          if (provider === 'claude') return { ...(await claude!.streamChat(req, onDelta, signal)), provider };
          return await streamFrom(provider, req, onDelta, signal);
        } catch (error) {
          if (signal.aborted) throw error;
          console.error(`${provider} chat error:`, error);
          lastError = error;
          if (emitted) break; // Don't mix two providers' text in one answer
        }
      }
      throw lastError;
    },

    transcribe: async (audio, language) => {
      if (transcribers.length === 0) throw noProvider();
      const file = await toFile(audio, 'audio.webm', { type: 'audio/webm' });
      let lastError: unknown;
      for (const provider of transcribers) {
        const candidates = transcribeCache.has(provider) ? [transcribeCache.get(provider)!] : TRANSCRIBE_MODELS[provider];
        for (const model of candidates) {
          try {
            const result = await client(provider).audio.transcriptions.create({
              file, model,
              ...(language === 'auto' ? {} : { language }),
              ...(language === 'en' ? { prompt: ENGLISH_HINT } : {}),
              response_format: 'json',
              ...(provider === 'groq' ? { temperature: 0 } : {}),
            });
            transcribeCache.set(provider, model);
            return { text: result.text.trim(), provider, model };
          } catch (error) {
            lastError = error;
            if (!(error instanceof OpenAI.APIError && (error.status === 404 || (error.status === 400 && /model/i.test(error.message))))) break;
          }
        }
        console.error(`${provider} transcription error:`, lastError);
      }
      throw lastError;
    },
  };
};

// The gateway for the keys saved in Admin → Settings, rebuilt when they change
interface AiSettings {
  groqApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  claudeModelFast: string;
  claudeModelQuality: string;
  aiProviderOrder: string;
}

// Providers missing from the admin's order are tried after the ones listed
export const parseProviderOrder = (value: string) => {
  const listed = value.split(',').map(p => p.trim()).filter((p): p is ProviderId => (PROVIDER_IDS as string[]).includes(p));
  return [...new Set([...listed, ...PROVIDER_IDS])];
};

export const createAiFromSettings = (getSettings: () => Promise<AiSettings>): AiGateway => {
  let current: { signature: string; ai: AiGateway } | null = null;
  const gateway = async () => {
    const s = await getSettings();
    const order = parseProviderOrder(s.aiProviderOrder);
    const models = { fast: s.claudeModelFast || CLAUDE_DEFAULT_MODELS.fast, quality: s.claudeModelQuality || CLAUDE_DEFAULT_MODELS.quality };
    const signature = JSON.stringify([s.groqApiKey, s.openaiApiKey, s.anthropicApiKey, order, models]);
    if (current?.signature !== signature) {
      current = { signature, ai: createAi({ groq: s.groqApiKey, openai: s.openaiApiKey, claude: s.anthropicApiKey }, order, models) };
    }
    return current.ai;
  };
  return {
    streamChat: async (req, onText, signal) => (await gateway()).streamChat(req, onText, signal),
    transcribe: async (audio, language) => (await gateway()).transcribe(audio, language),
  };
};

// Checks a key works (for the admin panel). Returns an error message, or '' when it works.
export const testAiKey = async (provider: ProviderId, apiKey: string) => {
  if (provider === 'claude') return testClaudeKey(apiKey);
  if (!apiKey) return 'No key saved.';
  try {
    await new OpenAI({ apiKey, baseURL: BASE_URLS[provider], maxRetries: 0, timeout: 15_000 }).models.list();
    return '';
  } catch (error) {
    if (error instanceof OpenAI.APIError && error.status === 401) return 'The key was rejected. Check it was copied completely.';
    return error instanceof Error ? error.message : 'The check failed.';
  }
};
