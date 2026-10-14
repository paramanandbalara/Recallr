import { describe, expect, it } from 'vitest';
import { pastInterviewQuestions } from './sessions';

const turn = (question: string, status = 'done') => ({ id: question, question, answer: 'An answer.', status });
const saved = {
  a: { id: 'a', title: 'A', profileId: 'p', profileName: 'P', startedAt: 1, updatedAt: 2,
    turns: [turn('Tell me about a time you missed a deadline'), turn('okay', 'skipped'), turn('What is the event loop in Node?')],
    review: { weakSpots: [{ question: 'Why do you want to work at Shopify?', why: '', fix: '' }] } },
  b: { id: 'b', title: 'B', profileId: 'p', profileName: 'P', startedAt: 3, updatedAt: 4,
    turns: [turn('What is the event loop in Node?'), turn('Why do you want to work at Shopify?')] },
};

// The main process side of History, faked
Object.defineProperty(globalThis, 'window', {
  value: {
    ipcRenderer: {
      invoke: async (channel: string, arg: string) => {
        if (channel === 'sessions:list') return Object.values(saved).map(({ id, title, updatedAt, turns }) => ({ id, title, updatedAt, questionCount: turns.length }));
        if (channel === 'sessions:get') return saved[arg as keyof typeof saved] ?? null;
        return undefined;
      },
    },
  },
});

describe('pastInterviewQuestions', () => {
  it('puts weak spots first, skips small talk and duplicates', async () => {
    const questions = await pastInterviewQuestions(10);
    expect(questions[0]).toBe('Why do you want to work at Shopify?');
    expect(questions).toHaveLength(3);
    expect(questions).not.toContain('okay');
  });

  it('returns at most the number asked for', async () => {
    expect(await pastInterviewQuestions(2)).toHaveLength(2);
  });
});
