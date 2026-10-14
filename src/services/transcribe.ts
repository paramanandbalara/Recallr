import OpenAI from 'openai';
import { client, describeAiError, PROVIDERS, type ProviderId } from './llm';
import type { Settings } from './storage';

// Speech-to-text: Groq Whisper is the fastest; OpenAI is the fallback.
const MODELS: Record<ProviderId, string[]> = {
  groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  openai: ['gpt-4o-mini-transcribe', 'whisper-1'],
};

const PROMPT = 'This is a corporate job interview. Transcribe accurately.';

// On unclear or near-silent audio Whisper sometimes repeats the prompt back ("Transcribe accurately. Transcribe.").
// Drop sentences that are only that echo (real speech that mentions "transcribe" is kept); '' means there was no speech.
const PROMPT_ECHO = /^(?:this is a (?:corporate )?job interview|transcribe(?: (?:it|this|that))?(?: accurately| to the question)?)$/i;
export const stripPromptEcho = (text: string) => text
  .split(/(?<=[.!?])\s+/)
  .filter(sentence => !PROMPT_ECHO.test(sentence.replace(/[.,!?\s]+$/, '').trim()))
  .join(' ')
  .trim();

// Remember which model works per provider, so a retired one is only tried once
const workingModel: Partial<Record<ProviderId, string>> = {};

const isModelUnavailable = (error: unknown) =>
  error instanceof OpenAI.APIError && (error.status === 404 || (error.status === 400 && /model/i.test(error.message)));

const transcribeWith = async (provider: ProviderId, apiKey: string, file: File) => {
  const candidates = workingModel[provider] ? [workingModel[provider]!] : MODELS[provider];
  let lastError: unknown;
  for (const model of candidates) {
    try {
      const result = await client(provider, apiKey).audio.transcriptions.create({
        file,
        model,
        language: 'en',
        prompt: PROMPT,
        response_format: 'json',
        ...(provider === 'groq' ? { temperature: 0 } : {}), // Reduces hallucination
      });
      workingModel[provider] = model;
      return stripPromptEcho(result.text);
    } catch (error) {
      lastError = error;
      if (!isModelUnavailable(error)) throw error;
    }
  }
  throw lastError;
};

export const canTranscribe = (settings: Pick<Settings, 'groqKey' | 'openaiKey'>) =>
  settings.groqKey.trim().length > 10 || settings.openaiKey.trim().length > 10;

// Returns the transcribed text, trying Groq first, then OpenAI
export const transcribeAudio = async (blob: Blob, settings: Pick<Settings, 'groqKey' | 'openaiKey'>): Promise<string> => {
  const file = new File([blob], 'audio.webm', { type: 'audio/webm' });
  const order: ProviderId[] = (['groq', 'openai'] as const).filter(p => settings[PROVIDERS[p].keyField].trim().length > 10);
  if (order.length === 0) throw new Error('Speech-to-text needs a Groq or OpenAI key. Add one in Settings → API keys.');

  let lastError: unknown;
  for (const provider of order) {
    try {
      return await transcribeWith(provider, settings[PROVIDERS[provider].keyField], file);
    } catch (error) {
      console.error(`${PROVIDERS[provider].label} transcription error:`, error);
      lastError = error;
    }
  }
  throw new Error(describeAiError(lastError));
};
