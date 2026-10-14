import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ChevronRight, Loader2, Search, Sparkles } from 'lucide-react';
import { api, type CategoryPage, type PublicQuestion } from '../api';
import { useAuth } from '../auth';
import { Reveal } from '../components/Showcase';
import { Card, ErrorText, Input } from '../components/ui';
import { usePageMeta } from '../seo';

// The website's interview question library: questions candidates were really asked (counted without names),
// each with a guide on how to answer it. Admins choose what's published.

interface ListResponse {
  categories: CategoryPage[];
  questions: PublicQuestion[];
}

const askedLabel = (n: number) => (n >= 2 ? `Asked ${n} times` : 'Recently asked');

const QuestionLink: React.FC<{ q: PublicQuestion }> = ({ q }) => (
  <Link to={`/interview-questions/${q.categorySlug}/${q.slug}`} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 hover:border-slate-700 hover:bg-slate-900">
    <span className="text-slate-200 group-hover:text-white">{q.text}</span>
    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">{askedLabel(q.timesAsked)} <ChevronRight className="h-4 w-4" /></span>
  </Link>
);

const TryRecallr: React.FC = () => {
  const { user } = useAuth();
  return (
    <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 border-blue-500/30 bg-gradient-to-br from-blue-600/15 to-slate-900">
      <div>
        <div className="flex items-center gap-2 font-semibold text-white"><Sparkles className="h-4 w-4 text-amber-300" /> Practise these out loud</div>
        <p className="mt-1 text-sm text-slate-400">Recallr’s mock interviews ask questions like these and score your answers, with feedback on pace and filler words.</p>
      </div>
      <Link to={user ? '/download' : '/register'} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
        {user ? 'Download the app' : 'Start free'} <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
};

// /interview-questions and /interview-questions/:category
export const QuestionLibrary: React.FC = () => {
  const { category } = useParams();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setData(null);
    const params = new URLSearchParams({ ...(category ? { category } : {}), ...(query ? { q: query } : {}) });
    api<ListResponse>(`/public/questions?${params}`).then(setData, e => setError(e.message));
  }, [category, query]);

  const page = data?.categories.find(c => c.slug === category);
  usePageMeta(
    page ? `${page.title} – interview questions and how to answer them | Recallr` : 'Interview questions and how to answer them | Recallr',
    page ? `${page.text} Real questions, with guides on how to answer each one.` : 'Real interview questions by category, with a guide on how to answer each: HR, behavioral, coding, system design and technical.',
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <nav className="mb-4 flex items-center gap-1 text-sm text-slate-500">
        <Link to="/interview-questions" className="hover:text-slate-300">Interview questions</Link>
        {page && <><ChevronRight className="h-4 w-4" /> <span className="text-slate-300">{page.title}</span></>}
      </nav>
      <Reveal>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{page ? page.title : 'Interview questions, and how to answer them'}</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          {page ? page.text : 'Questions candidates were really asked in interviews, most asked first, each with a guide on what the interviewer wants and how to answer.'}
        </p>
      </Reveal>

      <form className="relative mt-6 max-w-md" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}>
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions" className="pl-9" />
      </form>

      {data && !page && !query && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.categories.filter(c => c.count > 0).map((c, i) => (
            <Reveal key={c.slug} delay={i * 60}>
              <Link to={`/interview-questions/${c.slug}`} className="card-lift block h-full rounded-2xl border border-slate-800 bg-slate-900/60 p-5 hover:border-slate-700">
                <div className="font-semibold text-slate-100">{c.title}</div>
                <p className="mt-1 text-sm text-slate-400">{c.text}</p>
                <div className="mt-3 text-xs text-blue-300">{c.count} {c.count === 1 ? 'question' : 'questions'} →</div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {!data && !error && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>}
      {data && (
        <section className="mt-10">
          {!page && !query && <h2 className="mb-3 text-lg font-semibold text-white">Most asked</h2>}
          <div className="space-y-2">
            {data.questions.map(q => <QuestionLink key={q.slug} q={q} />)}
            {data.questions.length === 0 && <p className="text-sm text-slate-500">{query ? 'Nothing matches.' : 'Questions are being added. Check back soon.'}</p>}
          </div>
        </section>
      )}
      <TryRecallr />
    </div>
  );
};

// The guide is plain text: "## " headings, "- " bullets, ``` code blocks and paragraphs
const Guide: React.FC<{ text: string }> = ({ text }) => {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      blocks.push(<pre key={i} className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-200"><code>{code.join('\n')}</code></pre>);
    } else if (line.startsWith('## ')) {
      blocks.push(<h2 key={i} className="mt-8 text-xl font-semibold text-white">{line.slice(3)}</h2>);
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*] /, ''));
      i--;
      blocks.push(<ul key={i} className="list-disc space-y-1.5 pl-5 text-slate-300">{items.map((item, j) => <li key={j}>{item}</li>)}</ul>);
    } else if (line.trim()) {
      blocks.push(<p key={i} className="leading-relaxed text-slate-300">{line}</p>);
    }
  }
  return <div className="space-y-3">{blocks}</div>;
};

interface QuestionResponse {
  question: PublicQuestion & { guide: string; updatedAt: string };
  categoryPage: { slug: string; title: string; text: string };
  related: PublicQuestion[];
}

// /interview-questions/:category/:slug
export const QuestionPage: React.FC = () => {
  const { slug = '' } = useParams();
  const [data, setData] = useState<QuestionResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    api<QuestionResponse>(`/public/questions/${encodeURIComponent(slug)}`).then(setData, e => setError(e.message));
  }, [slug]);
  usePageMeta(
    data ? `${data.question.text} – how to answer | Recallr` : 'Interview question | Recallr',
    data ? `How to answer “${data.question.text}”: what the interviewer wants, how to structure your answer, an example and mistakes to avoid.` : undefined,
  );

  if (error) return <div className="mx-auto max-w-3xl px-4 py-20"><ErrorText>{error}</ErrorText><Link to="/interview-questions" className="mt-4 inline-block text-blue-400">All interview questions</Link></div>;
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;
  const { question, categoryPage, related } = data;

  return (
    <article className="mx-auto max-w-3xl px-4 py-14">
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link to="/interview-questions" className="hover:text-slate-300">Interview questions</Link>
        <ChevronRight className="h-4 w-4" />
        <Link to={`/interview-questions/${categoryPage.slug}`} className="hover:text-slate-300">{categoryPage.title}</Link>
      </nav>
      <Reveal>
        <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{question.text}</h1>
        <p className="mt-3 text-sm text-slate-500">{askedLabel(question.timesAsked)} in interviews · updated {new Date(question.updatedAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
      </Reveal>
      <Reveal delay={100} className="mt-4"><Guide text={question.guide} /></Reveal>
      <TryRecallr />
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-lg font-semibold text-white">More {categoryPage.title.toLowerCase()}</h2>
          <div className="space-y-2">{related.map(q => <QuestionLink key={q.slug} q={q} />)}</div>
        </section>
      )}
    </article>
  );
};
