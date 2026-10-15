import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway, ChatRequest } from './ai.js';

// The blog: public pages, the admin editor, AI drafts, the daily AI post and the pre-rendered pages

const INDEX = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta name="description" content="Default" />\n    <title>Recallr</title>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n';

const BODY = `Interviews feel easier when you know what is coming. This guide walks through it step by step, with examples.

## Before the interview
Read the job description twice. Note three things the role needs and one story for each.
- Pick one project you can explain in two minutes
- Practise out loud, not only in your head

## During the interview
Listen to the whole question before you answer. A short pause is fine.

## After the interview
Send a short thank-you note the same day.`;

// A fake AI: suggests a topic when asked to plan, otherwise writes an article about the topic it was given
const calls: ChatRequest[] = [];
let aiFails = false;
let draftReply: ((topic: string) => string) | null = null;
const reply = (text: string) => ({ text, provider: 'claude' as const, model: 'claude-test', inputTokens: 100, outputTokens: 500 });
const ai: AiGateway = {
  streamChat: async req => {
    calls.push(req);
    if (aiFails) throw new Error('All providers failed');
    if (req.system.includes('You plan articles')) return reply('{"topic": "Answering salary expectation questions"}');
    const topic = req.user.replace(/^Topic:\s*/, '');
    if (draftReply) return reply(draftReply(topic));
    return reply('```json\n' + JSON.stringify({
      title: `Guide: ${topic}`, summary: `How to handle ${topic.toLowerCase()} calmly.`, tags: ['Interview Tips', 'freshers', 'HR round', 'resume', 'extra'],
      body: `# Guide: ${topic}\n\n${BODY}`,
    }) + '\n```');
  },
  transcribe: async () => ({ text: '', provider: 'groq', model: 'whisper-test' }),
};

let app: Express;
let db: typeof import('./db.js')['db'];
let seo: typeof import('./seo.js');
let blog: typeof import('./blog.js');
let settings: typeof import('./settings.js');

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token as string;
};

const post = (slug: string, data: { title?: string; status?: 'DRAFT' | 'PUBLISHED'; tags?: string; publishedAt?: Date; source?: 'ADMIN' | 'AI'; createdAt?: Date } = {}) => {
  const status = data.status ?? 'PUBLISHED';
  return db.blogPost.create({
    data: {
      slug, title: data.title ?? slug.replace(/-/g, ' '), summary: `About ${slug}`, body: BODY, tags: data.tags ?? '', status, source: data.source ?? 'ADMIN',
      publishedAt: status === 'PUBLISHED' ? data.publishedAt ?? new Date() : null, ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
  });
};

let admin: string;

beforeAll(async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'recallr-web-'));
  fs.writeFileSync(path.join(dist, 'index.html'), INDEX);
  process.env.WEB_DIST = dist;
  process.env.PUBLIC_URL = 'https://recallr.example';
  ({ db } = await import('./db.js'));
  seo = await import('./seo.js');
  blog = await import('./blog.js');
  settings = await import('./settings.js');
  app = (await import('./app.js')).createApp({ ai, razorpay: null });
});

beforeEach(async () => {
  calls.length = 0;
  aiFails = false;
  draftReply = null;
  await db.blogPost.deleteMany();
  await db.auditLog.deleteMany();
  await db.setting.deleteMany();
  settings.clearSettingsCache();
  await db.enquiry.deleteMany();
  await db.question.deleteMany();
  await db.organization.deleteMany();
  await db.device.deleteMany();
  await db.trialClaim.deleteMany();
  await db.usageEvent.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.coupon.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  seo.clearPageCache();
  admin = await register('admin@example.com');
});

