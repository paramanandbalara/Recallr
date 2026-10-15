import type { QuestionCategory } from '@prisma/client';
import { db } from './db.js';
import { publicUrl } from './env.js';
import { CATEGORY_PAGES, categoryFromSlug } from './questions.js';

// Search engines get each public page with its own title, description and content already in the HTML.
// The website (a React app) still takes over in the browser; this only fills in index.html before it's sent.

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const CACHE_MS = 5 * 60 * 1000;

interface PageMeta {
  title: string;
  description: string;
  body?: string;     // Pre-rendered content for #root
  jsonLd?: object[]; // Structured data
  noindex?: boolean;
}

// The plain-text guide ("## " headings, "- " bullets, ``` code) as simple HTML
export const guideHtml = (guide: string) => {
  const out: string[] = [];
  const lines = guide.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${escape(line.slice(3))}</h2>`);
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(`<li>${escape(lines[i].replace(/^\s*[-*] /, ''))}</li>`);
      i--;
      out.push(`<ul>${items.join('')}</ul>`);
    } else if (line.trim()) {
      out.push(`<p>${escape(line)}</p>`);
    }
  }
  return out.join('\n');
};

// A short description from the guide's first sentences
const summary = (guide: string, fallback: string) => {
  const text = guide.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('```') && !/^\s*[-*] /.test(l)).join(' ').replace(/\s+/g, ' ');
  return (text.length > 155 ? `${text.slice(0, 152).replace(/\s+\S*$/, '')}…` : text) || fallback;
};

const breadcrumbs = (items: [string, string][]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${publicUrl}${path}` })),
});

const questionLink = (q: { slug: string | null; text: string; category: QuestionCategory }) =>
  `<li><a href="/interview-questions/${CATEGORY_PAGES[q.category].slug}/${escape(q.slug ?? '')}">${escape(q.text)}</a></li>`;

const STATIC: Record<string, PageMeta> = {
  '/': { title: 'Recallr – AI interview assistant', description: 'Recallr listens to your interview and suggests simple, natural answers from your own resume in about a second. Mock interviews, prep packs and more.' },
  '/pricing': { title: 'Pricing – Recallr', description: 'Simple packs, no subscription. Pay online or by UPI, and top up any time. Every account starts with a free trial.' },
  '/download': { title: 'Download Recallr for Windows and macOS', description: 'Install the Recallr app, sign in with your account and start your free trial.' },
  '/guide': { title: 'How to use Recallr', description: 'Set up Recallr in five minutes: install, add your resume and the job, and start listening.' },
  '/colleges': { title: 'Recallr for colleges and bootcamps', description: 'Interview practice for your students: mock interviews with scores and speaking feedback, one invite link, and a coach dashboard.' },
};

const pageFor = async (path: string): Promise<PageMeta | null> => {
  if (STATIC[path]) return STATIC[path];
  if (/^\/(account|admin|join|login|register|forgot-password|reset-password)(\/|$)/.test(path)) {
    return { title: 'Recallr', description: STATIC['/'].description, noindex: true };
  }

  const match = path.match(/^\/interview-questions(?:\/([a-z-]+))?(?:\/([a-z0-9-]+))?\/?$/);
  if (!match) return null;
  const [, categorySlug, slug] = match;

  if (!categorySlug) {
    const questions = await db.question.findMany({ where: { published: true }, orderBy: [{ timesAsked: 'desc' }, { createdAt: 'asc' }], take: 60 });
    const categories = (Object.keys(CATEGORY_PAGES) as QuestionCategory[]).map(c => `<li><a href="/interview-questions/${CATEGORY_PAGES[c].slug}">${escape(CATEGORY_PAGES[c].title)}</a></li>`).join('');
    return {
      title: 'Interview questions and how to answer them | Recallr',
      description: 'Real interview questions by category, with a guide on how to answer each: HR, behavioral, coding, system design and technical.',
      body: `<main><h1>Interview questions, and how to answer them</h1><ul>${categories}</ul><h2>Most asked</h2><ul>${questions.map(questionLink).join('')}</ul></main>`,
      jsonLd: [breadcrumbs([['Interview questions', '/interview-questions']])],
    };
  }

  const category = categoryFromSlug(categorySlug);
  if (!category) return null;
  const page = CATEGORY_PAGES[category];

  if (!slug) {
    const questions = await db.question.findMany({ where: { published: true, category }, orderBy: [{ timesAsked: 'desc' }, { createdAt: 'asc' }], take: 200 });
    return {
      title: `${page.title} – interview questions and how to answer them | Recallr`,
      description: `${page.text} Real questions, with guides on how to answer each one.`,
      body: `<main><h1>${escape(page.title)}</h1><p>${escape(page.text)}</p><ul>${questions.map(questionLink).join('')}</ul></main>`,
      jsonLd: [breadcrumbs([['Interview questions', '/interview-questions'], [page.title, `/interview-questions/${page.slug}`]])],
    };
  }

  const question = await db.question.findFirst({ where: { slug, published: true } });
  if (!question || question.category !== category) return null;
  const related = await db.question.findMany({ where: { published: true, category, id: { not: question.id } }, orderBy: { timesAsked: 'desc' }, take: 6 });
  const url = `/interview-questions/${page.slug}/${question.slug}`;
  const guide = question.guide ?? '';
  return {
    title: `${question.text} – how to answer | Recallr`,
    description: summary(guide, `How to answer “${question.text}”: what the interviewer wants, how to structure your answer, an example and mistakes to avoid.`),
    body: `<main><article><h1>${escape(question.text)}</h1>${guideHtml(guide)}</article>${related.length ? `<h2>More ${escape(page.title.toLowerCase())}</h2><ul>${related.map(questionLink).join('')}</ul>` : ''}</main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org', '@type': 'Article', headline: question.text.slice(0, 110),
        description: summary(guide, question.text), dateModified: question.updatedAt.toISOString(), datePublished: question.createdAt.toISOString(),
        mainEntityOfPage: `${publicUrl}${url}`, publisher: { '@type': 'Organization', name: 'Recallr' },
      },
      breadcrumbs([['Interview questions', '/interview-questions'], [page.title, `/interview-questions/${page.slug}`], [question.text, url]]),
    ],
  };
};

