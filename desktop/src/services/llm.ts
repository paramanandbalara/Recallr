import { ApiError, request } from './account';

// AI answers come from the Recallr server, which picks the provider and model (Groq, OpenAI or Claude,
// in the order set in Admin → Settings) and counts the tokens against the user's plan.

export type ProviderId = 'groq' | 'openai' | 'claude';
export type ModelTier = 'fast' | 'quality' | 'vision'; // fast = live answers, quality = background jobs, vision = reads screenshots

export const PROVIDERS: Record<ProviderId, { label: string }> = {
  groq: { label: 'Groq' },
  openai: { label: 'OpenAI' },
  claude: { label: 'Claude' },
};

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

// The server streams one JSON object per line: {"text"} pieces (the first also has "provider"),
// then {"done":true} or {"error":"..."}
type StreamLine = { text?: string; provider?: ProviderId; done?: boolean; error?: string };

// onText receives the full text so far
export const streamChat = async (req: ChatRequest, onText: (text: string) => void): Promise<string> => {
  const { signal, onFirstText, ...body } = req;
  const res = await request('/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const handle = (line: string) => {
    if (!line.trim()) return;
    const data: StreamLine = JSON.parse(line);
    if (data.error) throw new ApiError(502, data.error, 'AI_ERROR');
    if (data.text) {
      if (!text) onFirstText?.(data.provider ?? 'groq');
      text += data.text;
      onText(text);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(buffer + decoder.decode());
  return text;
};

export const completeChat = (req: ChatRequest) => streamChat(req, () => {});

// Turn any error into a message the user can act on
export const describeAiError = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.status === 402 ? `${error.message} Open Settings → Account to buy more.` : error.message;
  }
  return error instanceof Error ? error.message : 'Unknown error talking to the AI.';
};
