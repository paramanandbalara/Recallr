// APPROXIMATE list prices (USD) of the AI models, to estimate what the AI costs against what plans earn.
// Providers change prices: check their pricing pages and update these now and then.

const CHAT: { match: RegExp; input: number; output: number }[] = [ // Per million tokens
  { match: /^openai\/gpt-oss-20b$/, input: 0.10, output: 0.50 },
  { match: /^openai\/gpt-oss-120b$/, input: 0.15, output: 0.75 },
  { match: /llama-4-scout/, input: 0.11, output: 0.34 },
  { match: /llama-4-maverick/, input: 0.20, output: 0.60 },
  { match: /^gpt-5(\.\d+)*-nano/, input: 0.05, output: 0.40 },
  { match: /^gpt-5(\.\d+)*-mini/, input: 0.25, output: 2.00 },
  { match: /^gpt-4\.1-mini/, input: 0.40, output: 1.60 },
  { match: /^gpt-4o-mini$/, input: 0.15, output: 0.60 },
];
const AUDIO: { match: RegExp; perHour: number }[] = [
  { match: /^whisper-large-v3-turbo$/, perHour: 0.04 },
  { match: /^whisper-large-v3$/, perHour: 0.111 },
  { match: /^gpt-4o-mini-transcribe$/, perHour: 0.18 },
  { match: /^whisper-1$/, perHour: 0.36 },
];
// For models missing above: the dearest known price, so the estimate errs high
const FALLBACK_CHAT = { input: 0.40, output: 2.00 };
const FALLBACK_AUDIO = 0.36;

export const USD_TO_INR = 84; // Rough; the reports say "approximate"

export interface UsageTotals {
  kind: 'CHAT' | 'TRANSCRIBE';
  model: string;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
}

export const costUsd = (u: UsageTotals) => {
  if (u.kind === 'TRANSCRIBE') {
    const price = AUDIO.find(p => p.match.test(u.model))?.perHour ?? FALLBACK_AUDIO;
    return (u.audioSeconds / 3600) * price;
  }
  const price = CHAT.find(p => p.match.test(u.model)) ?? FALLBACK_CHAT;
  return (u.inputTokens * price.input + u.outputTokens * price.output) / 1_000_000;
};

export const costPaise = (u: UsageTotals) => Math.round(costUsd(u) * USD_TO_INR * 100);
