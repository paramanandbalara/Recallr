import type { Turn } from '../components/ConversationFeed';
import type { InterviewReview } from './ai';

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
}

export type SessionSummary = Omit<Session, 'turns' | 'review'> & { questionCount: number; hasReview: boolean };

const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T | undefined> =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.invoke(channel, ...args);

export const saveSession = (session: Session) => invoke<void>('sessions:save', session);
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
export const exportFile = async (name: string, kind: 'md' | 'pdf', content: string) =>
  (await invoke<boolean>('export:file', { name, kind, content })) ?? false;
