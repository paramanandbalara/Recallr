import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAi, IMAGE_TOKEN_ESTIMATE, type AiGateway, type TranscribeResult } from './ai.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { listeningSecondsToBill, usageSaved } from './entitlements.js';
import { clearSettingsCache } from './settings.js';

// Listening time is billed on what the transcription provider measured, and every AI use counts

// ---------- Pure rule ----------

describe('listening seconds to bill', () => {
  it('trusts the provider’s duration, allowing the app at most a second more', () => {
    expect(listeningSecondsToBill({ appSeconds: 30, providerSeconds: 30, audioBytes: 1000 })).toBe(30);
    expect(listeningSecondsToBill({ appSeconds: 30.6, providerSeconds: 30, audioBytes: 1000 })).toBe(30.6);
    expect(listeningSecondsToBill({ appSeconds: 90, providerSeconds: 30, audioBytes: 1000 })).toBe(31);
    // An app reporting far less than the audio is ignored
    expect(listeningSecondsToBill({ appSeconds: 1, providerSeconds: 30, audioBytes: 1000 })).toBe(30);
    expect(listeningSecondsToBill({ appSeconds: 0, providerSeconds: 12.34, audioBytes: 1000 })).toBe(12.3);
  });

  it('without a provider duration, caps the app’s figure by what the upload could hold', () => {
    expect(listeningSecondsToBill({ appSeconds: 20, audioBytes: 160_000 })).toBe(20);
    expect(listeningSecondsToBill({ appSeconds: 300, audioBytes: 10 })).toBe(1); // 10 bytes can't be 5 minutes
    expect(listeningSecondsToBill({ appSeconds: 600, audioBytes: 10_000_000 })).toBe(600);
    expect(listeningSecondsToBill({ appSeconds: Number.NaN, audioBytes: 10_000 })).toBe(0);
  });
});

// ---------- The providers, with a fake HTTP layer ----------

type Captured = { url: string; form?: FormData; json?: Record<string, unknown> };
const fakeFetch = (respond: (c: Captured) => Response) => {
  const calls: Captured[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('data:')) return globalThis.fetch(input, init); // The SDK checking FormData works
    const c: Captured = { url };
    if (init?.body instanceof FormData) c.form = init.body;
    else if (typeof init?.body === 'string') c.json = JSON.parse(init.body);
    calls.push(c);
    return respond(c);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
};
const json = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('transcription providers report the audio length', () => {
  it('asks Groq Whisper for verbose_json and returns its duration (text only to the app)', async () => {
    const { fetch, calls } = fakeFetch(() => json({ text: ' Tell me about yourself. ', duration: 7.42, segments: [] }));
    const result = await createAi({ groq: 'gsk_test' }, ['groq'], undefined, { fetch }).transcribe(Buffer.from('audio'), 'en');
    expect(result).toEqual<TranscribeResult>({ text: 'Tell me about yourself.', provider: 'groq', model: 'whisper-large-v3-turbo', durationSeconds: 7.42 });
    expect(calls[0].url).toContain('api.groq.com/openai/v1/audio/transcriptions');
    expect(calls[0].form?.get('response_format')).toBe('verbose_json');
  });

  it('uses verbose_json with OpenAI whisper-1, and json (no duration) with gpt-4o transcribe models', async () => {
    let model = '';
    const { fetch, calls } = fakeFetch(c => {
      model = String(c.form?.get('model'));
      if (model === 'gpt-4o-mini-transcribe') return new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 });
      return json({ text: 'Hello', duration: 3 });
    });
    const result = await createAi({ openai: 'sk-test' }, ['openai'], undefined, { fetch }).transcribe(Buffer.from('audio'), 'en');
    expect(calls.map(c => [c.form?.get('model'), c.form?.get('response_format')])).toEqual([
      ['gpt-4o-mini-transcribe', 'json'], ['whisper-1', 'verbose_json'],
    ]);
    expect(result).toMatchObject({ model: 'whisper-1', durationSeconds: 3 });

    const plain = fakeFetch(() => json({ text: 'Hi', usage: { type: 'tokens', input_tokens: 40, output_tokens: 3 } }));
    expect((await createAi({ openai: 'sk-test' }, ['openai'], undefined, { fetch: plain.fetch }).transcribe(Buffer.from('a'), 'en')).durationSeconds).toBeUndefined();
    const seconds = fakeFetch(() => json({ text: 'Hi', usage: { type: 'duration', seconds: 9 } }));
    expect((await createAi({ openai: 'sk-test' }, ['openai'], undefined, { fetch: seconds.fetch }).transcribe(Buffer.from('a'), 'en')).durationSeconds).toBe(9);
  });
});

describe('screenshots count as AI tokens', () => {
  const sse = (chunks: object[]) => new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  const chunk = (content: string, extra: object = {}) => ({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: { content }, finish_reason: null }], ...extra });
  const req = { tier: 'vision' as const, system: 'Find the question.', user: 'Screens:', images: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'], maxTokens: 100 };

  it('takes the provider’s prompt tokens, which include the images', async () => {
    const { fetch, calls } = fakeFetch(() => sse([chunk('What is'), chunk(' Redis?'), { ...chunk(''), choices: [], x_groq: { usage: { prompt_tokens: 3210, completion_tokens: 4 } } }]));
    const result = await createAi({ groq: 'gsk' }, ['groq'], undefined, { fetch, routing: 'order' }).streamChat(req, () => {}, new AbortController().signal);
    expect(result).toMatchObject({ text: 'What is Redis?', inputTokens: 3210, outputTokens: 4 });
    const content = (calls[0].json!.messages as { content: unknown }[])[1].content as { type: string }[];
    expect(content.filter(p => p.type === 'image_url')).toHaveLength(2);
  });

  it('estimates the images too when the provider gives no counts', async () => {
    const { fetch } = fakeFetch(() => sse([chunk('What is Redis?')]));
    const result = await createAi({ groq: 'gsk' }, ['groq'], undefined, { fetch, routing: 'order' }).streamChat(req, () => {}, new AbortController().signal);
    expect(result.inputTokens).toBe(Math.ceil((req.system + req.user).length / 4) + 2 * IMAGE_TOKEN_ESTIMATE);
    expect(result.outputTokens).toBe(4);
  });
});

