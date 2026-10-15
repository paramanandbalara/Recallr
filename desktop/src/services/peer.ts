import { ApiError, request } from './account';

// Peer practice ("Practise with a friend"): two people interview each other on any call app; the Recallr server
// keeps the room (see server/src/routes/peer.ts). The candidate's app listens to their microphone and sends what
// they said; the AI score is counted on the candidate's plan.

export type PeerRole = 'interviewer' | 'candidate';

export interface PeerQuestion {
  id: string;
  text: string;
  source: 'resume' | 'common' | 'own';
  kind?: string;
}

export interface PeerTurn {
  id: string;
  question: string;
  askedAt: number;
  status: 'asked' | 'answering' | 'scoring' | 'scored' | 'failed' | 'skipped';
  transcript: string;
  seconds?: number;
  ai?: { score: number | null; good: string; improve: string; better: string };
  aiError?: string;
  rating?: { stars: number; comment: string };
}

export interface PeerRoom {
  code: string;
  link: string;
  status: 'WAITING' | 'ACTIVE' | 'ENDED';
  role: PeerRole;
  hostRole: PeerRole;
  host: { name: string; me: boolean };
  guest: { name: string; me: boolean } | null;
  candidate: { summary: string };
  questions: PeerQuestion[];
  turns: PeerTurn[];
  current: string | null;
  expiresAt: string;
  updatedAt: string;
  summary: { asked: number; answered: number; averageScore: number | null; averageRating: number | null } | null;
}

const post = async (path: string, body: unknown) => {
  const res = await request(`/peer${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (await res.json() as { room: PeerRoom }).room;
};

export const createRoom = (role: PeerRole, summary: string) => post('', { role, summary });
export const joinRoom = (code: string, summary: string) => post('/join', { code, summary });

// The room now, or null when it hasn't changed since `etag` (the server answers 304)
export const pollRoom = async (code: string, etag: string): Promise<{ room: PeerRoom; etag: string } | null> => {
  try {
    const res = await request(`/peer/${encodeURIComponent(code)}`, { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {} });
    const { room } = await res.json() as { room: PeerRoom };
    return { room, etag: res.headers.get('ETag') ?? '' };
  } catch (error) {
    if (error instanceof ApiError && error.status === 304) return null;
    throw error;
  }
};

export const askQuestion = (code: string, question: { questionId?: string; text?: string }) => post(`/${code}/ask`, question);
export const addQuestions = (code: string, questions: { text: string; kind?: string }[]) => post(`/${code}/questions`, { questions });
export const setSummary = (code: string, summary: string) => post(`/${code}/profile`, { summary });
export const sendTranscript = (code: string, turnId: string, text: string) => post(`/${code}/transcript`, { turnId, text });
export const sendAnswer = (code: string, turnId: string, text: string, seconds: number) => post(`/${code}/answer`, { turnId, text, seconds: Math.round(seconds) });
export const rateAnswer = (code: string, turnId: string, stars: number, comment: string) => post(`/${code}/rate`, { turnId, stars, comment });
export const endRoom = (code: string) => post(`/${code}/end`, {});

// "abc-123" → "ABC123"; a pasted link works too
export const codeFrom = (text: string) => {
  const fromLink = text.match(/\/practice\/join\/([A-Za-z0-9]{6})/);
  return (fromLink ? fromLink[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
};
