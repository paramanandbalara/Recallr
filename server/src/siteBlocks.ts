import { z } from 'zod';
import { db } from './db.js';

// The website's editable text (Admin → Website content). Each block has a default: the text the website had
// before it could be edited, so nothing changes until the admin saves a block. Saved blocks are JSON in SiteBlock.

// Icons the admin can choose for highlights and "Who it's for" cards (the website maps them to its icons)
export const BLOCK_ICONS = [
  'zap', 'smile', 'languages', 'monitor', 'sparkles', 'shield', 'clock', 'target', 'graduation', 'briefcase',
  'server', 'chart', 'users', 'mic', 'book', 'rocket', 'heart', 'star', 'code', 'compass',
] as const;

const text = (max: number) => z.string({ invalid_type_error: 'Each field must be text.' }).trim().max(max, `Keep it under ${max} characters.`);
const required = (max: number, what: string) => text(max).min(1, `${what} can’t be empty.`);
const icon = z.enum(BLOCK_ICONS, { errorMap: () => ({ message: 'Pick one of the icons in the list.' }) });
const list = <T extends z.ZodTypeAny>(item: T, min: number, max: number, what: string) =>
  z.array(item).min(min, `Add at least ${min} ${what}.`).max(max, `At most ${max} ${what}.`);
// A link on the website ("/pricing") or a full https address
const sitePath = (v: string) => /^\/(?!\/)\S*$/.test(v);
const link = text(300).refine(v => !v || sitePath(v) || /^https:\/\/\S+$/.test(v), 'A link starts with / (a page of the website) or https://.');
const photo = text(500).refine(v => !v || sitePath(v) || /^https:\/\/\S+$/.test(v), 'The photo address must start with https:// or /.');

const hero = z.object({
  badge: text(120),
  headlineStart: required(80, 'The headline'),
  rotating: list(required(60, 'A rotating phrase'), 1, 10, 'rotating phrases'),
  headlineEnd: text(60),
  subtitle: required(400, 'The subtitle'),
  primaryLabel: required(40, 'The button label'),
  primaryLabelSignedIn: required(40, 'The button label'),
  secondaryLabel: required(40, 'The button label'),
  points: list(required(60, 'A point'), 0, 5, 'points'),
  seoTitle: required(70, 'The search title'),
  seoDescription: required(200, 'The search description'),
}).strict();

const highlights = z.object({
  items: list(z.object({ icon, value: required(30, 'A highlight'), label: required(120, 'A highlight’s text') }).strict(), 1, 8, 'highlights'),
}).strict();

const faq = z.object({
  items: list(z.object({ q: required(200, 'A question'), a: required(1500, 'An answer') }).strict(), 1, 30, 'questions'),
}).strict();

const useCases = z.object({
  title: required(80, 'The title'),
  subtitle: text(300),
  items: list(z.object({
    icon,
    title: required(100, 'A story’s title'),
    story: required(600, 'A story'),
    points: list(required(80, 'A point'), 0, 4, 'points'),
  }).strict(), 0, 8, 'stories'),
}).strict();

// Real testimonials only: one is shown on the website once it's published and the admin confirmed permission
const testimonials = z.object({
  title: required(80, 'The title'),
  items: list(z.object({
    name: required(80, 'The name'),
    role: text(120),
    quote: required(600, 'The quote'),
    photoUrl: photo,
    published: z.boolean(),
    permission: z.boolean(),
  }).strict().refine(t => !t.published || t.permission, 'A testimonial can only be published with the person’s permission.'), 0, 20, 'testimonials'),
}).strict();

const announcement = z.object({
  enabled: z.boolean(),
  text: text(200),
  linkLabel: text(40),
  linkUrl: link,
}).strict().refine(a => !a.enabled || a.text, 'Write the text to show, or turn the strip off.');

const footer = z.object({ tagline: required(200, 'The tagline') }).strict();

const colleges = z.object({
  badge: text(120),
  headline: required(80, 'The headline'),
  highlight: text(60),
  subtitle: required(500, 'The text'),
  button: required(40, 'The button label'),
}).strict();

export const BLOCK_SCHEMAS = { hero, highlights, faq, useCases, testimonials, announcement, footer, colleges };
export type BlockKey = keyof typeof BLOCK_SCHEMAS;
export type Blocks = { [K in BlockKey]: z.infer<(typeof BLOCK_SCHEMAS)[K]> };
export const BLOCK_KEYS = Object.keys(BLOCK_SCHEMAS) as BlockKey[];
export const isBlockKey = (key: string): key is BlockKey => key in BLOCK_SCHEMAS;

