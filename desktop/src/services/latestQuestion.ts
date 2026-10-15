import type { Turn } from '../components/ConversationFeed';

// Index of the newest real question; remarks heard while an answer was on screen (status 'skipped') don't count.
// The feed keeps this one in view, and what the user says on the mic is added under it. -1 if there is none.
export const latestQuestionIndex = (turns: Pick<Turn, 'status'>[]) => {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].status !== 'skipped') return i;
  return -1;
};
