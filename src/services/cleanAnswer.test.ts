import { describe, expect, it } from 'vitest';
import { cleanAnswer } from './cleanAnswer';

describe('cleanAnswer', () => {
  it('removes markdown, list markers and quotes', () => {
    expect(cleanAnswer('"**We** used it.\n- It was fast."')).toBe('We used it.\nIt was fast.');
  });

  it('turns long dashes into commas', () => {
    expect(cleanAnswer('It was slow — really slow.')).toBe('It was slow, really slow.');
  });

  it('keeps code blocks exactly, including indentation', () => {
    const code = '```sql\nSELECT *\n  FROM users -- you utilize this\n```';
    expect(cleanAnswer(`Here it is.\n${code}`)).toBe(`Here it is.\n${code}`);
  });

  describe('filler openers', () => {
    it.each([
      ['Sure, honestly, thanks for asking. I worked on the checkout API.', 'I worked on the checkout API.'],
      ['Of course! We used Postgres.', 'We used Postgres.'],
      ['Yeah — we used Kafka.', 'We used Kafka.'],
    ])('%s', (input, expected) => expect(cleanAnswer(input)).toBe(expected));

    it.each([
      'So far we have shipped three releases.',
      'Well-designed APIs matter to me.',
      'Right-sizing the cluster saved money.',
    ])('keeps real sentences: %s', input => expect(cleanAnswer(input)).toBe(input));
  });

  describe('AI words', () => {
    it.each([
      ['We leveraged Kafka, and additionally it facilitated retries.', 'We used Kafka, and also it helped retries.'],
      ['Furthermore, the robust pipeline made it seamless.', 'Also, the solid pipeline made it smooth.'],
      ['Under the hood, Node uses libuv.', 'Internally, Node uses libuv.'],
      ['It works out of the box.', 'It works by default.'],
      ['Utilizing the numerous replicas was crucial.', 'Using the many replicas was important.'],
    ])('%s', (input, expected) => expect(cleanAnswer(input)).toBe(expected));

    it('never changes `names` in backticks', () => {
      expect(cleanAnswer('We called `ensureCapacity()` in order to avoid resizing.')).toBe('We called `ensureCapacity()` to avoid resizing.');
    });
  });

  describe('hedges', () => {
    it.each([
      ['I think the event loop runs callbacks.', 'The event loop runs callbacks.'],
      ['It took, I think, two weeks.', 'It took two weeks.'],
      ['It was hard. Honestly, it took a while, to be honest.', 'It was hard. It took a while.'],
      ['It was kind of slow at first.', 'It was slow at first.'],
      ['We sort of rewrote it.', 'We rewrote it.'],
    ])('%s', (input, expected) => expect(cleanAnswer(input)).toBe(expected));

    it.each([
      'I think about latency a lot.',
      'What kind of database did we use? Postgres.',
      'This kind of bug is common.',
    ])('keeps real wording: %s', input => expect(cleanAnswer(input)).toBe(input));
  });

  describe('generic "you"', () => {
    it.each([
      ['You don’t want to index everything.', 'We don’t want to index everything.'],
      ["If you don't index it, it gets slow.", "If we don't index it, it gets slow."],
      ['If your table is huge, you’d add an index.', 'If our table is huge, we’d add an index.'],
      ['You can scale it yourself.', 'We can scale it ourselves.'],
      ['It gives you more control over retries.', 'It gives me more control over retries.'],
      ['It lets you scale reads, which helps you a lot.', 'It lets me scale reads, which helps me a lot.'],
    ])('%s', (input, expected) => expect(cleanAnswer(input)).toBe(expected));

    it('keeps "you" that means the interviewer', () => {
      expect(cleanAnswer('Thank you, as you mentioned the cache matters.')).toBe('Thank you, as you mentioned the cache matters.');
    });
  });
});