export const BLOCK_DEFAULTS: Blocks = {
  hero: {
    badge: 'Free trial included with every account',
    headlineStart: 'Never get stuck on',
    rotating: ['a coding round', 'system design', 'an HR round', 'a follow-up', 'a hard question'],
    headlineEnd: 'again',
    subtitle: 'Recallr listens to your interview and quietly suggests answers built from your own resume and the answers you prepared, in about a second.',
    primaryLabel: 'Start your free trial',
    primaryLabelSignedIn: 'Download the app',
    secondaryLabel: 'See it in action',
    points: ['No card needed', 'Windows and macOS', 'Set up in five minutes'],
    seoTitle: 'Recallr – AI interview assistant',
    seoDescription: 'Recallr listens to your interview and suggests simple, natural answers from your own resume in about a second. Mock interviews, prep packs and more.',
  },
  highlights: {
    items: [
      { icon: 'zap', value: '≈ 1 s', label: 'to the first words: the fastest AI answers each time' },
      { icon: 'smile', value: 'Sounds like you', label: 'short sentences and everyday words, scored on every answer' },
      { icon: 'languages', value: 'Many languages', label: 'including Hindi with Hinglish answers' },
      { icon: 'monitor', value: 'Windows & macOS', label: 'one account, your computers' },
    ],
  },
  faq: {
    items: [
      { q: 'Is there a free trial?', a: 'Yes. Your free trial starts the first time you sign in to the app on your computer, so none of it is wasted before you install. One trial per person and per computer. No card needed.' },
      { q: 'What uses “listening time”?', a: 'Speech that Recallr turns into text: listening live during an interview, and your spoken answers in mock interviews. It’s measured from the audio itself and only counts while someone is speaking, not silence, so an hour-long interview usually uses less than an hour.' },
      { q: 'What uses “AI answers”?', a: 'Everything the AI writes or reads for you: answers to questions it hears, questions you type, questions read from your screen (the screenshots count too), regenerating an answer or making it shorter or simpler, key points and follow-ups, prep packs and prepared answers, mock interview questions and scores, interview reviews, company research and resume tools. It’s counted in tokens; the number of answers a plan shows is a typical estimate: long technical answers use more, short ones less.' },
      { q: 'Which call apps does it work with?', a: 'Any app that plays sound on your computer: Zoom, Google Meet, Microsoft Teams, Webex, Skype and others. Recallr listens to your computer’s audio, so there’s nothing to install in the call app.' },
      { q: 'Can I pay by UPI or bank transfer?', a: 'Yes. Pay online by card, UPI or netbanking with Razorpay, or pay us directly and enter the reference. Offline payments unlock once we confirm them, usually within a few hours.' },
      { q: 'What happens when my plan runs out?', a: 'The app asks you to buy a plan or top-up. Your profiles, answers and history are kept; nothing is lost.' },
      { q: 'Where is my data kept?', a: 'Your profiles (resume, job details, notes, prepared answers and stories) are in the app on your computer, and an encrypted copy is kept on your Recallr account so they can be restored and we can improve Recallr. You can turn that off in settings, which deletes the copy. Conversation history stays on your computer. The questions you’re asked, with Recallr’s answers, are saved to your account so you can review them under My questions; only you can see them, and you can turn this off or delete them at any time.' },
    ],
  },
  useCases: {
    title: 'Who it’s for',
    subtitle: 'A few examples of how Recallr can help at different stages. They describe typical situations; they aren’t reviews from real customers.',
    items: [
      {
        icon: 'graduation',
        title: 'A fresher preparing for campus placements',
        story: 'You know your subjects but freeze on “Tell me about yourself” or a question about your final-year project. Add your resume and the company’s job post, do a few mock interviews in the weeks before placements, and watch your scores and filler words improve.',
        points: ['Mock interviews for the role', 'Answers built from your own projects', 'Feedback on pace and filler words'],
      },
      {
        icon: 'server',
        title: 'A backend engineer switching jobs',
        story: 'You’re interviewing while working full time, with coding and system design rounds at several companies. Keep one profile per company, go through each job’s prep pack in the evenings, and glance at key points in the call to recall the numbers from past projects.',
        points: ['A profile per company', 'Prep pack of likely questions', 'Key points for system design'],
      },
      {
        icon: 'chart',
        title: 'A career-changer moving into data analytics',
        story: 'The hard part is linking your past work to the new role. Write your stories once (a process you improved, a report that changed a decision) and Recallr helps turn them into clear answers for SQL, Excel and case questions.',
        points: ['Story bank for “Tell me about a time…”', 'Answers that connect your past work', 'Simple, natural wording'],
      },
      {
        icon: 'target',
        title: 'A bootcamp student doing mock interviews',
        story: 'Practice time is short between modules. Do a mock interview after each one, look at your scores with your coach on the group dashboard, and keep improving a set of prepared answers you’ll use on the day.',
        points: ['Scores after every mock interview', 'Coach sees scores, not your answers', 'Prepared answers come first'],
      },
    ],
  },
  testimonials: { title: 'What users say', items: [] },
  announcement: { enabled: false, text: '', linkLabel: '', linkUrl: '' },
  footer: { tagline: 'Your AI interview assistant, from preparation to the last question.' },
  colleges: {
    badge: 'For colleges, bootcamps and placement cells',
    headline: 'Get every student',
    highlight: 'interview-ready',
    subtitle: 'Give your students Recallr for placement season: realistic mock interviews with scores and speaking feedback, and a dashboard for coaches to see who is ready.',
    button: 'Ask for a group plan',
  },
};

