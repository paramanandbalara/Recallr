import type { BlogPost, Prisma } from '@prisma/client';
import type { AiGateway } from './ai.js';
import { db } from './db.js';
import { slugify } from './questions.js';
import { clearPageCache } from './seo.js';
import { getSettings } from './settings.js';

// The website's blog: interview-prep articles written by admins, or drafted by the AI once a day.
// Bodies are plain text like the question guides: "## " headings, "- " lists, ``` code and paragraphs.

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 5.5 * 60 * 60 * 1000;

// ---------- Tags ----------

// Stored lower-case, comma-separated, no spaces around commas: "resume,hr round"
export const normalizeTags = (tags: string | string[], max = 6) => {
  const list = (Array.isArray(tags) ? tags : tags.split(','))
    .map(t => t.replace(/[,#]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40))
    .filter(Boolean);
  return [...new Set(list)].slice(0, max);
};
export const joinTags = (tags: string[]) => {
  const kept: string[] = [];
  for (const tag of tags) if ([...kept, tag].join(',').length <= 300) kept.push(tag);
  return kept.join(',');
};
export const tagList = (tags: string) => (tags ? tags.split(',').filter(Boolean) : []);

// Posts carrying exactly this tag
export const hasTag = (tag: string): Prisma.BlogPostWhereInput => ({
  OR: [{ tags: tag }, { tags: { startsWith: `${tag},` } }, { tags: { endsWith: `,${tag}` } }, { tags: { contains: `,${tag},` } }],
});

export const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200));

// A free address for a new post: the title's slug, with -2, -3... when it's taken
export const freeSlug = async (text: string, excludeId?: string) => {
  const base = slugify(text).slice(0, 100).replace(/-+$/, '') || 'post';
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!await db.blogPost.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } })) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
};

// ---------- Writing with AI ----------

export const BLOG_PROMPT = `You write helpful, accurate articles for job seekers preparing for interviews, in India and around the world.
Write one article on the topic you are given.

Style:
- 700 to 1100 words, in simple everyday English. Short sentences and short paragraphs (2 to 4 sentences).
- Start with one or two paragraphs that say what the reader will get, with no heading before them.
- Then 3 to 6 sections, each starting with a line "## Heading". Use "- " for bullet lists. No other markdown: no bold, no tables, no "#" titles.
- Give concrete, practical examples: sample answers, phrases to say, small checklists. Make example people and situations clearly generic ("a fresher applying for a support role").
- Be accurate. Never invent statistics, surveys, studies, quotes, experts, or real-sounding people or companies presented as real.
- Don't promise results ("guaranteed job"). Don't give legal or immigration advice.
- Don't describe any product's features. At most, the last line may be one soft sentence suggesting the reader practise with a mock interview tool such as Recallr.

Reply with JSON only, in this shape:
{"title": "...", "summary": "...", "tags": ["...", "..."], "body": "..."}
- title: clear and specific, under 70 characters, no clickbait.
- summary: one or two sentences for search results, at most 155 characters.
- tags: 1 to 4 short lower-case topics, such as "hr round", "resume", "coding interview", "freshers".
- body: the article text as described above, with "\\n" line breaks. Don't repeat the title in the body.`;

const TOPIC_PROMPT = `You plan articles for an interview-preparation blog read by job seekers in India and around the world.
Suggest ONE new, specific, useful article topic about preparing for or doing well in job interviews (any kind: HR, behavioral,
technical, coding, system design, campus placements, salary talks, follow-ups, online interviews, nerves...).
It must not repeat or closely overlap any of the existing titles you are given.
Reply with JSON only: {"topic": "..."} — one line, under 100 characters.`;

export interface BlogDraft {
  title: string;
  summary: string;
  tags: string[];
  body: string;
}

// The model's reply as an object: tolerates ```json fences and text around the JSON
const parseJsonObject = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

const shortSummary = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 155 ? `${clean.slice(0, 152).replace(/\s+\S*$/, '')}…` : clean;
};