describe('public blog', () => {
  it('lists only published posts, newest first, with tags and paging', async () => {
    await post('older-post', { tags: 'resume,freshers', publishedAt: new Date('2026-09-01') });
    await post('newer-post', { tags: 'resume', publishedAt: new Date('2026-10-01') });
    await post('a-draft', { status: 'DRAFT', tags: 'resume' });
    const res = await request(app).get('/api/public/blog').expect(200);
    expect(res.body.posts.map((p: { slug: string }) => p.slug)).toEqual(['newer-post', 'older-post']);
    expect(res.body.total).toBe(2);
    expect(res.body.posts[0]).toMatchObject({ title: 'newer post', tags: ['resume'], readingMinutes: 1 });
    expect(res.body.posts[0].body).toBeUndefined();
    expect(res.body.tags).toEqual([{ tag: 'resume', count: 2 }, { tag: 'freshers', count: 1 }]);

    const tagged = await request(app).get('/api/public/blog?tag=Freshers').expect(200);
    expect(tagged.body.posts.map((p: { slug: string }) => p.slug)).toEqual(['older-post']);
    expect((await request(app).get('/api/public/blog?tag=fresh')).body.posts).toHaveLength(0); // Whole tags only

    for (let i = 0; i < 12; i++) await post(`bulk-${i}`, { publishedAt: new Date(Date.UTC(2026, 7, i + 1)) });
    const page2 = await request(app).get('/api/public/blog?page=2').expect(200);
    expect(page2.body.total).toBe(14);
    expect(page2.body.posts).toHaveLength(2);
  });

  it('shows a published post with related ones, and hides drafts', async () => {
    await post('main-post', { tags: 'hr round,resume', publishedAt: new Date('2026-10-01') });
    await post('same-tag', { tags: 'resume', publishedAt: new Date('2026-08-01') });
    await post('newest-other', { tags: 'coding', publishedAt: new Date('2026-10-10') });
    await post('other-2', { tags: 'coding', publishedAt: new Date('2026-07-01') });
    await post('other-3', { tags: 'coding', publishedAt: new Date('2026-06-01') });
    await post('draft-same-tag', { status: 'DRAFT', tags: 'resume' });
    const res = await request(app).get('/api/public/blog/main-post').expect(200);
    expect(res.body.post).toMatchObject({ slug: 'main-post', tags: ['hr round', 'resume'], body: BODY });
    expect(res.body.related.map((p: { slug: string }) => p.slug)).toEqual(['same-tag', 'newest-other', 'other-2']);
    expect((await request(app).get('/api/public/blog/draft-same-tag')).status).toBe(404);
    expect((await request(app).get('/api/public/blog/missing')).status).toBe(404);
  });
});

