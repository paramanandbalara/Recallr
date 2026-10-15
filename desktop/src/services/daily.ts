import { request } from './account';

// The question of the day (server/src/routes/daily.ts): one question for everyone each day, answered by typing or
// voice, with AI feedback counted on the plan, and a streak of practice days.

export interface DailyAnswer {
  answer: string;
  score: number | null;
  feedback: { good: string; improve: string; better: string } | null;
  updatedAt: string;
}

export interface Daily {
  question: { id: string; date: string; text: string; category: string } | null;
  answer: DailyAnswer | null;
  streak: number;
  days: { date: string; done: boolean }[];
}

export const fetchDaily = async () => (await request('/daily')).json() as Promise<Daily>;

export const answerDaily = async (questionId: string, answer: string) => {
  const res = await request('/daily/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId, answer }) });
  return res.json() as Promise<{ answer: DailyAnswer; streak: number }>;
};
