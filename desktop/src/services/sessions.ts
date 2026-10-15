import type { Turn } from '../components/ConversationFeed';
import type { InterviewReview } from './ai';
import type { ReplayItem } from './answerReplay';
import { isRestoring } from './storage';

// Past conversations, saved as files by the main process (see electron/main.ts)

export interface Session {
  id: string;
  title: string;
  profileId: string;
  profileName: string;
  startedAt: number;
  updatedAt: number;
  turns: Turn[];
  review?: InterviewReview; // Kept when the conversation is saved again without it
  replay?: ReplayItem[];    // Answer replay: stronger versions of what was said (written on demand, then kept)
}

export type SessionSummary = Omit<Session, 'turns' | 'review' | 'replay'> & { questionCount: number; hasReview: boolean };

const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T | undefined> =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.invoke(channel, ...args);

// Not while a backup is being restored: the window reloads right after and must not overwrite it
export const saveSession = (session: Session) => (isRestoring() ? Promise.resolve(undefined) : invoke<void>('sessions:save', session));
export const listSessions = async (query = '') => (await invoke<SessionSummary[]>('sessions:list', query)) ?? [];
export const loadSession = async (id: string) => (await invoke<Session | null>('sessions:get', id)) ?? null;
export const deleteSession = (id: string) => invoke<void>('sessions:delete', id);

// Only conversations with at least one answer are worth keeping
export const hasAnswers = (turns: Turn[]) => turns.some(t => t.status === 'done' && t.answer);

// Named after the first real question
export const sessionTitle = (turns: Turn[]) => {
  const first = turns.find(t => t.status !== 'skipped' && t.question.trim())?.question.trim() ?? 'Untitled conversation';
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
};

// Ask where to save, then write the file. Returns false if the user cancelled.
export const exportFile = async (name: string, kind: 'md' | 'pdf' | 'json', content: string) =>
  (await invoke<boolean>('export:file', { name, kind, content })) ?? false;

// Real questions from past interviews for practice: weak spots from reviews first, then the rest shuffled
export const pastInterviewQuestions = async (count: number, recentSessions = 30): Promise<string[]> => {
  const summaries = (await listSessions()).slice(0, recentSessions);
  const sessions = (await Promise.all(summaries.map(s => loadSession(s.id)))).filter((s): s is Session => !!s);
  const weak = sessions.flatMap(s => s.review?.weakSpots.map(w => w.question) ?? []);
  const asked = sessions
    .flatMap(s => s.turns.filter(t => t.status === 'done' && t.question.trim().length > 15).map(t => t.question.trim()))
    .sort(() => Math.random() - 0.5);
  const seen = new Set<string>();
  const key = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return [...weak, ...asked].filter(q => !seen.has(key(q)) && seen.add(key(q))).slice(0, count);
};
