import { describe, expect, it } from 'vitest';
import { classifyIncoming, continuesQuestion, isStrongQuestion, shouldAnswerOnPause } from './turnRules';

describe('one question in two pieces', () => {
  it('joins a piece that carries on the question', () => {
    expect(continuesQuestion('How would you design a cache', 'for a global app?')).toBe(true);
    expect(continuesQuestion('Tell me about a project you led,', 'especially one with a tight deadline.')).toBe(true);
    expect(continuesQuestion('What is the difference between a process', 'and a thread?')).toBe(true);
    expect(continuesQuestion('How do you handle conflicts in a team', 'where people are senior to you?')).toBe(true);
  });

  it('does not join a new question or a remark', () => {
    expect(continuesQuestion('How would you design a cache?', 'What is a load balancer?')).toBe(false);
    expect(continuesQuestion('Tell me about yourself.', 'Okay.')).toBe(false);
    expect(continuesQuestion('Why do you want to join us?', 'Can you explain Kafka partitions?')).toBe(false);
  });

  it('merges only right after the early answer started, and not once much of it is written', () => {
    const early = 'How would you design a cache';
    expect(classifyIncoming('for a global app?', { early, sinceMs: 1200, answerWords: 10, busy: true })).toBe('merge');
    expect(classifyIncoming('for a global app?', { early, sinceMs: 6000, answerWords: 10, busy: true })).toBe('aside');
    expect(classifyIncoming('for a global app?', { early, sinceMs: 1200, answerWords: 120, busy: true })).toBe('aside');
  });
});

describe('other talk while an answer is on screen', () => {
  it('treats remarks and side talk as asides', () => {
    for (const text of ['No worries, take your time.', 'Sorry, someone is at the door, one moment.', 'Yeah I think the recording is on now guys', 'Right, okay, that makes sense to me.']) {
      expect(classifyIncoming(text, { busy: true }), text).toBe('aside');
    }
  });

  it('still answers a clear new question', () => {
    for (const text of ['Can you explain how Kafka partitions work?', 'What is the difference between TCP and UDP?', 'Tell me about a time you failed.']) {
      expect(classifyIncoming(text, { busy: true }), text).toBe('question');
    }
  });

  it('is looser when nothing else is being answered', () => {
    expect(classifyIncoming('I would like to hear about your last project at work', { busy: false })).toBe('question');
    expect(shouldAnswerOnPause('I would like to hear about your last project at work', false)).toBe(true);
    expect(shouldAnswerOnPause('I would like to hear about your last project at work', true)).toBe(false);
    expect(isStrongQuestion('Okay great thanks')).toBe(false);
  });
});
