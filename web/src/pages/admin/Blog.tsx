import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Plus, Sparkles } from 'lucide-react';
import { api, date } from '../../api';
import { ArticleBody, readingTime } from '../../components/ArticleBody';
import { Badge, Button, Card, ErrorText, Field, Input, Select, TextArea } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

type Status = 'DRAFT' | 'PUBLISHED';

interface AdminPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body?: string;
  tags: string[];
  status: Status;
  source: 'ADMIN' | 'AI';
  author: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readingMinutes: number;
}

interface Draft {
  title: string;
  summary: string;
  tags: string[];
  body: string;
}

const StatusBadge: React.FC<{ post: Pick<AdminPost, 'status' | 'source'> }> = ({ post }) => (
  <>
    {post.status === 'PUBLISHED' ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Draft</Badge>}
    {post.source === 'AI' ? <Badge tone="blue">AI</Badge> : <Badge>Admin</Badge>}
  </>
);

// Write or edit one post, with a live preview; "Draft with AI" fills it in from a topic
const Editor: React.FC<{ id: string | null; onDone: (changed: boolean) => void }> = ({ id, onDone }) => {
  const [post, setPost] = useState<AdminPost | null>(null);
  const [form, setForm] = useState({ title: '', slug: '', summary: '', tags: '', body: '' });
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const [preview, setPreview] = useState(false); // Phones: edit or preview

  const fill = (p: AdminPost) => {
    setPost(p);
    setForm({ title: p.title, slug: p.slug, summary: p.summary, tags: p.tags.join(', '), body: p.body ?? '' });
  };
  useEffect(() => {
    if (id) api<{ post: AdminPost }>(`/admin/blog/${id}`).then(r => fill(r.post), e => setError(e.message));
  }, [id]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
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

  const save = (status?: Status) => run(status ?? 'save', async () => {
    const body = {
      title: form.title, summary: form.summary, tags: form.tags, body: form.body,
      ...(form.slug.trim() && form.slug.trim() !== post?.slug ? { slug: form.slug.trim() } : {}),
      ...(status ? { status } : {}),
    };
    const saved = post
      ? await api<{ post: AdminPost }>(`/admin/blog/${post.id}`, { method: 'PATCH', body })
      : await api<{ post: AdminPost }>('/admin/blog', { method: 'POST', body: { ...body, status: status ?? 'DRAFT' } });
    fill(saved.post);
    setChanged(true);
  });

  const draftWithAi = () => run('draft', async () => {
    if (form.body.trim() && !window.confirm('Replace the title, summary, tags and text with a new AI draft?')) return;
    const { draft } = await api<{ draft: Draft }>('/admin/blog/draft', { method: 'POST', body: { topic } });
    setForm(f => ({ ...f, title: draft.title, summary: draft.summary, tags: draft.tags.join(', '), body: draft.body }));
  });

  if (id && !post) return error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-slate-500">Loading…</p>;
  const published = post?.status === 'PUBLISHED';

  return (
    <>
      <AdminTitle title={post ? 'Edit post' : 'New post'}>
        <Button size="sm" variant="ghost" onClick={() => onDone(changed)}><ArrowLeft className="h-3.5 w-3.5" /> All posts</Button>
      </AdminTitle>
      {post && (
        <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <StatusBadge post={post} />
          <span>Created {date(post.createdAt)}{post.author ? ` by ${post.author}` : ''}</span>
          {post.publishedAt && <span>· first published {date(post.publishedAt)}</span>}
          {published && (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400">View on the website <ExternalLink className="h-3 w-3" /></a>
          )}
        </div>
      )}

      <Card className="mb-5 border-blue-500/20 bg-blue-500/5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <Field label="Draft with AI" hint="A topic, e.g. “How to answer notice period questions”. The draft fills the editor; nothing is saved until you save.">
              <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic for the post" onKeyDown={e => { if (e.key === 'Enter' && topic.trim().length >= 3) draftWithAi(); }} />
            </Field>
          </div>
          <Button variant="primary" className="mb-5" loading={busy === 'draft'} disabled={topic.trim().length < 3} onClick={draftWithAi}>
            <Sparkles className="h-4 w-4" /> Draft with AI
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title"><Input value={form.title} onChange={set('title')} maxLength={200} /></Field>
        <Field label="Address" hint={published ? 'Fixed while the post is published, so links keep working. Unpublish to change it.' : 'Lower-case words and dashes. Empty: made from the title.'}>
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 pl-3 text-sm text-slate-500 focus-within:border-blue-500">
            /blog/
            <input value={form.slug} onChange={set('slug')} disabled={published} className="w-full bg-transparent px-1 py-2 text-slate-100 focus:outline-none disabled:text-slate-400" placeholder="how-to-answer-why-us" />
          </div>
        </Field>
        <Field label={`Summary (${form.summary.length}/155)`} hint="Shown on the blog cards and in search results.">
          <TextArea rows={2} value={form.summary} onChange={set('summary')} maxLength={400} className={form.summary.length > 155 ? '!border-amber-500/60' : ''} />
        </Field>
        <Field label="Tags" hint="Comma-separated, e.g. hr round, freshers, resume.">
          <Input value={form.tags} onChange={set('tags')} />
        </Field>
      </div>

      <div className="mt-4 flex gap-1 lg:hidden">
        <Button size="sm" variant={preview ? 'ghost' : 'secondary'} onClick={() => setPreview(false)}>Write</Button>
        <Button size="sm" variant={preview ? 'secondary' : 'ghost'} onClick={() => setPreview(true)}>Preview</Button>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className={preview ? 'hidden lg:block' : ''}>
          <Field label="Text" hint={'Sections start with "## ", bullets with "- ", code between ``` lines. Paragraphs are separated by a line break.'}>
            <TextArea rows={28} value={form.body} onChange={set('body')} className="font-mono text-xs leading-5" />
          </Field>
        </div>
        <div className={preview ? '' : 'hidden lg:block'}>
          <div className="mb-1 flex justify-between text-xs font-medium text-slate-300">
            <span>Preview</span>
            <span className="text-slate-500">{form.body.trim() ? `${readingTime(form.body)} min read` : ''}</span>
          </div>
          <div className="max-h-[640px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <h1 className="text-2xl font-bold text-white">{form.title || 'Untitled post'}</h1>
            {form.summary && <p className="mt-2 text-slate-400">{form.summary}</p>}
            <ArticleBody text={form.body} className="mt-5 !text-[15px] !leading-7" />
            {!form.body.trim() && <p className="mt-5 text-sm text-slate-600">The text appears here as you write.</p>}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 mt-5 flex flex-wrap items-center gap-2 border-t border-slate-800 bg-slate-950/90 py-3 backdrop-blur">
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          {post && (
            <Button variant="ghost" className="mr-auto" loading={busy === 'delete'} onClick={() => run('delete', async () => {
              if (!window.confirm(`Delete “${post.title}”? This can’t be undone.`)) return;
              await api(`/admin/blog/${post.id}`, { method: 'DELETE' });
              onDone(true);
            })}>Delete</Button>
          )}
          {published ? (
            <>
              <Button loading={busy === 'DRAFT'} onClick={() => save('DRAFT')}>Unpublish</Button>
              <Button variant="primary" loading={busy === 'save'} onClick={() => save()}>Save changes</Button>
            </>
          ) : (
            <>
              <Button loading={busy === 'DRAFT'} onClick={() => save('DRAFT')}>Save draft</Button>
              <Button variant="primary" loading={busy === 'PUBLISHED'} onClick={() => save('PUBLISHED')}>Publish</Button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

// All posts, newest first: the admin's and the AI's daily drafts
export const AdminBlog: React.FC = () => {
  const [filters, setFilters] = useState({ status: 'all', source: 'all', q: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; drafts: number; posts: AdminPost[] } | null>(null);
  const [editing, setEditing] = useState<string | null | undefined>(undefined); // undefined: the list; null: a new post
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ ...filters, page: String(page) });
    if (!filters.q) params.delete('q');
    api<{ total: number; drafts: number; posts: AdminPost[] }>(`/admin/blog?${params}`).then(setData, e => setError(e.message));
  }, [filters, page]);
  useEffect(load, [load]);
  const setFilter = (key: keyof typeof filters, value: string) => { setPage(1); setFilters(f => ({ ...f, [key]: value })); };

  if (editing !== undefined) {
    return <Editor id={editing} onDone={changed => { setEditing(undefined); if (changed) load(); }} />;
  }

  return (
    <>
      <AdminTitle title="Blog">
        <Button variant="primary" size="sm" onClick={() => setEditing(null)}><Plus className="h-3.5 w-3.5" /> New post</Button>
      </AdminTitle>
      <p className="-mt-3 mb-5 max-w-3xl text-sm text-slate-400">
        Articles on the website’s <a href="/blog" target="_blank" rel="noreferrer" className="text-blue-400">blog</a>.
        The AI can also write one post a day, as a draft for you to check or published straight away: see the Blog section in{' '}
        <Link to="/admin/settings" className="text-blue-400">Settings</Link>.
        {data && data.drafts > 0 && <> <span className="text-amber-300">{data.drafts} {data.drafts === 1 ? 'draft is' : 'drafts are'} waiting.</span></>}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={filters.status} onChange={e => setFilter('status', e.target.value)} className="!w-auto">
          <option value="all">Any status</option>
          <option value="DRAFT">Drafts</option>
          <option value="PUBLISHED">Published</option>
        </Select>
        <Select value={filters.source} onChange={e => setFilter('source', e.target.value)} className="!w-auto">
          <option value="all">Written by anyone</option>
          <option value="AI">Written by AI</option>
          <option value="ADMIN">Written by admins</option>
        </Select>
        <form onSubmit={e => { e.preventDefault(); setFilter('q', search.trim()); }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search titles and tags" className="!w-56" />
        </form>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-2">
        {data?.posts.map(p => (
          <Card key={p.id} className="!p-0">
            <button onClick={() => setEditing(p.id)} className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-slate-900">
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-100">{p.title}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">/blog/{p.slug}{p.tags.length ? ` · ${p.tags.join(', ')}` : ''}</div>
              </div>
              <StatusBadge post={p} />
              <span className="text-xs tabular-nums text-slate-500">
                {p.publishedAt ? `published ${date(p.publishedAt)}` : `created ${date(p.createdAt)}`} · {p.readingMinutes} min
              </span>
            </button>
          </Card>
        ))}
        {data && data.posts.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            {filters.status !== 'all' || filters.source !== 'all' || filters.q ? 'No posts match.' : 'No posts yet. Write one, or let the AI draft one from a topic.'}
          </p>
        )}
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
