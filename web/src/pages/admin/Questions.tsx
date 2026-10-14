import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { api, CATEGORIES, CATEGORY_IDS, date, type QuestionCategory } from '../../api';
import { Badge, Button, Card, ErrorText, Field, Input, Select, TextArea } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

interface BankQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
  timesAsked: number;
  lastAskedAt: string;
  published: boolean;
  slug: string | null;
  guide: string | null;
  savedAnswers: number;
}

// One question being reviewed: fix the wording and category, draft the guide with AI, publish
const Editor: React.FC<{ question: BankQuestion; onSaved: (q: BankQuestion) => void; onDeleted: () => void }> = ({ question, onSaved, onDeleted }) => {
  const [text, setText] = useState(question.text);
  const [category, setCategory] = useState(question.category);
  const [guide, setGuide] = useState(question.guide ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (what: string, action: () => Promise<void>) => {
    setBusy(what);
    setError('');
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };
  const save = (published?: boolean) => run(published === undefined ? 'save' : 'publish', async () => {
    const { question: saved } = await api<{ question: BankQuestion }>(`/admin/questions/${question.id}`, {
      method: 'PATCH', body: { text, category, guide, ...(published === undefined ? {} : { published }) },
    });
    onSaved({ ...question, ...saved });
  });

  return (
    <div className="space-y-3 border-t border-slate-800 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <Field label="Question"><Input value={text} onChange={e => setText(e.target.value)} /></Field>
        <Field label="Category">
          <Select value={category} onChange={e => setCategory(e.target.value as QuestionCategory)}>
            {CATEGORY_IDS.map(c => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Guide (shown on the website)" hint={'Sections start with "## ", bullets with "- ", code between ``` lines. Write for anyone: no one’s personal details.'}>
        <TextArea rows={12} value={guide} onChange={e => setGuide(e.target.value)} className="font-mono text-xs" />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy === 'draft'} onClick={() => run('draft', async () => {
          if (guide.trim() && !window.confirm('Replace the guide with a new AI draft?')) return;
          setGuide((await api<{ guide: string }>(`/admin/questions/${question.id}/draft-guide`, { method: 'POST' })).guide);
        })}><Sparkles className="h-3.5 w-3.5" /> Draft guide with AI</Button>
        <Button size="sm" loading={busy === 'save'} onClick={() => save()}>Save</Button>
        <Button size="sm" variant="primary" loading={busy === 'publish'} onClick={() => save(!question.published)}>{question.published ? 'Unpublish' : 'Save and publish'}</Button>
        {question.published && question.slug && (
          <a href={`/interview-questions/${CATEGORIES[question.category].slug}/${question.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 text-xs text-blue-400">
            View page <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" loading={busy === 'delete'} onClick={() => run('delete', async () => {
          if (!window.confirm('Remove this question from the bank? Users keep their own saved copies.')) return;
          await api(`/admin/questions/${question.id}`, { method: 'DELETE' });
          onDeleted();
        })}>Delete</Button>
      </div>
    </div>
  );
};

// Every question the app has heard, most asked first: review, write a guide, publish to the website
export const AdminQuestions: React.FC = () => {
  const [filters, setFilters] = useState({ category: '', status: 'all', sort: 'popular', q: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; questions: BankQuestion[] } | null>(null);
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ status: filters.status, sort: filters.sort, page: String(page), ...(filters.category ? { category: filters.category } : {}), ...(filters.q ? { q: filters.q } : {}) });
    api<{ total: number; questions: BankQuestion[] }>(`/admin/questions?${params}`).then(setData, e => setError(e.message));
  }, [filters, page]);
  useEffect(load, [load]);
  const setFilter = (key: keyof typeof filters, value: string) => { setPage(1); setFilters(f => ({ ...f, [key]: value })); };

  return (
    <>
      <AdminTitle title="Question bank" />
      <p className="-mt-3 mb-5 max-w-3xl text-sm text-slate-400">
        Every question the app has answered, counted without names. Publish the useful ones on the website’s
        <a href="/interview-questions" target="_blank" rel="noreferrer" className="text-blue-400"> interview questions</a> pages with a guide.
        Users’ own answers are never shown here or on the website.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={filters.category} onChange={e => setFilter('category', e.target.value)} className="!w-auto">
          <option value="">All categories</option>
          {CATEGORY_IDS.map(c => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
        </Select>
        <Select value={filters.status} onChange={e => setFilter('status', e.target.value)} className="!w-auto">
          <option value="all">Published or not</option>
          <option value="unpublished">Not published</option>
          <option value="published">Published</option>
        </Select>
        <Select value={filters.sort} onChange={e => setFilter('sort', e.target.value)} className="!w-auto">
          <option value="popular">Most asked</option>
          <option value="recent">Recently asked</option>
        </Select>
        <form onSubmit={e => { e.preventDefault(); setFilter('q', search.trim()); }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="!w-56" />
        </form>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-2">
        {data?.questions.map(q => (
          <Card key={q.id} className="!p-0">
            <button onClick={() => setOpen(open === q.id ? '' : q.id)} className="flex w-full flex-wrap items-center gap-3 p-4 text-left">
              <span className="min-w-0 flex-1 text-slate-100">{q.text}</span>
              <Badge tone="blue">{CATEGORIES[q.category].label}</Badge>
              {q.published ? <Badge tone="green">Published</Badge> : q.guide ? <Badge tone="amber">Guide drafted</Badge> : null}
              <span className="text-xs tabular-nums text-slate-500">asked {q.timesAsked}× · last {date(q.lastAskedAt)}</span>
            </button>
            {open === q.id && (
              <Editor
                question={q}
                onSaved={saved => setData(d => d && { ...d, questions: d.questions.map(x => (x.id === saved.id ? saved : x)) })}
                onDeleted={() => { setOpen(''); load(); }}
              />
            )}
          </Card>
        ))}
        {data && data.questions.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No questions yet. They arrive as people use the app.</p>}
      </div>
      {data && data.total > 50 && (
        <div className="mt-4 flex items-center gap-3 text-sm text-slate-400">
          <Button size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          Page {page} of {Math.ceil(data.total / 50)}
          <Button size="sm" disabled={page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </>
  );
};
