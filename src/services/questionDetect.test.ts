import { describe, expect, it } from 'vitest';
import { classifyQuestion, isLikelyQuestion } from './questionDetect';

describe('isLikelyQuestion', () => {
  it.each([
    'Can you tell me about yourself?',
    'Walk me through your last project',
    'What is the event loop',
    "I'd like to hear about a time you disagreed with your manager",
  ])('answers real questions: %s', text => expect(isLikelyQuestion(text)).toBe(true));

  it.each(['example', 'Example?', 'Any example?', 'why?', 'tell me more', 'code?', 'And in Java?'])(
    'answers short follow-ups: %s',
    text => expect(isLikelyQuestion(text)).toBe(true),
  );

  it.each(['okay', 'yeah great thanks', 'hmm okay', 'Thank you.', 'Sorry, one second'])(
    'waits on filler: %s',
    text => expect(isLikelyQuestion(text)).toBe(false),
  );
});

describe('isLikelyQuestion in other languages', () => {
  it.each([
    ['apne experience ke baare mein batao', 'hi'],
    ['अपने बारे में बताइए', 'hi'],
    ['Kafka kya hai?', 'auto'],
  ])('answers: %s', (text, language) => expect(isLikelyQuestion(text, language)).toBe(true));

  it.each([['haan ji', 'hi'], ['achha theek hai', 'hi'], ['okay', 'auto']])(
    'waits on filler: %s',
    (text, language) => expect(isLikelyQuestion(text, language)).toBe(false),
  );
});

describe('classifyQuestion', () => {
  it.each([
    ['Write a SQL query for the top 3 customers by revenue', 'coding'],
    ['Can you implement an LRU cache?', 'coding'],
    ['How would you design a rate limiter for our API?', 'design'],
    ['Design a URL shortener', 'design'],
    ['Tell me about a time you disagreed with your manager', 'experience'],
    ['What was the most challenging project you worked on?', 'experience'],
    ['Tell me about yourself', 'about-you'],
    ['Why should we hire you?', 'about-you'],
    ['What is the event loop?', 'concept'],
    ['Explain the difference between a process and a thread', 'concept'],
    ['example?', 'other'],
    ['code?', 'coding'],
    ['Can you show me the code for that?', 'coding'],
  ])('%s → %s', (text, kind) => expect(classifyQuestion(text)).toBe(kind));
});
