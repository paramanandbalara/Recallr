import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronRight, Clock, Loader2, Newspaper, Sparkles } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ArticleBody } from '../components/ArticleBody';
import { Reveal } from '../components/Showcase';
import { ErrorText } from '../components/ui';
import { usePageMeta } from '../seo';

// The website's blog: interview-prep articles. Admins write them, or check the AI's daily drafts, in Admin → Blog.

interface PostCard {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  publishedAt: string;
  readingMinutes: number;
}

interface ListResponse {
  posts: PostCard[];
  total: number;
  page: number;
  pageSize: number;
  tags: { tag: string; count: number }[];
}

interface PostResponse {
  post: PostCard & { body: string; updatedAt: string };
  related: PostCard[];
}

const LIST_TITLE = 'Interview tips and guides – the Recallr blog';
const LIST_DESCRIPTION = 'Practical interview advice for job seekers: HR and behavioral rounds, coding and system design, resumes, salary talks and more.';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

// Each post gets its own colour, picked from its address, so the grid isn't uniform
const ACCENTS = [
  'from-blue-500/30 via-blue-500/5 to-transparent',
  'from-violet-500/30 via-violet-500/5 to-transparent',
  'from-emerald-500/25 via-emerald-500/5 to-transparent',
  'from-amber-400/25 via-amber-400/5 to-transparent',
  'from-sky-400/25 via-sky-400/5 to-transparent',
  'from-rose-500/25 via-rose-500/5 to-transparent',
];
const accent = (slug: string) => ACCENTS[[...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % ACCENTS.length];

const TagPill: React.FC<{ tag: string; active?: boolean; to?: string; onClick?: () => void; count?: number }> = ({ tag, active, to, onClick, count }) => {
  const className = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
    active ? 'border-blue-500/60 bg-blue-500/15 text-blue-200' : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white'}`;
  const inner = <>{tag}{count !== undefined && <span className="text-slate-500">{count}</span>}</>;
  return to ? <Link to={to} className={className}>{inner}</Link> : <button type="button" onClick={onClick} className={className}>{inner}</button>;
};

const Meta: React.FC<{ post: PostCard }> = ({ post }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
    <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {longDate(post.publishedAt)}</span>
    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {post.readingMinutes} min read</span>
  </div>
);

const Card: React.FC<{ post: PostCard; featured?: boolean }> = ({ post, featured }) => (
  <Link
    to={`/blog/${post.slug}`}
    className="card-lift group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
  >
    <div className={`pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${accent(post.slug)}`} aria-hidden />
    <div className={`relative flex flex-1 flex-col ${featured ? 'p-7 sm:p-9' : 'p-6'}`}>
      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.tags.slice(0, 2).map(tag => <span key={tag} className="rounded-full bg-slate-950/60 px-2.5 py-0.5 text-[11px] capitalize text-slate-300 ring-1 ring-white/10">{tag}</span>)}
        </div>
      )}
      <h2 className={`mt-4 font-semibold leading-snug text-white ${featured ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{post.title}</h2>
      {post.summary && <p className={`mt-2 text-slate-400 ${featured ? 'max-w-2xl text-base' : 'line-clamp-3 text-sm'}`}>{post.summary}</p>}
      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
        <Meta post={post} />
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-300">
          Read <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>
  </Link>
);

const PractiseCard: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-600/20 via-slate-900 to-violet-600/10 p-6 sm:p-8">
      <div className="blob pointer-events-none -right-16 -top-16 h-56 w-56 bg-blue-500" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 font-semibold text-white"><Sparkles className="h-4 w-4 text-amber-300" /> Practise before the real thing</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Reading helps; saying your answers out loud helps more. Recallr’s mock interviews ask questions for your role and give you a score,
            with feedback on pace and filler words.
          </p>
        </div>
        <Link to={user ? '/download' : '/register'} className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500">
          {user ? 'Download the app' : 'Start your free trial'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
};

const Spinner = () => <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;

// /blog (and /blog?tag=resume)
export const BlogIndex: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') ?? '';
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  usePageMeta(tag ? `${tag[0].toUpperCase()}${tag.slice(1)} – the Recallr blog` : LIST_TITLE, LIST_DESCRIPTION);

  useEffect(() => {
    setData(null);
    setError('');
    api<ListResponse>(`/public/blog?${new URLSearchParams(tag ? { tag } : {})}`).then(setData, e => setError(e.message));
  }, [tag]);

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const next = await api<ListResponse>(`/public/blog?${new URLSearchParams({ page: String(data.page + 1), ...(tag ? { tag } : {}) })}`);
      setData({ ...next, posts: [...data.posts, ...next.posts] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };
  const chooseTag = (next: string) => setParams(next ? { tag: next } : {});

  const [featured, ...rest] = data?.posts ?? [];
  const showFeatured = !!featured && !tag;

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="blob pointer-events-none -left-32 -top-24 h-96 w-96 bg-blue-600" aria-hidden />
        <div className="blob blob-2 pointer-events-none -right-20 top-10 h-72 w-72 bg-violet-600" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:pt-20">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
              <Newspaper className="h-3.5 w-3.5 text-blue-300" /> The Recallr blog
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Interview tips that <span className="gradient-text">actually help</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-4 max-w-2xl text-lg text-slate-400">
              Practical, plain-English guides for every round: HR and behavioral questions, coding and system design, resumes, salary talks and more.
            </p>
          </Reveal>
          {data && data.tags.length > 0 && (
            <Reveal delay={220}>
              <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
                <TagPill tag="All posts" active={!tag} onClick={() => chooseTag('')} />
                {data.tags.slice(0, 14).map(t => <TagPill key={t.tag} tag={t.tag} count={t.count} active={t.tag === tag} onClick={() => chooseTag(t.tag === tag ? '' : t.tag)} />)}
                {tag && !data.tags.some(t => t.tag === tag) && <TagPill tag={tag} active onClick={() => chooseTag('')} />}
              </div>
            </Reveal>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-20">
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Spinner />}
        {data && data.posts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-slate-400">
            {tag ? <>No posts on “{tag}” yet. <button className="text-blue-400 hover:text-blue-300" onClick={() => chooseTag('')}>See all posts</button></> : 'The first posts are on their way. Check back soon.'}
          </div>
        )}
        {data && data.posts.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {showFeatured && <Reveal className="sm:col-span-2 lg:col-span-3"><Card post={featured} featured /></Reveal>}
            {(showFeatured ? rest : data.posts).map((post, i) => (
              <Reveal key={post.slug} delay={(i % 3) * 80} className="h-full"><Card post={post} /></Reveal>
            ))}
          </div>
        )}
        {data && data.posts.length < data.total && (
          <div className="mt-10 flex justify-center">
            <button onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60">
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Load more posts
            </button>
          </div>
        )}
        <div className="mt-16"><PractiseCard /></div>
      </div>
    </>
  );
};

// A thin bar along the top showing how far down the article the reader is
const ReadingProgress: React.FC = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return (
    <div className="fixed inset-x-0 top-0 z-40 h-0.5" aria-hidden>
      <div className="h-full origin-left bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
};

// /blog/:slug
export const BlogPostPage: React.FC = () => {
  const { slug = '' } = useParams();
  const [data, setData] = useState<PostResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    setError('');
    api<PostResponse>(`/public/blog/${encodeURIComponent(slug)}`).then(setData, e => setError(e.message));
  }, [slug]);
  usePageMeta(data ? `${data.post.title} | Recallr blog` : 'Recallr blog', data?.post.summary || undefined);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <ErrorText>{error}</ErrorText>
        <Link to="/blog" className="mt-4 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">All posts <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }
  if (!data) return <Spinner />;
  const { post, related } = data;

  return (
    <>
      <ReadingProgress />
      <article>
        <header className="relative overflow-hidden">
          <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
          <div className={`pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b ${accent(post.slug)}`} aria-hidden />
          <div className="relative mx-auto max-w-3xl px-4 pb-8 pt-12 sm:pt-16">
            <nav className="mb-6 flex items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
              <Link to="/blog" className="hover:text-slate-300">Blog</Link>
              <ChevronRight className="h-4 w-4" />
              <span className="truncate text-slate-400">{post.title}</span>
            </nav>
            <Reveal>
              {post.tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">{post.tags.map(tag => <TagPill key={tag} tag={tag} to={`/blog?tag=${encodeURIComponent(tag)}`} />)}</div>
              )}
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">{post.title}</h1>
              {post.summary && <p className="mt-5 text-lg leading-relaxed text-slate-400">{post.summary}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/15 text-blue-300"><Newspaper className="h-4 w-4" /></span>
                <div className="text-sm">
                  <div className="font-medium text-slate-200">Recallr team</div>
                  <Meta post={post} />
                </div>
              </div>
            </Reveal>
          </div>
        </header>
        <Reveal delay={120} className="mx-auto max-w-3xl px-4 pb-6">
          <ArticleBody text={post.body} />
        </Reveal>
      </article>

      <div className="mx-auto max-w-3xl px-4 pt-8">
        <PractiseCard />
      </div>

      {related.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-16">
          <div className="mb-5 flex items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold text-white">Keep reading</h2>
            <Link to="/blog" className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">All posts <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p, i) => <Reveal key={p.slug} delay={i * 80} className="h-full"><Card post={p} /></Reveal>)}
          </div>
        </section>
      )}
      {related.length === 0 && <div className="pb-20" />}
    </>
  );
};