describe('admin blog', () => {
  it('is for admins only', async () => {
    const user = await register('priya@example.com');
    expect((await request(app).get('/api/admin/blog')).status).toBe(401);
    expect((await request(app).get('/api/admin/blog').set(auth(user))).status).toBe(403);
    expect((await request(app).post('/api/admin/blog').set(auth(user)).send({ title: 'Hello there' })).status).toBe(403);
    expect((await request(app).post('/api/admin/blog/draft').set(auth(user)).send({ topic: 'Salary talks' })).status).toBe(403);
    await request(app).get('/api/admin/blog').set(auth(admin)).expect(200);
  });

  it('creates, edits, publishes, unpublishes and deletes posts', async () => {
    const created = await request(app).post('/api/admin/blog').set(auth(admin))
      .send({ title: 'How to answer “Why us?”', summary: 'Short', body: BODY, tags: 'HR Round, #resume, hr round' }).expect(201);
    const { id } = created.body.post;
    expect(created.body.post).toMatchObject({ slug: 'how-to-answer-why-us', status: 'DRAFT', source: 'ADMIN', tags: ['hr round', 'resume'], publishedAt: null });
    expect((await db.blogPost.findUnique({ where: { id } }))!.tags).toBe('hr round,resume');

    // Same title: a free address is picked; a taken address given by hand is refused
    const second = await request(app).post('/api/admin/blog').set(auth(admin)).send({ title: 'How to answer “Why us?”', body: BODY }).expect(201);
    expect(second.body.post.slug).toBe('how-to-answer-why-us-2');
    expect((await request(app).post('/api/admin/blog').set(auth(admin)).send({ title: 'Another', slug: 'how-to-answer-why-us' })).status).toBe(409);
    expect((await request(app).post('/api/admin/blog').set(auth(admin)).send({ title: 'Another', slug: 'Not A Slug' })).status).toBe(400);
    expect((await request(app).post('/api/admin/blog').set(auth(admin)).send({ title: 'Empty', status: 'PUBLISHED' })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/blog/${id}`).set(auth(admin)).send({ slug: 'how-to-answer-why-us-2' })).status).toBe(409);

    // A draft's address can change; it's hidden from the public until published
    await request(app).patch(`/api/admin/blog/${id}`).set(auth(admin)).send({ slug: 'why-us' }).expect(200);
    expect((await request(app).get('/api/public/blog/why-us')).status).toBe(404);

    const published = await request(app).patch(`/api/admin/blog/${id}`).set(auth(admin)).send({ status: 'PUBLISHED' }).expect(200);
    const publishedAt = published.body.post.publishedAt;
    expect(publishedAt).toBeTruthy();
    await request(app).get('/api/public/blog/why-us').expect(200);

    // Published: the address stays, edits keep the first publish date
    expect((await request(app).patch(`/api/admin/blog/${id}`).set(auth(admin)).send({ slug: 'why-this-company' })).status).toBe(400);
    await request(app).patch(`/api/admin/blog/${id}`).set(auth(admin)).send({ slug: 'why-us', title: 'Why us? A better answer' }).expect(200);
    await request(app).patch(`/api/admin/blog/${id}`).set(auth(admin)).send({ status: 'DRAFT' }).expect(200);
    expect((await request(app).get('/api/public/blog/why-us')).status).toBe(404);
    const again = await request(app).patch(`/api/admin/blog/${id}`).set(auth(admin)).send({ status: 'PUBLISHED' }).expect(200);
    expect(again.body.post.publishedAt).toBe(publishedAt);
    expect(again.body.post.title).toBe('Why us? A better answer');

    const list = await request(app).get('/api/admin/blog?status=PUBLISHED').set(auth(admin)).expect(200);
    expect(list.body.posts.map((p: { id: string }) => p.id)).toEqual([id]);
    expect(list.body.posts[0]).toMatchObject({ author: 'admin' });
    expect(list.body.posts[0].body).toBeUndefined();
    expect(list.body.drafts).toBe(1);
    expect((await request(app).get(`/api/admin/blog/${id}`).set(auth(admin))).body.post.body).toBe(BODY);

    await request(app).delete(`/api/admin/blog/${id}`).set(auth(admin)).expect(200);
    expect((await request(app).delete(`/api/admin/blog/${id}`).set(auth(admin))).status).toBe(404);
    expect((await request(app).get('/api/public/blog/why-us')).status).toBe(404);

    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(a => a.action);
    expect(actions).toEqual(expect.arrayContaining(['blog.create', 'blog.update', 'blog.publish', 'blog.unpublish', 'blog.delete']));
  });

  it('drafts a post with AI without saving it', async () => {
    const res = await request(app).post('/api/admin/blog/draft').set(auth(admin)).send({ topic: 'Group discussions in campus placements' }).expect(200);
    expect(res.body.draft).toMatchObject({
      title: 'Guide: Group discussions in campus placements',
      summary: 'How to handle group discussions in campus placements calmly.',
      tags: ['interview tips', 'freshers', 'hr round', 'resume'], // At most 4
    });
    expect(res.body.draft.body.startsWith('Interviews feel easier')).toBe(true); // The repeated title is dropped
    expect(calls[0]).toMatchObject({ tier: 'quality', json: true, user: 'Topic: Group discussions in campus placements' });
    expect(calls[0].system).toContain('700 to 1100 words');
    expect(await db.blogPost.count()).toBe(0);

    draftReply = () => 'Sorry, I cannot do that.';
    expect((await request(app).post('/api/admin/blog/draft').set(auth(admin)).send({ topic: 'Anything at all' })).status).toBe(502);
    expect((await request(app).post('/api/admin/blog/draft').set(auth(admin)).send({ topic: '' })).status).toBe(400);
  });
});

describe('parsing AI drafts', () => {
  it('reads JSON with text around it and fixes up the summary and tags', () => {
    const long = 'word '.repeat(60);
    const draft = blog.parseBlogDraft(`Here you go:\n{"title": "## Salary talks", "summary": "${long}", "tags": "Salary, Negotiation", "body": ${JSON.stringify(`### Start\n**Be calm.** ${BODY}`)}}\nThanks`);
    expect(draft).toMatchObject({ title: 'Salary talks', tags: ['salary', 'negotiation'] });
    expect(draft!.summary.length).toBeLessThanOrEqual(155);
    expect(draft!.body.startsWith('## Start\nBe calm.')).toBe(true);
    expect(blog.parseBlogDraft('{"title": "Short", "body": "too short"}')).toBeNull();
    expect(blog.parseBlogDraft('not json')).toBeNull();
    expect(blog.parseBlogDraft('{broken')).toBeNull();
  });
});

describe('daily AI post', () => {
  const DAY_8_IST = new Date('2026-10-15T02:30:00Z');
  const nextDay = (d: Date, n = 1) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
  const configure = async (values: Record<string, string>) => {
    await settings.saveSettings({ groqApiKey: 'gsk_test_key', ...values }, 'test');
  };

  it('does nothing without an AI key, when off, or before 07:00 in India', async () => {
    expect(await blog.postDailyBlog(ai, DAY_8_IST)).toBeNull(); // Default "draft", but no key
    await configure({ blogAutoPost: 'off' });
    expect(await blog.postDailyBlog(ai, DAY_8_IST)).toBeNull();
    await configure({ blogAutoPost: 'draft' });
    expect(await blog.postDailyBlog(ai, new Date('2026-10-15T01:00:00Z'))).toBeNull(); // 06:30 IST
    expect(calls).toHaveLength(0);
    expect(await db.blogPost.count()).toBe(0);
  });

  it('writes one draft a day, from the admin’s topics first, then topics the AI picks', async () => {
    await configure({ blogAutoPost: 'draft', blogTopics: 'Group discussions\n\n  Notice period questions  \n' });
    const first = await blog.postDailyBlog(ai, DAY_8_IST);
    expect(first).toMatchObject({ title: 'Guide: Group discussions', status: 'DRAFT', source: 'AI', publishedAt: null, slug: 'guide-group-discussions' });
    expect(await blog.postDailyBlog(ai, new Date(DAY_8_IST.getTime() + 60 * 60 * 1000))).toBeNull(); // Same day
    expect(await blog.postDailyBlog(ai, new Date('2026-10-15T18:00:00Z'))).toBeNull(); // 23:30 IST, still the same day

    const second = await blog.postDailyBlog(ai, nextDay(DAY_8_IST));
    expect(second!.title).toBe('Guide: Notice period questions');
    expect(calls.some(c => c.system.includes('You plan articles'))).toBe(false);

    const third = await blog.postDailyBlog(ai, nextDay(DAY_8_IST, 2));
    expect(third!.title).toBe('Guide: Answering salary expectation questions');
    const plan = calls.find(c => c.system.includes('You plan articles'))!;
    expect(plan.user).toContain('- Guide: Group discussions');
    expect(plan.user).toContain('- Guide: Notice period questions');
    expect(await db.blogPost.count()).toBe(3);
    expect((await request(app).get('/api/public/blog')).body.posts).toHaveLength(0); // Drafts wait for the admin
  });

  it('publishes straight away when set to "publish"', async () => {
    await configure({ blogAutoPost: 'publish' });
    const created = await blog.postDailyBlog(ai, DAY_8_IST);
    expect(created).toMatchObject({ status: 'PUBLISHED', source: 'AI' });
    expect(created!.publishedAt!.toISOString()).toBe(DAY_8_IST.toISOString());
    const list = await request(app).get('/api/public/blog').expect(200);
    expect(list.body.posts.map((p: { slug: string }) => p.slug)).toEqual([created!.slug]);
    expect((await request(app).get(`/blog/${created!.slug}`)).status).toBe(200);
  });

  it('runs once even when several servers check at the same time', async () => {
    await configure({ blogAutoPost: 'draft' });
    const results = await Promise.all([1, 2, 3, 4].map(() => blog.postDailyBlog(ai, DAY_8_IST)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.blogPost.count()).toBe(1);
  });

  it('skips a day that already has an AI post, and tries again later after a failure', async () => {
    await configure({ blogAutoPost: 'draft' });
    await post('written-earlier', { status: 'DRAFT', source: 'AI', createdAt: new Date('2026-10-15T00:00:00Z') }); // 05:30 IST today
    expect(await blog.postDailyBlog(ai, DAY_8_IST)).toBeNull();
    expect(calls).toHaveLength(0);

    aiFails = true;
    expect(await blog.postDailyBlog(ai, nextDay(DAY_8_IST))).toBeNull(); // Logged, never thrown
    aiFails = false;
    expect(await blog.postDailyBlog(ai, new Date(nextDay(DAY_8_IST).getTime() + 30 * 60 * 1000))).not.toBeNull();
    expect(await db.blogPost.count()).toBe(2);
  });
});

describe('pre-rendered blog pages', () => {
  it('fills in the blog list and a post, and keeps drafts out', async () => {
    await post('tell-your-story', { title: 'Tell your story <well>', tags: 'hr round,resume', publishedAt: new Date('2026-10-01T10:00:00Z') });
    await post('secret-draft', { status: 'DRAFT', title: 'Secret draft' });

    const list = await request(app).get('/blog');
    expect(list.status).toBe(200);
    expect(list.text).toContain('<title>Interview tips and guides – the Recallr blog</title>');
    expect(list.text).toContain('href="/blog/tell-your-story"');
    expect(list.text).not.toContain('Secret draft');
    expect(list.text).toContain('"@type":"Blog"');

    const page = await request(app).get('/blog/tell-your-story');
    expect(page.status).toBe(200);
    expect(page.text).toContain('<title>Tell your story &lt;well&gt; | Recallr blog</title>');
    expect(page.text).toContain('<meta name="description" content="About tell-your-story" />');
    expect(page.text).toContain('<link rel="canonical" href="https://recallr.example/blog/tell-your-story" />');
    expect(page.text).toContain('<meta property="og:type" content="article" />');
    expect(page.text).toContain('<h1>Tell your story &lt;well&gt;</h1>');
    expect(page.text).toContain('<h2>Before the interview</h2>');
    expect(page.text).toContain('<li>Pick one project you can explain in two minutes</li>');
    expect(page.text).toContain('"@type":"BlogPosting"');
    expect(page.text).toContain('"datePublished":"2026-10-01T10:00:00.000Z"');
    expect(page.text).toContain('"dateModified"');
    expect(page.text).toContain('"@type":"BreadcrumbList"');

    for (const url of ['/blog/secret-draft', '/blog/missing']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.text).toBe(INDEX);
    }
  });

  it('lists the blog and published posts in the sitemap', async () => {
    await post('tell-your-story');
    await post('secret-draft', { status: 'DRAFT' });
    const map = await request(app).get('/sitemap.xml');
    expect(map.text).toContain('<loc>https://recallr.example/blog</loc>');
    expect(map.text).toMatch(/<loc>https:\/\/recallr\.example\/blog\/tell-your-story<\/loc><lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
    expect(map.text).not.toContain('secret-draft');
  });

  it('shows a newly published post straight away', async () => {
    const created = await request(app).post('/api/admin/blog').set(auth(admin)).send({ title: 'Fresh post', body: BODY }).expect(201);
    expect((await request(app).get('/blog/fresh-post')).status).toBe(404);
    await request(app).patch(`/api/admin/blog/${created.body.post.id}`).set(auth(admin)).send({ status: 'PUBLISHED' }).expect(200);
    expect((await request(app).get('/blog/fresh-post')).status).toBe(200);
    expect((await request(app).get('/blog')).text).toContain('Fresh post');
  });
});