// index.html with the page's title, description, canonical link, social preview tags, structured data and content
export const fillPage = (indexHtml: string, path: string, meta: PageMeta) => {
  const url = `${publicUrl}${path === '/' ? '' : path}`;
  const head = [
    `<title>${escape(meta.title)}</title>`,
    `<meta name="description" content="${escape(meta.description)}" />`,
    meta.noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${escape(url)}" />`,
    `<meta property="og:title" content="${escape(meta.title)}" />`,
    `<meta property="og:description" content="${escape(meta.description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Recallr" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    ...(meta.jsonLd ?? []).map(data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
  return indexHtml
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/i, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace(/<div id="root"><\/div>/, `<div id="root">${meta.body ?? ''}</div>`);
};

const cache = new Map<string, { html: string; at: number } | null>();

// The page for `path`, or null when it isn't a known page (the website shows its own "not found")
export const renderPage = async (indexHtml: string, path: string) => {
  const key = path.replace(/\/+$/, '') || '/';
  const hit = cache.get(key);
  if (hit !== undefined && (hit === null || Date.now() - hit.at < CACHE_MS)) return hit?.html ?? null;
  const meta = await pageFor(key);
  const html = meta ? fillPage(indexHtml, key, meta) : null;
  cache.set(key, html ? { html, at: Date.now() } : null);
  if (!html) setTimeout(() => cache.delete(key), CACHE_MS).unref();
  if (cache.size > 2000) cache.clear();
  return html;
};

export const clearPageCache = () => cache.clear();

export const sitemap = async () => {
  const questions = await db.question.findMany({ where: { published: true }, select: { slug: true, category: true, updatedAt: true } });
  const categories = [...new Set(questions.map(q => q.category))];
  const urls: [string, string?][] = [
    ...Object.keys(STATIC).map(path => [path] as [string]),
    ['/interview-questions'],
    ...categories.map(c => [`/interview-questions/${CATEGORY_PAGES[c].slug}`] as [string]),
    ...questions.map(q => [`/interview-questions/${CATEGORY_PAGES[q.category].slug}/${q.slug}`, q.updatedAt.toISOString().slice(0, 10)] as [string, string]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([path, lastmod]) => `  <url><loc>${escape(`${publicUrl}${path === '/' ? '' : path}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`;
};

export const robots = () => `User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /admin\nDisallow: /api/\nDisallow: /join/\n\nSitemap: ${publicUrl}/sitemap.xml\n`;