// ---------- Through the API ----------

let transcribeResult: Partial<TranscribeResult> = {};
let releaseAnswer: () => void = () => {};
const ai: AiGateway = {
  // Streams a first part, then waits (so the test can cancel it halfway)
  streamChat: async (_req, onText, signal) => {
    onText('A long answer that the app ', 'claude');
    await new Promise<void>((resolve, reject) => {
      releaseAnswer = resolve;
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    onText('reads to the end.', 'claude');
    return { text: 'A long answer that the app reads to the end.', provider: 'claude', model: 'claude-haiku-5-5', inputTokens: 500, outputTokens: 11 };
  },
  transcribe: async () => ({ text: 'Hello', provider: 'groq', model: 'whisper-large-v3-turbo', ...transcribeResult }),
};
const app = createApp({ ai, razorpay: null });
let server: ReturnType<typeof app.listen>;
let desktop: string;
let userId: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const used = async () => { await usageSaved(); return db.purchase.findFirstOrThrow({ where: { userId } }); };
const transcribe = (seconds: number, bytes = 1000) => request(app).post('/api/ai/transcribe').set(auth(desktop))
  .field('seconds', String(seconds)).attach('audio', Buffer.alloc(bytes), { filename: 'a.webm', contentType: 'audio/webm' });

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
});
afterAll(() => { server.close(); });

beforeEach(async () => {
  transcribeResult = {};
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.emailLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.trialClaim.deleteMany();
  await db.device.deleteMany();
  await db.usageEvent.deleteMany();
  await db.invoice.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  const admin = (await request(app).post('/api/auth/register').send({ email: 'admin@example.com', name: 'Admin', password: 'password123' })).body.token;
  const reg = await request(app).post('/api/auth/register').send({ email: 'listener@example.com', name: 'Lis', password: 'password123' });
  userId = reg.body.user.id;
  const plan = await request(app).post('/api/admin/plans').set(auth(admin)).send({ name: 'Pro', pricePaise: 79900, durationDays: 30, listeningMinutes: 60, tokenLimit: 100_000 });
  await request(app).post(`/api/admin/users/${userId}/grant`).set(auth(admin)).send({ planId: plan.body.plan.id }).expect(201);
  const login = await request(app).post('/api/auth/login').send({ email: 'listener@example.com', password: 'password123', device: { fingerprint: 'listening-test-pc', name: 'PC', platform: 'win32', appVersion: '1.0.0' } });
  desktop = login.body.token;
});

describe('listening time measured on the server', () => {
  it('bills the provider’s duration, not a smaller number from the app', async () => {
    transcribeResult = { durationSeconds: 45 };
    const res = await transcribe(2);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'Hello' }); // Still plain text for the app
    expect((await used()).usedSeconds).toBe(45);
    await transcribe(45.5).expect(200);
    expect((await used()).usedSeconds).toBe(90.5);
    await transcribe(500).expect(200); // At most a second over the provider's figure
    expect((await used()).usedSeconds).toBe(136.5);
    const events = await db.usageEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    expect(events.map(e => e.audioSeconds)).toEqual([45, 45.5, 46]);
  });

  it('falls back to the app’s figure, capped by the upload size, when the provider gives no duration', async () => {
    await transcribe(20, 50_000).expect(200);
    expect((await used()).usedSeconds).toBe(20);
    await transcribe(300, 1000).expect(200); // 1 KB of audio: at most 3 s
    expect((await used()).usedSeconds).toBe(23);
  });
});

describe('every AI answer counts', () => {
  const ask = (signal?: AbortSignal) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(desktop) }, signal,
    body: JSON.stringify({ tier: 'vision', system: 'Read the screen.', user: 'x'.repeat(400), images: ['data:image/png;base64,AAAA'], maxTokens: 100 }),
  });

  it('counts the whole answer', async () => {
    const res = await ask();
    const reader = res.body!.getReader();
    await reader.read(); // The first words
    releaseAnswer();
    while (!(await reader.read()).done) { /* to the end */ }
    expect((await used()).usedTokens).toBe(511);
  });

  it('still counts what was streamed when the app cancels halfway', async () => {
    const controller = new AbortController();
    const res = await ask(controller.signal);
    const first = await res.body!.getReader().read();
    expect(new TextDecoder().decode(first.value)).toContain('A long answer');
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 100)); // The server sees the closed connection
    const pack = await used();
    const expected = Math.ceil(('Read the screen.' + 'x'.repeat(400)).length / 4) + IMAGE_TOKEN_ESTIMATE + Math.ceil('A long answer that the app '.length / 4);
    expect(pack.usedTokens).toBe(expected);
    const event = await db.usageEvent.findFirstOrThrow({ where: { userId } });
    expect(event).toMatchObject({ kind: 'CHAT', provider: 'claude', model: 'cancelled' });
  });
});
