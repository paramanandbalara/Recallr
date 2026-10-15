import { describe, expect, it } from 'vitest';
import { latestQuestionIndex } from './latestQuestion';

describe('latestQuestionIndex', () => {
  it('skips remarks heard after the question', () => {
    expect(latestQuestionIndex([{ status: 'done' }, { status: 'answering' }, { status: 'skipped' }, { status: 'skipped' }])).toBe(1);
  });

  it('is the last turn when it is a question', () => {
    expect(latestQuestionIndex([{ status: 'skipped' }, { status: 'listening' }])).toBe(1);
  });

  it('is -1 with no questions', () => {
    expect(latestQuestionIndex([])).toBe(-1);
    expect(latestQuestionIndex([{ status: 'skipped' }])).toBe(-1);
  });
});
