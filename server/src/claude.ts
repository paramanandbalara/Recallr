import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResult, ModelTier } from './ai.js';

// Claude (Anthropic) as a chat provider, next to Groq and OpenAI in ai.ts. It has no speech-to-text,
// so transcription stays with the other two.
//
// Live answers ("fast" and "vision", e.g. reading the screen) use Claude Haiku 5.5, the fastest Claude model,
// with thinking off so the first words come as soon as possible. Background work ("quality": reviews,
// prep packs, mock interview scores) uses Claude Opus 5.5. Both can be changed in Admin → Settings.

export const CLAUDE_DEFAULT_MODELS = { fast: 'claude-haiku-5-5', quality: 'claude-opus-5-5' };

export interface ClaudeModels {
  fast: string;
  quality: string;
}

// "data:image/png;base64,AAAA" → the image block Claude takes
const imageBlock = (dataUrl: string): Anthropic.Beta.BetaImageBlockParam | null => {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
  return match
    ? { type: 'image', source: { type: 'base64', media_type: match[1] as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: match[2] } }
    : null;
};

// Claude sometimes wraps JSON in a ```json block; the app parses the reply directly
const unwrapJson = (text: string) => text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

export const createClaude = (apiKey: string, models: ClaudeModels) => {
  const client = new Anthropic({ apiKey, maxRetries: 1 });

  const modelFor = (tier: ModelTier) => (tier === 'quality' ? models.quality : models.fast);

  // Haiku answers fastest with thinking off; on the larger models thinking can't be turned off, so effort
  // is kept low for live answers. The larger models also get Anthropic's server-side fallback, which
  // re-runs a declined request on another Claude model instead of failing.
  const options = (model: string, tier: ModelTier) => {
    if (/haiku/.test(model)) return { thinking: { type: 'disabled' as const } };
    return {
      output_config: { effort: tier === 'quality' ? 'medium' as const : 'low' as const },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default' as const,
    };
  };

  const streamChat = async (req: ChatRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<Omit<ChatResult, 'provider'>> => {
    const model = modelFor(req.tier);
    const images = (req.images ?? []).map(imageBlock).filter((b): b is Anthropic.Beta.BetaImageBlockParam => !!b);
    const system = req.json
      ? `${req.system}\n\nReply with only the JSON object: no code fences, no text before or after it.`
      : req.system;

    const stream = client.beta.messages.stream({
      model,
      max_tokens: req.maxTokens,
      system,
      messages: [{ role: 'user', content: [...images, { type: 'text', text: req.user }] }],
      ...options(model, req.tier),
    }, { signal });

    // JSON is sent in one piece once it's complete (and unwrapped); answers stream word by word
    let text = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        if (!req.json) onText(event.delta.text);
      }
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new Error(`Claude declined to answer${message.stop_details?.category ? ` (${message.stop_details.category})` : ''}.`);
    if (req.json) {
      text = unwrapJson(text);
      onText(text);
    }
    const usage = message.usage;
    return {
      text,
      model: message.model, // The model that answered (a fallback model if the first declined)
      inputTokens: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      outputTokens: usage.output_tokens,
    };
  };

  return { streamChat };
};

// Checks a key works (for the admin panel). Returns an error message, or '' when it works.
export const testClaudeKey = async (apiKey: string) => {
  if (!apiKey) return 'No key saved.';
  try {
    await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
    return '';
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return 'The key was rejected. Check it was copied completely.';
    if (error instanceof Anthropic.APIError) return `Anthropic answered ${error.status}: ${error.message}`;
    return error instanceof Error ? error.message : 'The check failed.';
  }
};
