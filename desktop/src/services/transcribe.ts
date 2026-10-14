import { request } from './account';
import { describeAiError } from './llm';

// Speech-to-text through the Recallr server (Groq Whisper first, OpenAI as the fallback).
// The recording's length counts against the plan's listening time.

// On unclear or near-silent audio Whisper sometimes repeats the prompt back ("Transcribe accurately. Transcribe.").
// Drop sentences that are only that echo (real speech that mentions "transcribe" is kept); '' means there was no speech.
const PROMPT_ECHO = /^(?:this is a (?:corporate )?job interview|transcribe(?: (?:it|this|that))?(?: accurately| to the question)?)$/i;
export const stripPromptEcho = (text: string) => text
  .split(/(?<=[.!?])\s+/)
  .filter(sentence => !PROMPT_ECHO.test(sentence.replace(/[.,!?\s]+$/, '').trim()))
  .join(' ')
  .trim();

// `seconds` is how long the recording is
export const transcribeAudio = async (blob: Blob, language = 'en', seconds = 0): Promise<string> => {
  const form = new FormData();
  form.append('audio', new File([blob], 'audio.webm', { type: 'audio/webm' }));
  form.append('language', language);
  form.append('seconds', String(Math.round(seconds * 10) / 10));
  try {
    const res = await request('/ai/transcribe', { method: 'POST', body: form });
    const { text } = await res.json() as { text: string };
    return stripPromptEcho(text);
  } catch (error) {
    throw new Error(describeAiError(error), { cause: error });
  }
};
