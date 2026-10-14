import { request } from './account';

// Answered questions go to the account's question bank (see server/src/routes/questions.ts): the question
// always, the answer only while "Save my questions and answers" is on. Sent in small batches; if the
// server can't be reached they're dropped, as the interview itself matters more.

export interface AnsweredQuestion {
  question: string;
  answer: string;
  kind: string;
  source: 'ai' | 'prepared';
  provider: string;
}

const SEND_AFTER_MS = 3000;
const queue: AnsweredQuestion[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const flush = async () => {
  timer = null;
  const items = queue.splice(0, 20);
  if (!items.length) return;
  try {
    await request('/questions/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
  } catch (error) {
    console.warn('Could not save answered questions:', error);
  }
  if (queue.length) timer = setTimeout(flush, SEND_AFTER_MS);
};

export const recordAnswered = (item: AnsweredQuestion) => {
  queue.push(item);
  timer ??= setTimeout(flush, SEND_AFTER_MS);
};

export const setSaveAnswers = async (saveAnswers: boolean) => {
  await request('/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saveAnswers }) });
};
