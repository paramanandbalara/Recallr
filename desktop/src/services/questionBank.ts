import { request } from './account';
import { loadActiveProfile } from './storage';

// Answered questions go to the account's question bank (see server/src/routes/questions.ts): the question
// always, the answer only while "Save my questions and answers" is on. Sent in small batches; if the
// server can't be reached they're dropped, as the interview itself matters more.

export interface AnsweredQuestion {
  question: string;
  answer: string;
  kind: string;
  source: 'ai' | 'prepared';
  provider: string;
  company?: string; // The interview's company; the active profile's when not given (for company question packs)
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

const activeCompany = () => {
  try {
    return loadActiveProfile().company.trim();
  } catch {
    return '';
  }
};

export const recordAnswered = (item: AnsweredQuestion) => {
  queue.push({ ...item, company: (item.company ?? activeCompany()).slice(0, 200) });
  timer ??= setTimeout(flush, SEND_AFTER_MS);
};

export const setSaveAnswers = async (saveAnswers: boolean) => {
  await request('/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saveAnswers }) });
};

// ---------- Questions asked at a company ----------

// Questions people were asked at one company (only questions, and only once enough people were asked there)
export interface CompanyPack {
  company: { name: string; slug: string };
  questions: { text: string; category: string; askedBy: number }[];
}

// The pack for the profile's company, or null when there isn't one (or the server can't be reached)
export const fetchCompanyPack = async (company: string): Promise<CompanyPack | null> => {
  if (!company.trim()) return null;
  try {
    const res = await request(`/questions/company-packs?company=${encodeURIComponent(company.trim().slice(0, 300))}`);
    const { pack } = (await res.json()) as { pack: CompanyPack | null };
    return pack?.questions.length ? pack : null;
  } catch {
    return null;
  }
};
