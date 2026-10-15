import { Router } from 'express';
import type { BlogPost, Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AiGateway } from '../ai.js';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth.js';
import { draftBlogPost, freeSlug, hasTag, joinTags, normalizeTags, readingMinutes, tagList } from '../blog.js';
import { db } from '../db.js';
import { HttpError, route } from '../http.js';
import { clearPageCache } from '../seo.js';

const PAGE_SIZE = 12;

const card = (p: Pick<BlogPost, 'slug' | 'title' | 'summary' | 'tags' | 'publishedAt' | 'body'>) => ({
  slug: p.slug, title: p.title, summary: p.summary, tags: tagList(p.tags), publishedAt: p.publishedAt, readingMinutes: readingMinutes(p.body),
});

// ---------- The website ----------

export const publicBlogRoutes = Router();

publicBlogRoutes.get('/', route(async (req, res) => {
  const query = z.object({
    tag: z.string().trim().toLowerCase().max(40).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  }).parse(req.query);
  const where: Prisma.BlogPostWhereInput = { status: 'PUBLISHED', ...(query.tag ? hasTag(query.tag) : {}) };
  const [total, posts, allTags] = await Promise.all([
    db.blogPost.count({ where }),
    db.blogPost.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.blogPost.findMany({ where: { status: 'PUBLISHED' }, select: { tags: true }, take: 2000 }),
  ]);
  const counts = new Map<string, number>();
  for (const p of allTags) for (const tag of tagList(p.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    posts: posts.map(card), total, page: query.page, pageSize: PAGE_SIZE,
    tags: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([tag, count]) => ({ tag, count })),
  });
}));

// A post, with up to 3 related ones: sharing a tag first, then the newest
export const relatedPosts = async (post: BlogPost, take = 3) => {
  const tags = tagList(post.tags);
  const base: Prisma.BlogPostWhereInput = { status: 'PUBLISHED', id: { not: post.id } };
  const order = [{ publishedAt: 'desc' as const }];
  const byTag = tags.length ? await db.blogPost.findMany({ where: { ...base, OR: tags.map(hasTag) }, orderBy: order, take }) : [];
  const rest = byTag.length < take
    ? await db.blogPost.findMany({ where: { ...base, id: { notIn: [post.id, ...byTag.map(p => p.id)] } }, orderBy: order, take: take - byTag.length })
    : [];
  return [...byTag, ...rest];
};

publicBlogRoutes.get('/:slug', route(async (req, res) => {
  const post = await db.blogPost.findFirst({ where: { slug: req.params.slug, status: 'PUBLISHED' } });
  if (!post) throw new HttpError(404, 'Post not found.');
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ post: { ...card(post), body: post.body, updatedAt: post.updatedAt }, related: (await relatedPosts(post)).map(card) });
}));

// ---------- Admin ----------

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and dashes.');
const tagsSchema = z.union([z.string().max(400), z.array(z.string().max(60)).max(10)]).transform(t => joinTags(normalizeTags(t)));
const postInput = z.object({
  title: z.string().trim().min(3).max(200),
  slug: slugSchema.optional(),
  summary: z.string().trim().max(400).default(''),
  body: z.string().max(100_000).default(''),
  tags: tagsSchema.default(''),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

const draftLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skip: () => !!process.env.VITEST });

const adminPost = (p: BlogPost & { author?: { name: string; email: string } | null }) => ({
  ...p, tags: tagList(p.tags), readingMinutes: readingMinutes(p.body), author: p.author ? p.author.name || p.author.email : null,
});

export const adminBlogRoutes = (ai: AiGateway) => {
  const router = Router();
  router.use('/blog', requireUser, requireAdmin);

  router.get('/blog', route(async (req, res) => {
    const query = z.object({
      status: z.enum(['all', 'DRAFT', 'PUBLISHED']).default('all'),
      source: z.enum(['all', 'ADMIN', 'AI']).default('all'),
      q: z.string().trim().max(200).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }).parse(req.query);
    const where: Prisma.BlogPostWhereInput = {
      ...(query.status === 'all' ? {} : { status: query.status }),
      ...(query.source === 'all' ? {} : { source: query.source }),
      ...(query.q ? { OR: [{ title: { contains: query.q } }, { tags: { contains: query.q } }] } : {}),
    };
    const [total, posts, drafts] = await Promise.all([
      db.blogPost.count({ where }),
      db.blogPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * 50, take: 50, include: { author: { select: { name: true, email: true } } } }),
      db.blogPost.count({ where: { status: 'DRAFT' } }),
    ]);
    // The list doesn't need whole articles
    res.json({ total, drafts, posts: posts.map(p => ({ ...adminPost(p), body: undefined })) });
  }));

  router.get('/blog/:id', route(async (req, res) => {
    const post = await db.blogPost.findUnique({ where: { id: req.params.id }, include: { author: { select: { name: true, email: true } } } });
    if (!post) throw new HttpError(404, 'Post not found.');
    res.json({ post: adminPost(post) });
  }));

  // An AI draft on a topic, for the editor: nothing is saved
  router.post('/blog/draft', draftLimiter, route(async (req, res) => {
    const { topic } = z.object({ topic: z.string().trim().min(3).max(300) }).parse(req.body);
    try {
      res.json({ draft: await draftBlogPost(ai, topic) });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, (error as Error).message || 'The AI could not write a draft. Try again.');
    }
  }));

  router.post('/blog', route(async (req, res) => {
    const input = postInput.parse(req.body);
    if (input.status === 'PUBLISHED' && !input.body.trim()) throw new HttpError(400, 'Write the post before publishing.');
    if (input.slug && await db.blogPost.findUnique({ where: { slug: input.slug } })) throw new HttpError(409, 'Another post has that address.');
    const post = await db.blogPost.create({
      data: {
        ...input, slug: input.slug ?? await freeSlug(input.title), source: 'ADMIN', authorId: req.user!.id,
        publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      },
    });
    await audit(req, input.status === 'PUBLISHED' ? 'blog.publish' : 'blog.create', post.title);
    clearPageCache();
    res.status(201).json({ post: adminPost(post) });
  }));

  router.patch('/blog/:id', route(async (req, res) => {
    const input = postInput.partial().parse(req.body);
    const post = await db.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw new HttpError(404, 'Post not found.');
    const status = input.status ?? post.status;
    if (status === 'PUBLISHED' && !(input.body ?? post.body).trim()) throw new HttpError(400, 'Write the post before publishing.');
    // Links to a live post keep working: its address only changes while it's a draft
    if (input.slug && input.slug !== post.slug) {
      if (post.status === 'PUBLISHED') throw new HttpError(400, 'The address can’t change while the post is published. Unpublish it first.');
      if (await db.blogPost.findFirst({ where: { slug: input.slug, id: { not: post.id } } })) throw new HttpError(409, 'Another post has that address.');
    }
    const data: Prisma.BlogPostUpdateInput = { ...input };
    if (status === 'PUBLISHED' && !post.publishedAt) data.publishedAt = new Date();
    const updated = await db.blogPost.update({ where: { id: post.id }, data });
    const action = input.status && input.status !== post.status ? (input.status === 'PUBLISHED' ? 'blog.publish' : 'blog.unpublish') : 'blog.update';
    await audit(req, action, updated.title);
    clearPageCache();
    res.json({ post: adminPost(updated) });
  }));

  router.delete('/blog/:id', route(async (req, res) => {
    const post = await db.blogPost.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!post) throw new HttpError(404, 'Post not found.');
    await audit(req, 'blog.delete', post.title);
    clearPageCache();
    res.json({ ok: true });
  }));

  return router;
};
