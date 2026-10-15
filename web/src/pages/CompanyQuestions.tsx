import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Building2, ChevronRight, Loader2, Search, Sparkles } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Reveal } from '../components/Showcase';
import { Card, ErrorText, Input } from '../components/ui';
import { usePageMeta } from '../seo';

// Questions asked in interviews at each company, gathered from Recallr users without names or answers.
// A company only appears once at least three different people were asked questions there.

interface Company {
  name: string;
  slug: string;
  questionCount: number;
}

interface PackQuestion {
  text: string;
  category: string;
  categorySlug: string;
  askedBy: number;
  slug: string | null; // Its guide on the website, when there is one
}

interface Pack {
  company: { name: string; slug: string };
  questions: PackQuestion[];
}

// The rounds, in the order an interview usually goes
const ROUNDS: [string, string][] = [
  ['hr', 'HR and “about you”'],
  ['behavioral', 'Behavioral'],
  ['technical', 'Technical concepts'],
  ['coding', 'Coding'],
  ['system-design', 'System design'],
  ['general', 'Other questions'],
];

const PractiseCta: React.FC<{ company?: string }> = ({ company }) => {
  const { user } = useAuth();
  return (
    <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 border-blue-500/30 bg-gradient-to-br from-blue-600/15 to-slate-900">
      <div>
        <div className="flex items-center gap-2 font-semibold text-white"><Sparkles className="h-4 w-4 text-amber-300" /> Practise them out loud</div>
        <p className="mt-1 text-sm text-slate-400">
          {company
            ? `Put ${company} in your Recallr profile and the mock interview asks you these questions, then scores your answers.`
            : 'Put the company in your Recallr profile and the mock interview asks you its questions, then scores your answers.'}
        </p>
      </div>
      <Link to={user ? '/download' : '/register'} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
        {user ? 'Download the app' : 'Start free'} <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
};

const Crumbs: React.FC<{ company?: string }> = ({ company }) => (
  <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-slate-500">
    <Link to="/interview-questions" className="hover:text-slate-300">Interview questions</Link>
    <ChevronRight className="h-4 w-4" />
    {company ? <Link to="/interview-questions/companies" className="hover:text-slate-300">By company</Link> : <span className="text-slate-300">By company</span>}
    {company && <><ChevronRight className="h-4 w-4" /> <span className="text-slate-300">{company}</span></>}
  </nav>
);

// /interview-questions/companies
export const CompanyList: React.FC = () => {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  usePageMeta(
    'Interview questions by company | Recallr',
    'Questions candidates were really asked in interviews at each company, gathered without names. Practise them before your interview.',
  );

  useEffect(() => {
    api<{ companies: Company[] }>('/public/questions/companies').then(data => setCompanies(data.companies), e => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (companies ?? []).filter(c => !needle || c.name.toLowerCase().includes(needle));
  }, [companies, search]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <Crumbs />
      <Reveal>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Interview questions by company</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Questions candidates were really asked in interviews at each company. Only the questions are shared, never anyone’s answers or names,
          and a company is listed only once several different people were asked questions there.
        </p>
      </Reveal>

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies" className="pl-9" />
      </div>

      <ErrorText>{error}</ErrorText>
      {!companies && !error && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>}
      {companies && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c, i) => (
            <Reveal key={c.slug} delay={Math.min(i, 8) * 40}>
              <Link to={`/interview-questions/companies/${c.slug}`} className="card-lift flex h-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700">
                <Building2 className="h-5 w-5 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-100">{c.name}</div>
                  <div className="text-xs text-blue-300">{c.questionCount} {c.questionCount === 1 ? 'question' : 'questions'} →</div>
                </div>
              </Link>
            </Reveal>
          ))}
          {shown.length === 0 && (
            <p className="text-sm text-slate-500">{search ? 'No company matches.' : 'Companies appear here as people practise with Recallr. Check back soon.'}</p>
          )}
        </div>
      )}
      <PractiseCta />
    </div>
  );
};

// /interview-questions/companies/:slug
export const CompanyQuestions: React.FC = () => {
  const { slug = '' } = useParams();
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPack(null);
    setError('');
    api<{ pack: Pack }>(`/public/questions/companies/${encodeURIComponent(slug)}`).then(data => setPack(data.pack), e => setError(e.message));
  }, [slug]);

  const name = pack?.company.name ?? '';
  usePageMeta(
    name ? `${name} interview questions – asked in real interviews | Recallr` : 'Company interview questions | Recallr',
    name ? `Questions candidates were really asked in ${name} interviews: HR, behavioral, coding, system design and technical.` : undefined,
  );

  const rounds = ROUNDS
    .map(([categorySlug, title]) => ({ title, questions: pack?.questions.filter(q => q.categorySlug === categorySlug) ?? [] }))
    .filter(round => round.questions.length);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <Crumbs company={name || undefined} />
      <ErrorText>{error}</ErrorText>
      {error && <Link to="/interview-questions/companies" className="mt-4 inline-block text-sm text-blue-300 hover:text-blue-200">See all companies →</Link>}
      {!pack && !error && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>}
      {pack && (
        <>
          <Reveal>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">{name} interview questions</h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              {pack.questions.length === 1 ? 'A question' : `${pack.questions.length} questions`} candidates were really asked in interviews at {name},
              most asked first. Only the questions are shared, never anyone’s answers or names.
            </p>
          </Reveal>
          {rounds.map(round => (
            <section key={round.title} className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">{round.title}</h2>
              <ul className="space-y-2">
                {round.questions.map(q => (
                  <li key={q.text}>
                    {q.slug ? (
                      <Link to={`/interview-questions/${q.categorySlug}/${q.slug}`} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 hover:border-slate-700 hover:bg-slate-900">
                        <span className="text-slate-200 group-hover:text-white">{q.text}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-blue-300">How to answer <ChevronRight className="h-4 w-4" /></span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
                        <span className="text-slate-200">{q.text}</span>
                        {q.askedBy >= 2 && <span className="shrink-0 text-xs text-slate-500">Asked by {q.askedBy} people</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <PractiseCta company={name || undefined} />
    </div>
  );
};