// A draft from the model's reply, or null when it isn't usable
export const parseBlogDraft = (text: string): BlogDraft | null => {
  const data = parseJsonObject(text);
  if (!data) return null;
  const title = str(data.title).replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  let body = str(data.body).replace(/\r\n/g, '\n').trim();
  // A body that starts with the title as a heading: drop it (the page shows the title)
  body = body.replace(/^#{1,2}\s+.*\n+/, line => (line.replace(/^#+\s*/, '').trim().toLowerCase() === title.toLowerCase() ? '' : line))
    .replace(/^### /gm, '## ').replace(/\*\*(.+?)\*\*/g, '$1').trim();
  if (title.length < 3 || body.length < 200) return null;
  const firstParagraph = body.split('\n').find(l => l.trim() && !l.startsWith('#') && !/^\s*[-*] /.test(l)) ?? '';
  const tags = normalizeTags(Array.isArray(data.tags) ? data.tags.map(str) : str(data.tags), 4);
  return { title, summary: shortSummary(str(data.summary) || firstParagraph), tags, body };
};

export const draftBlogPost = async (ai: AiGateway, topic: string): Promise<BlogDraft> => {
  const result = await ai.streamChat({
    tier: 'quality', system: BLOG_PROMPT, maxTokens: 4000, json: true, temperature: 0.7,
    user: `Topic: ${topic.trim()}`,
  }, () => {}, new AbortController().signal);
  const draft = parseBlogDraft(result.text);
  if (!draft) throw new Error('The AI reply could not be read as an article. Try again.');
  return draft;
};

// ---------- The daily post ----------

// The day in India (where Recallr's users are) and when it started, in UTC
const istDay = (now: Date) => {
  const ist = new Date(now.getTime() + IST_MS);
  const day = ist.toISOString().slice(0, 10);
  return { day, hour: ist.getUTCHours(), start: new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS) };
};

// Bookkeeping rows in the settings table (not admin settings: they're ignored by settings.ts)
const CLAIM_KEY = 'job.blogDailyPost';      // The IST day the daily post was claimed for
const USED_TOPICS_KEY = 'job.blogTopicsUsed'; // The admin's topics already written about (JSON array, lower-case)

// Claims today's post for this server: only one server (and one check) a day gets true
const claimDay = async (day: string) => {
  const previous = await db.setting.findUnique({ where: { key: CLAIM_KEY } });
  if (previous?.value === day) return null;
  if (previous) {
    const { count } = await db.setting.updateMany({ where: { key: CLAIM_KEY, value: previous.value }, data: { value: day } });
    return count ? { release: () => db.setting.updateMany({ where: { key: CLAIM_KEY, value: day }, data: { value: previous.value } }) } : null;
  }
  try {
    await db.setting.create({ data: { key: CLAIM_KEY, value: day } });
  } catch {
    return null; // Another server created it first
  }
  return { release: () => db.setting.deleteMany({ where: { key: CLAIM_KEY, value: day } }) };
};

const usedTopics = async (): Promise<string[]> => {
  const row = await db.setting.findUnique({ where: { key: USED_TOPICS_KEY } });
  try {
    const list: unknown = row ? JSON.parse(row.value) : [];
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
};

const topicKey = (topic: string) => topic.replace(/\s+/g, ' ').trim().toLowerCase();

const pickTopic = async (ai: AiGateway, adminTopics: string) => {
  const used = new Set(await usedTopics());
  const fromAdmin = adminTopics.split('\n').map(t => t.trim()).filter(Boolean).find(t => !used.has(topicKey(t)));
  if (fromAdmin) return { topic: fromAdmin, fromAdmin: true };
  const recent = await db.blogPost.findMany({ orderBy: { createdAt: 'desc' }, take: 60, select: { title: true } });
  const result = await ai.streamChat({
    tier: 'quality', system: TOPIC_PROMPT, maxTokens: 300, json: true, temperature: 0.9,
    user: recent.length ? `Existing titles:\n${recent.map(p => `- ${p.title}`).join('\n')}` : 'There are no articles yet.',
  }, () => {}, new AbortController().signal);
  const topic = (str(parseJsonObject(result.text)?.topic) || result.text.split('\n').find(l => l.trim()) || '')
    .replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 200);
  if (topic.length < 5) throw new Error('The AI did not suggest a topic.');
  return { topic, fromAdmin: false };
};

const hasAiKey = (s: Awaited<ReturnType<typeof getSettings>>) => !!(s.groqApiKey || s.openaiApiKey || s.anthropicApiKey);

// Once a day, from 07:00 in India: the AI writes a post, saved as a draft or published (Admin → Settings → Blog).
// Checked by the half-hourly job on every server; the day is claimed in the database first so only one writes it.
// Returns the new post, or null when there's nothing to do. Never throws.
export const postDailyBlog = async (ai: AiGateway, now = new Date()): Promise<BlogPost | null> => {
  let claim: Awaited<ReturnType<typeof claimDay>> = null;
  try {
    const settings = await getSettings();
    const mode = settings.blogAutoPost.trim().toLowerCase();
    if ((mode !== 'draft' && mode !== 'publish') || !hasAiKey(settings)) return null;
    const { day, hour, start } = istDay(now);
    if (hour < 7) return null;
    if (await db.blogPost.findFirst({ where: { source: 'AI', createdAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) } }, select: { id: true } })) return null;
    claim = await claimDay(day);
    if (!claim) return null;

    const { topic, fromAdmin } = await pickTopic(ai, settings.blogTopics);
    const draft = await draftBlogPost(ai, topic);
    const publish = mode === 'publish';
    const post = await db.blogPost.create({
      data: {
        slug: await freeSlug(draft.title), title: draft.title, summary: draft.summary, body: draft.body, tags: joinTags(draft.tags),
        source: 'AI', status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? now : null, createdAt: now,
      },
    });
    if (fromAdmin) {
      const used = [...await usedTopics(), topicKey(topic)];
      await db.setting.upsert({ where: { key: USED_TOPICS_KEY }, create: { key: USED_TOPICS_KEY, value: JSON.stringify(used) }, update: { value: JSON.stringify(used) } });
    }
    if (publish) clearPageCache();
    console.log(`Daily blog post ${publish ? 'published' : 'drafted'}: ${post.title}`);
    return post;
  } catch (error) {
    console.error('Daily blog post failed:', error);
    // Let a later check try again today
    await claim?.release().catch(() => {});
    return null;
  }
};
