import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.js';

// Public pages are sent with their content already in the HTML, so search engines index them well

const INDEX = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta name="description" content="Default" />\n    <title>Recallr – AI interview assistant</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/assets/app.js"></script>\n  </body>\n</html>\n';

let app: Express;
let seo: typeof import('./seo.js');

beforeAll(async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'recallr-web-'));
  fs.writeFileSync(path.join(dist, 'index.html'), INDEX);
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  process.env.WEB_DIST = dist;
  process.env.PUBLIC_URL = 'https://recallr.example';
  const { createApp } = await import('./app.js');
  seo = await import('./seo.js');
  app = createApp({ razorpay: null });
});

beforeEach(async () => {
  await db.savedAnswer.deleteMany();
  await db.question.deleteMany();
  seo.clearPageCache();
});

const publish = (text: string, slug: string, category: 'ABOUT_YOU' | 'CODING' = 'ABOUT_YOU', published = true) => db.question.create({
  data: { text, textHash: slug, slug, category, published, guide: '## What they want\nA short story <b>about you</b>.\n- Start with now\n- Then the past\n```\nnot code really\n```' },
});

describe('pre-rendered pages', () => {
  it('fills in a question page: title, description, canonical, structured data and the guide', async () => {
    await publish('Tell me about yourself', 'tell-me-about-yourself');
    await publish('Why do you want this job?', 'why-this-job');
    const res = await request(app).get('/interview-questions/hr/tell-me-about-yourself');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Tell me about yourself – how to answer | Recallr</title>');
    expect(res.text).not.toContain('content="Default"');
    expect(res.text.match(/<title>/g)).toHaveLength(1);
    expect(res.text).toContain('<link rel="canonical" href="https://recallr.example/interview-questions/hr/tell-me-about-yourself" />');
    expect(res.text).toContain('<meta name="description" content="A short story &lt;b&gt;about you&lt;/b&gt;.');
    expect(res.text).toContain('<h1>Tell me about yourself</h1>');
    expect(res.text).toContain('<h2>What they want</h2>');
    expect(res.text).toContain('<ul><li>Start with now</li><li>Then the past</li></ul>');
    expect(res.text).toContain('<pre><code>not code really</code></pre>');
    expect(res.text).toContain('href="/interview-questions/hr/why-this-job"'); // Related questions
    expect(res.text).toContain('"@type":"Article"');
    expect(res.text).toContain('"@type":"BreadcrumbList"');
    expect(res.text).toContain('<script type="module" src="/assets/app.js"></script>'); // The website still takes over
  });

  it('lists questions on the library and category pages', async () => {
    await publish('Tell me about yourself', 'tell-me-about-yourself');
    await publish('Reverse a linked list', 'reverse-a-linked-list', 'CODING');
    await publish('A draft question', 'a-draft-question', 'CODING', false);
    const library = await request(app).get('/interview-questions');
    expect(library.text).toContain('href="/interview-questions/coding"');
    expect(library.text).toContain('Reverse a linked list');
    expect(library.text).not.toContain('A draft question');
    const coding = await request(app).get('/interview-questions/coding/');
    expect(coding.status).toBe(200);
    expect(coding.text).toContain('<h1>Coding questions</h1>');
    expect(coding.text).toContain('Reverse a linked list');
    expect(coding.text).not.toContain('Tell me about yourself');
  });

  it('answers 404 for unpublished, unknown or wrong-category questions', async () => {
    await publish('A draft question', 'a-draft-question', 'CODING', false);
    await publish('Tell me about yourself', 'tell-me-about-yourself');
    for (const url of ['/interview-questions/coding/a-draft-question', '/interview-questions/coding/tell-me-about-yourself', '/interview-questions/nope', '/interview-questions/hr/missing']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.text, url).toContain('<div id="root"></div>'); // The website shows its own "not found"
    }
  });

  it('shows a newly published question straight away', async () => {
    expect((await request(app).get('/interview-questions/hr/new-one')).status).toBe(404);
    await publish('A brand new question', 'new-one');
    seo.clearPageCache(); // What the admin's publish does
    expect((await request(app).get('/interview-questions/hr/new-one')).status).toBe(200);
  });

  it('gives static pages their own titles, and keeps private pages out of search', async () => {
    const pricing = await request(app).get('/pricing');
    expect(pricing.text).toContain('<title>Pricing – Recallr</title>');
    const account = await request(app).get('/account/settings');
    expect(account.status).toBe(200);
    expect(account.text).toContain('<meta name="robots" content="noindex" />');
    expect(account.text).not.toContain('rel="canonical"');
    const other = await request(app).get('/some/website/page');
    expect(other.status).toBe(200);
    expect(other.text).toBe(INDEX);
    expect((await request(app).get('/assets/app.js')).text).toBe('console.log(1)');
  });

  it('serves the sitemap and robots.txt', async () => {
    await publish('Tell me about yourself', 'tell-me-about-yourself');
    await publish('A draft question', 'a-draft-question', 'CODING', false);
    const map = await request(app).get('/sitemap.xml');
    expect(map.status).toBe(200);
    expect(map.headers['content-type']).toContain('xml');
    expect(map.text).toContain('<loc>https://recallr.example</loc>');
    expect(map.text).toContain('<loc>https://recallr.example/interview-questions/hr</loc>');
    expect(map.text).toMatch(/<loc>https:\/\/recallr\.example\/interview-questions\/hr\/tell-me-about-yourself<\/loc><lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
    expect(map.text).not.toContain('a-draft-question');
    expect(map.text).not.toContain('/interview-questions/coding<');
    const robots = await request(app).get('/robots.txt');
    expect(robots.text).toContain('Disallow: /admin');
    expect(robots.text).toContain('Sitemap: https://recallr.example/sitemap.xml');
  });

  it('keeps API 404s as JSON', async () => {
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found.');
  });
});
