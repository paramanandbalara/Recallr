import React, { useCallback, useEffect, useState } from 'react';
import { BookMarked, ChevronDown, Search, Trash2 } from 'lucide-react';
import { api, CATEGORIES, CATEGORY_IDS, dateTime, type QuestionCategory, type SavedAnswer } from '../../api';
import { useAuth } from '../../auth';
import { AccountPage } from '../../components/AccountNav';
import { Badge, Button, Card, ErrorText, Input } from '../../components/ui';

interface Mine {
  answers: SavedAnswer[];
  byCategory: Partial<Record<QuestionCategory, number>>;
  saveAnswers: boolean;
}

// The questions the user was asked in interviews, with the answers Recallr gave, by category
export const AccountQuestions: React.FC = () => {
  const { refresh } = useAuth();
  const [category, setCategory] = useState<QuestionCategory | ''>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Mine | null>(null);
  const [more, setMore] = useState(false); // Another page may follow
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async (before?: string) => {
    const params = new URLSearchParams({ ...(category ? { category } : {}), ...(query ? { q: query } : {}), ...(before ? { before } : {}) });
    try {
      const page = await api<Mine>(`/questions/mine?${params}`);
      setData(previous => (before && previous ? { ...page, answers: [...previous.answers, ...page.answers] } : page));
      setMore(page.answers.length === 50);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [category, query]);
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setOpen(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const remove = async (answer: SavedAnswer) => {
    setBusy(answer.id);
    try {
      await api(`/questions/mine/${answer.id}`, { method: 'DELETE' });
      setData(d => d && { ...d, answers: d.answers.filter(a => a.id !== answer.id) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const removeAll = async () => {
    if (!window.confirm('Delete all your saved questions and answers? This can’t be undone.')) return;
    setBusy('all');
    try {
      await api('/questions/mine', { method: 'DELETE' });
      await load();
    } finally {
      setBusy('');
    }
  };

  const setSaving = async (saveAnswers: boolean) => {
    setBusy('saving');
    try {
      await api('/auth/me', { method: 'PATCH', body: { saveAnswers } });
      setData(d => d && { ...d, saveAnswers });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const total = Object.values(data?.byCategory ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <AccountPage title="My questions">
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 !p-4">
        <p className="max-w-2xl text-sm text-slate-400">
          {data?.saveAnswers === false
            ? 'Saving is off: new interview questions and answers are not kept on your account.'
            : 'Questions you were asked in interviews, with the answer Recallr gave, are saved here so you can prepare for the next one.'}
          {' '}Only you can see your answers.
        </p>
        {data && (
          <Button size="sm" variant={data.saveAnswers ? 'secondary' : 'primary'} loading={busy === 'saving'} onClick={() => setSaving(!data.saveAnswers)}>
            {data.saveAnswers ? 'Turn saving off' : 'Turn saving on'}
          </Button>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCategory('')} className={`rounded-full px-3 py-1 text-sm ${category === '' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
          All <span className="opacity-70">{total}</span>
        </button>
        {CATEGORY_IDS.filter(c => data?.byCategory[c]).map(c => (
          <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-3 py-1 text-sm ${category === c ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            {CATEGORIES[c].label} <span className="opacity-70">{data?.byCategory[c]}</span>
          </button>
        ))}
      </div>

      <form className="relative mt-4 max-w-md" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}>
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions and answers" className="pl-9" />
      </form>

      <div className="mt-4"><ErrorText>{error}</ErrorText></div>
      <div className="mt-4 space-y-2">
        {data?.answers.map(a => (
          <Card key={a.id} className="!p-0">
            <button onClick={() => toggle(a.id)} className="flex w-full items-start gap-3 p-4 text-left">
              <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open.has(a.id) ? 'rotate-180' : ''}`} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-100">{a.question}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone="blue">{CATEGORIES[a.category].label}</Badge>
                  {a.source === 'PREPARED' && <Badge tone="green">Prepared answer</Badge>}
                  {dateTime(a.createdAt)}
                </span>
              </span>
            </button>
            {open.has(a.id) && (
              <div className="border-t border-slate-800 px-4 pb-4 pt-3 pl-11">
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{a.answer}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(`${a.question}\n\n${a.answer}`)}>Copy</Button>
                  <Button size="sm" variant="ghost" loading={busy === a.id} onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                </div>
              </div>
            )}
          </Card>
        ))}
        {data && data.answers.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
            <BookMarked className="h-6 w-6" />
            {query || category ? 'Nothing matches.' : 'No questions yet. They appear here after your interviews in the app.'}
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        {more ? <Button size="sm" onClick={() => load(data!.answers.at(-1)!.id)}>Load more</Button> : <span />}
        {total > 0 && <Button size="sm" variant="ghost" loading={busy === 'all'} onClick={removeAll}>Delete all</Button>}
      </div>
    </AccountPage>
  );
};
