import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAi, parseProviderOrder } from './ai.js';
import { createClaude } from './claude.js';

// A stand-in for Anthropic's Messages API that streams a scripted reply and keeps each request body
let server: http.Server;
const requests: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
let reply = { text: ['Hello', ' there'], stopReason: 'end_turn', model: '' };

const sse = (res: http.ServerResponse, type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      requests.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, 'message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: reply.model || body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } });
      sse(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      for (const text of reply.text) sse(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
      sse(res, 'content_block_stop', { index: 0 });
      sse(res, 'message_delta', { delta: { stop_reason: reply.stopReason, stop_sequence: null }, usage: { output_tokens: 7 } });
      sse(res, 'message_stop', {});
      res.end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  delete process.env.ANTHROPIC_BASE_URL;
  server.close();
});

const models = { fast: 'claude-haiku-5-5', quality: 'claude-opus-5-5' };
const signal = new AbortController().signal;

describe('Claude provider', () => {
  it('streams a live answer from Haiku with thinking off', async () => {
    reply = { text: ['Hello', ' there'], stopReason: 'end_turn', model: '' };
    const pieces: string[] = [];
    const result = await createClaude('sk-ant-test', models).streamChat(
      { tier: 'fast', system: 'Be brief.', user: 'Hi', maxTokens: 300, temperature: 0.7 }, d => pieces.push(d), signal);
    expect(pieces).toEqual(['Hello', ' there']);
    expect(result).toMatchObject({ text: 'Hello there', model: 'claude-haiku-5-5', inputTokens: 12, outputTokens: 7 });
    const { body } = requests.at(-1)!;
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 300, system: 'Be brief.', thinking: { type: 'disabled' } });
    expect(body).not.toHaveProperty('temperature'); // Not accepted by current Claude models
    expect(body).not.toHaveProperty('fallbacks');
  });

  it('uses Opus with the server-side fallback for background work', async () => {
    reply = { text: ['Done'], stopReason: 'end_turn', model: '' };
    await createClaude('sk-ant-test', models).streamChat({ tier: 'quality', system: 's', user: 'u', maxTokens: 2000 }, () => {}, signal);
    const { body, headers } = requests.at(-1)!;
    expect(body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' } });
    expect(body).not.toHaveProperty('thinking');
    expect(String(headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
  });

  it('sends screenshots as images', async () => {
    reply = { text: ['A question'], stopReason: 'end_turn', model: '' };
    await createClaude('sk-ant-test', models).streamChat(
      { tier: 'vision', system: 's', user: 'Read it', maxTokens: 500, images: ['data:image/png;base64,AAAA'] }, () => {}, signal);
    const content = (requests.at(-1)!.body.messages as { content: unknown[] }[])[0].content;
    expect(content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: 'Read it' },
    ]);
  });

  it('returns JSON in one piece, without code fences', async () => {
    reply = { text: ['```json\n{"keyPoints":', '["a"]}\n```'], stopReason: 'end_turn', model: '' };
    const pieces: string[] = [];
    const result = await createClaude('sk-ant-test', models).streamChat(
      { tier: 'fast', system: 'Return JSON', user: 'u', maxTokens: 500, json: true }, d => pieces.push(d), signal);
    expect(pieces).toEqual(['{"keyPoints":["a"]}']);
    expect(JSON.parse(result.text)).toEqual({ keyPoints: ['a'] });
  });

  it('lets the next provider answer when Claude declines before writing anything', async () => {
    reply = { text: [], stopReason: 'refusal', model: '' };
    const ai = createAi({ claude: 'sk-ant-test' }, ['claude']);
    await expect(ai.streamChat({ tier: 'fast', system: 's', user: 'u', maxTokens: 100 }, () => {}, signal)).rejects.toThrow(/declined/);
  });

  it('reports which provider answered through the gateway', async () => {
    reply = { text: ['Hi'], stopReason: 'end_turn', model: '' };
    const seen: string[] = [];
    const result = await createAi({ claude: 'sk-ant-test' }, ['claude']).streamChat(
      { tier: 'fast', system: 's', user: 'u', maxTokens: 100 }, (_d, provider) => seen.push(provider), signal);
    expect(result.provider).toBe('claude');
    expect(seen).toEqual(['claude']);
  });

  it('never uses Claude for listening', async () => {
    await expect(createAi({ claude: 'sk-ant-test' }).transcribe(Buffer.from('x'), 'en')).rejects.toThrow(/not set up/);
  });
});

describe('provider order', () => {
  it('puts the listed providers first and the rest after', () => {
    expect(parseProviderOrder('claude,groq')).toEqual(['claude', 'groq', 'openai']);
    expect(parseProviderOrder('')).toEqual(['groq', 'openai', 'claude']);
    expect(parseProviderOrder('openai, nope')).toEqual(['openai', 'groq', 'claude']);
  });
});
