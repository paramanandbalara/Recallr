import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './account';
import { describeAiError, streamChat } from './llm';

// The server's answer stream, cut into pieces at awkward places like a real network would
const respond = (chunks: string[], status = 200) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
};

const ask = (onFirstText?: (provider: string) => void) =>
  streamChat({ tier: 'fast', system: 's', user: 'u', maxTokens: 10, onFirstText }, () => {});

describe('streamChat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('joins the pieces, even when a line is split across chunks', async () => {
    respond(['{"text":"Hel', 'lo ","provider":"openai"}\n{"text":"there."}\n', '{"done":true}\n']);
    const first = vi.fn();
    expect(await ask(first)).toBe('Hello there.');
    expect(first).toHaveBeenCalledWith('openai');
  });

  it('turns an error line into an error', async () => {
    respond(['{"text":"Hi"}\n{"error":"The AI is having problems"}\n']);
    await expect(ask()).rejects.toThrow('The AI is having problems');
  });

  it('points to buying more when the plan has run out', async () => {
    respond([JSON.stringify({ error: "You've used all the AI answers in your plan.", code: 'TOKENS_USED_UP' })], 402);
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const error = await ask().catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(describeAiError(error)).toMatch(/Settings → Account/);
  });
});
