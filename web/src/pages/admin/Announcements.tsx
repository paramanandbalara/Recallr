import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, dateTime } from '../../api';
import { Badge, Button, Card, ErrorText, Field, Input, Select, TextArea } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

interface Announcement {
  id: string;
  title: string;
  body: string;
  level: 'INFO' | 'WARNING';
  audience: 'ALL' | 'DESKTOP' | 'WEBSITE';
  active: boolean;
  startsAt: string;
  endsAt: string | null;
}

const AUDIENCE = { ALL: 'App and website', DESKTOP: 'App only', WEBSITE: 'Website only' } as const;

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');

const Form: React.FC<{ item: Announcement | null; onDone: () => void; onCancel: () => void }> = ({ item, onDone, onCancel }) => {
  const [form, setForm] = useState({
    title: item?.title ?? '', body: item?.body ?? '', level: item?.level ?? 'INFO', audience: item?.audience ?? 'ALL',
    startsAt: toLocalInput(item?.startsAt ?? null), endsAt: toLocalInput(item?.endsAt ?? null),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        title: form.title, body: form.body, level: form.level, audience: form.audience,
        ...(form.startsAt ? { startsAt: new Date(form.startsAt).toISOString() } : {}),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      await api(item ? `/admin/announcements/${item.id}` : '/admin/announcements', { method: item ? 'PATCH' : 'POST', body });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Title"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. New: answers in Tamil" required /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Shown in">
            <Select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value as Announcement['audience'] })}>
              {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Style">
            <Select value={form.level} onChange={e => setForm({ ...form, level: e.target.value as Announcement['level'] })}>
              <option value="INFO">News (blue)</option>
              <option value="WARNING">Important (amber)</option>
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-2"><Field label="Message (optional)"><TextArea rows={2} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></Field></div>
        <Field label="From" hint="Empty = now"><Input type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></Field>
        <Field label="Until" hint="Empty = until you turn it off"><Input type="datetime-local" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={busy}>{item ? 'Save' : 'Publish'}</Button>
        </div>
        <div className="sm:col-span-2"><ErrorText>{error}</ErrorText></div>
      </form>
    </Card>
  );
};

export const AdminAnnouncements: React.FC = () => {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ announcements: Announcement[] }>('/admin/announcements').then(r => setItems(r.announcements), e => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const act = async (path: string, init: { method: string; body?: unknown }) => {
    await api(path, init).catch(e => setError(e.message));
    load();
  };

  const live = (a: Announcement) => a.active && new Date(a.startsAt) <= new Date() && (!a.endsAt || new Date(a.endsAt) > new Date());

  return (
    <>
      <AdminTitle title="Announcements">
        <Button variant="primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New announcement</Button>
      </AdminTitle>
      <p className="mb-4 text-sm text-slate-400">
        A banner in the app and/or on the website: new features, planned downtime, offers. People can close it.
        App updates are announced automatically from Settings → App versions.
      </p>
      <ErrorText>{error}</ErrorText>
      {editing && <Form key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? null : editing} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
      <div className="space-y-2">
        {items?.map(a => (
          <Card key={a.id} className="flex flex-wrap items-start justify-between gap-3 !p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-100">{a.title}</span>
                {live(a) ? <Badge tone="green">Showing</Badge> : <Badge>Not showing</Badge>}
                <Badge tone={a.level === 'WARNING' ? 'amber' : 'blue'}>{AUDIENCE[a.audience]}</Badge>
              </div>
              {a.body && <p className="mt-1 text-sm text-slate-400">{a.body}</p>}
              <p className="mt-1 text-xs text-slate-500">{dateTime(a.startsAt)} → {a.endsAt ? dateTime(a.endsAt) : 'no end'}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => act(`/admin/announcements/${a.id}`, { method: 'PATCH', body: { active: !a.active } })}>{a.active ? 'Turn off' : 'Turn on'}</Button>
              <Button size="sm" variant="ghost" onClick={() => window.confirm('Delete this announcement?') && act(`/admin/announcements/${a.id}`, { method: 'DELETE' })}>Delete</Button>
            </div>
          </Card>
        ))}
        {items?.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
      </div>
    </>
  );
};