// ---------- Reading (cached) ----------

const CACHE_MS = 60_000;
let cache: { at: number; saved: Map<string, { data: unknown; updatedAt: Date }> } | null = null;

const savedBlocks = async () => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.saved;
  const rows = await db.siteBlock.findMany();
  const saved = new Map(rows.map(r => {
    let data: unknown = null;
    try {
      data = JSON.parse(r.data);
    } catch {
      console.error(`Website block "${r.key}" isn't valid JSON; the default is shown.`);
    }
    return [r.key, { data, updatedAt: r.updatedAt }] as const;
  }));
  cache = { at: Date.now(), saved };
  return saved;
};

export const clearSiteBlocksCache = () => { cache = null; };

// A saved block that no longer fits its schema (e.g. after a change to the code) falls back to the default
const valid = <K extends BlockKey>(key: K, data: unknown): Blocks[K] | null => {
  const parsed = BLOCK_SCHEMAS[key].safeParse(data);
  return parsed.success ? (parsed.data as Blocks[K]) : null;
};

export const getBlock = async <K extends BlockKey>(key: K): Promise<Blocks[K]> => {
  const saved = (await savedBlocks()).get(key);
  return (saved && valid(key, saved.data)) ?? BLOCK_DEFAULTS[key];
};

export const getBlocks = async (): Promise<Blocks> => {
  const saved = await savedBlocks();
  return Object.fromEntries(BLOCK_KEYS.map(key => {
    const row = saved.get(key);
    return [key, (row && valid(key, row.data)) ?? BLOCK_DEFAULTS[key]];
  })) as Blocks;
};

// What visitors get: testimonials only once published with permission (and without those two flags)
export const publicBlocks = async () => {
  const blocks = await getBlocks();
  return {
    ...blocks,
    testimonials: {
      title: blocks.testimonials.title,
      items: blocks.testimonials.items.filter(t => t.published && t.permission).map(({ name, role, quote, photoUrl }) => ({ name, role, quote, photoUrl })),
    },
  };
};

// For the admin panel: each block, its default, and whether it was changed
export const blocksForAdmin = async () => {
  const saved = await savedBlocks();
  const blocks = await getBlocks();
  return BLOCK_KEYS.map(key => ({
    key, data: blocks[key], defaults: BLOCK_DEFAULTS[key], custom: saved.has(key), updatedAt: saved.get(key)?.updatedAt ?? null,
  }));
};

// ---------- Writing ----------

export const saveBlock = async (key: BlockKey, data: unknown) => {
  const parsed = BLOCK_SCHEMAS[key].parse(data); // A ZodError becomes a 400 with its message
  const json = JSON.stringify(parsed);
  await db.siteBlock.upsert({ where: { key }, create: { key, data: json }, update: { data: json } });
  clearSiteBlocksCache();
  return parsed;
};

export const resetBlock = async (key: BlockKey) => {
  await db.siteBlock.deleteMany({ where: { key } });
  clearSiteBlocksCache();
  return BLOCK_DEFAULTS[key];
};
