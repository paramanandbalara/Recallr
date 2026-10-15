import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireDevice, requireUser } from '../auth.js';
import type { AiGateway } from '../ai.js';
import { purchaseFor, recordUsage, recordUsageAfter } from '../entitlements.js';
import { HttpError, route } from '../http.js';
import { readCompanySite } from '../research.js';

// The desktop app's AI calls, with the server's keys, counted against the user's plan
const RESEARCH_PROMPT = `You help a candidate prepare for a job interview at the company whose website text is below.
Write short research notes they can glance at and use when asked "Why do you want to join us?" or "What do you know about us?".
Use ONLY what the website text says; never add facts from elsewhere, and leave out anything the text doesn't cover.
Plain text, these headings each on its own line, followed by short "- " points in simple words:
What they do
Products and customers
How they work (values, culture, team)
Recent news (only if the text mentions any)
Tech they mention (only if any)
Good things to mention in "Why us?"
Keep it under 250 words. No intro or closing line.`;

export const aiRoutes = (ai: AiGateway, readSite = readCompanySite) => {
  const router = Router();
  router.use(requireUser, requireDevice);

  const chatInput = z.object({
    tier: z.enum(['fast', 'quality', 'vision']),
    system: z.string().max(200_000),
    user: z.string().max(200_000),
    images: z.array(z.string().max(8_000_000)).max(3).optional(),
    maxTokens: z.number().int().min(1).max(16_000),
    temperature: z.number().min(0).max(2).optional(),
    json: z.boolean().optional(),
  });

  // Streams newline-separated JSON: {"text":"..."} for each piece, then {"done":true,...} or {"error":"..."}
  router.post('/chat', route(async (req, res) => {
    const input = chatInput.parse(req.body);
    const purchase = await purchaseFor(req.user!.id, 'CHAT');

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); }); // The app cancelled (a newer question came in)
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const send = (data: object) => res.write(`${JSON.stringify(data)}\n`);

    try {
      let first = true;
      const result = await ai.streamChat(input, (text, provider) => {
        send(first ? { text, provider } : { text });
        first = false;
      }, controller.signal);
      send({ done: true, provider: result.provider });
      res.end(); // The answer is complete before anything is saved
      recordUsageAfter({
        userId: req.user!.id, purchaseId: purchase.id, kind: 'CHAT', provider: result.provider, model: result.model,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.firstTextMs,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('AI chat error:', error);
      send({ error: error instanceof HttpError ? error.message : 'The AI is having problems right now. Try again in a moment.' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }));

  // Notes about a company from its website, for the profile's "Company notes"
  router.post('/company-research', route(async (req, res) => {
    const url = z.string().trim().min(3, 'Enter the company’s website.').max(500).parse(req.body.url);
    const purchase = await purchaseFor(req.user!.id, 'CHAT');
    const pages = await readSite(url);
    if (!pages.length) throw new HttpError(400, 'That website has almost no text to read. Paste the notes yourself.');
    const result = await ai.streamChat({
      tier: 'quality', system: RESEARCH_PROMPT, maxTokens: 1500,
      user: pages.map(p => `PAGE ${p.url}\n${p.text}`).join('\n\n'),
    }, () => {}, new AbortController().signal);
    await recordUsage({
      userId: req.user!.id, purchaseId: purchase.id, kind: 'CHAT', provider: result.provider, model: result.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
    });
    res.json({ notes: result.text.trim(), sources: pages.map(p => p.url) });
  }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

  router.post('/transcribe', upload.single('audio'), route(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No audio was sent.');
    const language = z.string().regex(/^[a-z]{2}$|^auto$/).default('en').parse(req.body.language);
    // Length of the recording, as measured by the app (counted against listening time)
    const seconds = z.coerce.number().min(0).max(600).default(0).parse(req.body.seconds);
    const purchase = await purchaseFor(req.user!.id, 'TRANSCRIBE');
    const result = await ai.transcribe(req.file.buffer, language, { keepFillers: req.body.fillers === '1' });
    res.json({ text: result.text });
    recordUsageAfter({
      userId: req.user!.id, purchaseId: purchase.id, kind: 'TRANSCRIBE', provider: result.provider, model: result.model,
      audioSeconds: seconds,
    });
  }));

  return router;
};
