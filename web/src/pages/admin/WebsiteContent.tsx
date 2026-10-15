import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, ExternalLink, Info, Plus, Quote, RotateCcw, Trash2 } from 'lucide-react';
import { api, date } from '../../api';
import { Badge, Button, Card, ErrorText, Field, Input, Select, TextArea } from '../../components/ui';
import { DEFAULT_BLOCKS, ICON_NAMES, iconFor, setBlock, type BlockKey, type Blocks } from '../../siteContent';
import { AdminTitle } from './AdminLayout';

// Admin → Website content: the text of the home page (hero, highlights, use cases, testimonials, questions),
// the announcement strip, the footer and the Colleges page. Each block has a form, a preview, Save and
// "Reset to default". The server checks every field again (server/src/siteBlocks.ts).

type Value = Record<string, unknown>;

type FieldSpec =
  | { kind: 'text'; key: string; label: string; hint?: string; long?: boolean; max: number }
  | { kind: 'bool'; key: string; label: string; hint?: string }
  | { kind: 'icon'; key: string; label: string }
  | { kind: 'strings'; key: string; label: string; hint?: string; add: string; max: number; limit: number }
  | { kind: 'items'; key: string; label: string; add: string; limit: number; title: (item: Value, i: number) => string; fields: FieldSpec[]; blank: Value };

interface BlockSpec {
  key: BlockKey;
  title: string;
  where: string; // Where it shows, with a link
  link: string;
  intro?: React.ReactNode;
  fields: FieldSpec[];
}

const text = (key: string, label: string, max: number, extra: { hint?: string; long?: boolean } = {}): FieldSpec => ({ kind: 'text', key, label, max, ...extra });

const BLOCKS: BlockSpec[] = [
  {
    key: 'hero', title: 'Home: top of the page', where: 'Home page, first screen', link: '/',
    fields: [
      text('badge', 'Small badge above the headline', 120, { hint: 'Empty: no badge.' }),
      text('headlineStart', 'Headline, before the rotating words', 80),
      { kind: 'strings', key: 'rotating', label: 'Rotating words (one at a time, in colour)', add: 'Add words', max: 60, limit: 10 },
      text('headlineEnd', 'Headline, after the rotating words', 60),
      text('subtitle', 'Text under the headline', 400, { long: true }),
      text('primaryLabel', 'Main button (signed out)', 40, { hint: 'Goes to sign-up.' }),
      text('primaryLabelSignedIn', 'Main button (signed in)', 40, { hint: 'Goes to the download page.' }),
      text('secondaryLabel', 'Second button', 40, { hint: 'Scrolls to the clips of the app.' }),
      { kind: 'strings', key: 'points', label: 'Ticks under the buttons', add: 'Add a tick', max: 60, limit: 5 },
      text('seoTitle', 'Title in Google and link previews', 70, { hint: 'About 60 characters is best.' }),
      text('seoDescription', 'Description in Google and link previews', 200, { long: true, hint: 'About 150 characters is best. Search engines see changes within a few minutes.' }),
    ],
  },
  {
    key: 'highlights', title: 'Home: highlights', where: 'Home page, the four cards under the app names', link: '/',
    fields: [{
      kind: 'items', key: 'items', label: 'Highlights', add: 'Add a highlight', limit: 8, title: item => String(item.value || 'New highlight'),
      blank: { icon: 'sparkles', value: '', label: '' },
      fields: [{ kind: 'icon', key: 'icon', label: 'Icon' }, text('value', 'Big text', 30), text('label', 'Small text', 120)],
    }],
  },
  {
    key: 'useCases', title: 'Home: who it’s for', where: 'Home page, before “Everything you need”', link: '/#who-its-for',
    intro: (
      <>
        These are <strong>illustrative examples</strong> of how people can use Recallr, and each card is marked “Example”. Describe a
        situation, not a person: no names, photos or quotes presented as a real customer’s. Real people’s words go in “What users say”.
      </>
    ),
    fields: [
      text('title', 'Section title', 80),
      text('subtitle', 'Text under the title', 300, { long: true, hint: 'Keep saying that these are examples, not reviews.' }),
      {
        kind: 'items', key: 'items', label: 'Stories', add: 'Add a story', limit: 8, title: item => String(item.title || 'New story'),
        blank: { icon: 'sparkles', title: '', story: '', points: [] },
        fields: [
          { kind: 'icon', key: 'icon', label: 'Icon' },
          text('title', 'Who (e.g. “A fresher preparing for campus placements”)', 100),
          text('story', 'Their situation and how Recallr helps', 600, { long: true }),
          { kind: 'strings', key: 'points', label: 'Short points', add: 'Add a point', max: 80, limit: 4 },
        ],
      },
    ],
  },
  {
    key: 'testimonials', title: 'Home: what users say', where: 'Home page, before the questions (hidden until one is published)', link: '/',
    intro: (
      <>
        Only add <strong>real people who used Recallr</strong>, in their own words, with their permission. Made-up reviews, or reviews
        written for someone, are an unfair trade practice under the Consumer Protection Act, 2019, and go against ASCI’s code and the
        BIS standard on online reviews (IS 19000:2022). If you gave the person something for their review (free time, a discount),
        say so in their role line. A testimonial shows only when it’s published <em>and</em> you ticked that you have permission; the
        section stays hidden until there’s at least one. Keep the person’s written permission (an email is fine).
      </>
    ),
    fields: [
      text('title', 'Section title', 80),
      {
        kind: 'items', key: 'items', label: 'Testimonials', add: 'Add a testimonial', limit: 20,
        title: item => `${String(item.name || 'New testimonial')}${item.published && item.permission ? ' · published' : ' · not shown'}`,
        blank: { name: '', role: '', quote: '', photoUrl: '', published: false, permission: false },
        fields: [
          text('name', 'Name (as they agreed to be shown)', 80),
          text('role', 'Role or college (optional)', 120, { hint: 'e.g. “Final-year B.Tech, Jaipur”' }),
          text('quote', 'What they said, word for word', 600, { long: true }),
          text('photoUrl', 'Photo address (optional)', 500, { hint: 'https://… Only with their permission to show it.' }),
          { kind: 'bool', key: 'permission', label: 'I have this person’s permission to show their name, words (and photo) on the website' },
          { kind: 'bool', key: 'published', label: 'Published', hint: 'Needs the permission tick.' },
        ],
      },
    ],
  },
  {
    key: 'faq', title: 'Home: questions', where: 'Home page, “Questions” near the end', link: '/',
    fields: [{
      kind: 'items', key: 'items', label: 'Questions', add: 'Add a question', limit: 30, title: item => String(item.q || 'New question'),
      blank: { q: '', a: '' },
      fields: [text('q', 'Question', 200), text('a', 'Answer', 1500, { long: true })],
    }],
  },
  {
    key: 'announcement', title: 'Announcement strip', where: 'Every page, under the menu (visitors can close it)', link: '/',
    intro: <>For a quick message on the website only. For messages in the app too, or with start and end dates, use <Link to="/admin/announcements" className="text-blue-400">Announcements</Link>.</>,
    fields: [
      { kind: 'bool', key: 'enabled', label: 'Show the strip' },
      text('text', 'Text', 200),
      text('linkLabel', 'Link text (optional)', 40),
      text('linkUrl', 'Link (optional)', 300, { hint: 'A page of the website such as /pricing, or a full https:// address.' }),
    ],
  },
  {
    key: 'footer', title: 'Footer', where: 'Every page, at the bottom', link: '/',
    fields: [text('tagline', 'Line under the logo', 200, { long: true })],
  },
  {
    key: 'colleges', title: 'Colleges page: top', where: 'For colleges page, first screen', link: '/colleges',
    fields: [
      text('badge', 'Small badge above the headline', 120, { hint: 'Empty: no badge.' }),
      text('headline', 'Headline', 80),
      text('highlight', 'Words after it, in colour', 60),
      text('subtitle', 'Text under the headline', 500, { long: true }),
      text('button', 'Button', 40, { hint: 'Scrolls to the enquiry form.' }),
    ],
  },
];

// ---------- The form ----------

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const ListButtons: React.FC<{ index: number; count: number; onMove: (to: number) => void; onRemove: () => void }> = ({ index, count, onMove, onRemove }) => (
  <div className="flex shrink-0 gap-0.5">
    <Button type="button" size="sm" variant="ghost" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
    <Button type="button" size="sm" variant="ghost" title="Move down" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
    <Button type="button" size="sm" variant="ghost" title="Remove" aria-label="Remove" onClick={onRemove}><Trash2 className="h-3.5 w-3.5 text-red-300" /></Button>
  </div>
);

// One item of a list, folded to its title (new and short lists start open)
const ItemCard: React.FC<{ index: number; count: number; title: string; startOpen: boolean; onMove: (to: number) => void; onRemove: () => void; children: React.ReactNode }> = ({
  index, count, title, startOpen, onMove, onRemove, children,
}) => {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left">
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="w-5 shrink-0 text-xs text-slate-500">{index + 1}.</span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{title}</span>
        </button>
        <ListButtons index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      {open && <div className="border-t border-slate-800 p-3">{children}</div>}
    </div>
  );
};

const Fields: React.FC<{ fields: FieldSpec[]; value: Value; onChange: (value: Value) => void }> = ({ fields, value, onChange }) => (
  <div className="space-y-4">
    {fields.map(field => {
      const set = (v: unknown) => onChange({ ...value, [field.key]: v });
      const current = value[field.key];
      switch (field.kind) {
        case 'text': {
          const v = String(current ?? '');
          const counter = `${v.length}/${field.max}`;
          return (
            <Field key={field.key} label={field.label} hint={field.hint ? `${field.hint} · ${counter}` : counter}>
              {field.long
                ? <TextArea rows={3} value={v} maxLength={field.max} onChange={e => set(e.target.value)} />
                : <Input value={v} maxLength={field.max} onChange={e => set(e.target.value)} />}
            </Field>
          );
        }
        case 'bool':
          return (
            <label key={field.key} className="flex cursor-pointer items-start gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={current === true} onChange={e => set(e.target.checked)} className="mt-0.5 accent-blue-500" />
              <span>{field.label}{field.hint && <span className="block text-[11px] text-slate-500">{field.hint}</span>}</span>
            </label>
          );
        case 'icon': {
          const Icon = iconFor(String(current));
          return (
            <Field key={field.key} label={field.label}>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10"><Icon className="h-4 w-4 text-blue-400" /></span>
                <Select value={String(current)} onChange={e => set(e.target.value)}>
                  {ICON_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                </Select>
              </div>
            </Field>
          );
        }
        case 'strings': {
          const list = Array.isArray(current) ? (current as string[]) : [];
          return (
            <div key={field.key}>
              <span className="mb-1 block text-xs font-medium text-slate-300">{field.label}</span>
              <div className="space-y-1.5">
                {list.map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input value={item} maxLength={field.max} onChange={e => set(list.map((x, j) => (j === i ? e.target.value : x)))} />
                    <ListButtons index={i} count={list.length} onMove={to => set(move(list, i, to))} onRemove={() => set(list.filter((_, j) => j !== i))} />
                  </div>
                ))}
              </div>
              {list.length < field.limit && (
                <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={() => set([...list, ''])}><Plus className="h-3.5 w-3.5" /> {field.add}</Button>
              )}
              {field.hint && <span className="mt-1 block text-[11px] text-slate-500">{field.hint}</span>}
            </div>
          );
        }
        case 'items': {
          const list = Array.isArray(current) ? (current as Value[]) : [];
          return (
            <div key={field.key}>
              <span className="mb-2 block text-xs font-medium text-slate-300">{field.label} ({list.length})</span>
              <div className="space-y-2">
                {list.map((item, i) => (
                  <ItemCard key={i} index={i} count={list.length} title={field.title(item, i)} startOpen={list.length <= 2 || JSON.stringify(item) === JSON.stringify(field.blank)}
                    onMove={to => set(move(list, i, to))}
                    onRemove={() => { if (window.confirm('Remove this item?')) set(list.filter((_, j) => j !== i)); }}>
                    <Fields fields={field.fields} value={item} onChange={next => set(list.map((x, j) => (j === i ? next : x)))} />
                  </ItemCard>
                ))}
              </div>
              {list.length < field.limit && (
                <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => set([...list, { ...field.blank }])}><Plus className="h-3.5 w-3.5" /> {field.add}</Button>
              )}
            </div>
          );
        }
      }
    })}
  </div>
);

// ---------- Previews (the text as it reads on the website, roughly) ----------

const Preview: React.FC<{ blockKey: BlockKey; data: Value }> = ({ blockKey, data }) => {
  const d = data as never;
  switch (blockKey) {
    case 'hero': {
      const h = d as Blocks['hero'];
      return (
        <div>
          {h.badge && <span className="inline-block rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] text-slate-300">{h.badge}</span>}
          <h2 className="mt-3 text-2xl font-bold leading-tight text-white">
            {h.headlineStart} <span className="gradient-text">{h.rotating[0] ?? ''}</span> {h.headlineEnd}
          </h2>
          {h.rotating.length > 1 && <p className="mt-1 text-[11px] text-slate-500">Then: {h.rotating.slice(1).join(' · ')}</p>}
          <p className="mt-3 text-sm text-slate-400">{h.subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">{h.primaryLabel}</span>
            <span className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200">{h.secondaryLabel}</span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {h.points.map((p, i) => <li key={i} className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400" /> {p}</li>)}
          </ul>
          <div className="mt-5 rounded-lg bg-white p-3">
            <div className="text-[11px] text-emerald-700">Search result</div>
            <div className="truncate text-sm text-blue-700">{h.seoTitle}</div>
            <div className="line-clamp-2 text-xs text-slate-600">{h.seoDescription}</div>
          </div>
        </div>
      );
    }
    case 'highlights':
      return (
        <div className="grid grid-cols-2 gap-2">
          {(d as Blocks['highlights']).items.map((item, i) => {
            const Icon = iconFor(item.icon);
            return (
              <div key={i} className="rounded-xl border border-slate-800 p-3">
                <Icon className="h-4 w-4 text-blue-400" />
                <div className="mt-1.5 font-bold text-white">{item.value}</div>
                <div className="text-[11px] text-slate-400">{item.label}</div>
              </div>
            );
          })}
        </div>
      );
    case 'useCases': {
      const u = d as Blocks['useCases'];
      return (
        <div>
          <h2 className="text-lg font-bold text-white">{u.title}</h2>
          <p className="mt-1 text-xs text-slate-400">{u.subtitle}</p>
          <div className="mt-3 space-y-2">
            {u.items.map((item, i) => {
              const Icon = iconFor(item.icon);
              return (
                <div key={i} className="rounded-xl border border-slate-800 p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-blue-300" />
                    <span className="rounded-full border border-slate-700 px-1.5 text-[9px] uppercase tracking-wider text-slate-400">Example</span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-slate-100">{item.title}</div>
                  <p className="mt-1 text-xs text-slate-400">{item.story}</p>
                  {item.points.length > 0 && <p className="mt-1.5 text-[11px] text-slate-300">✓ {item.points.join(' ✓ ')}</p>}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case 'testimonials': {
      const t = d as Blocks['testimonials'];
      const shown = t.items.filter(x => x.published && x.permission);
      if (!shown.length) return <p className="text-sm text-slate-400">Nothing is shown on the website: no testimonial is published with permission yet.</p>;
      return (
        <div>
          <h2 className="text-lg font-bold text-white">{t.title}</h2>
          <div className="mt-3 space-y-2">
            {shown.map((item, i) => (
              <div key={i} className="rounded-xl border border-slate-800 p-3">
                <Quote className="h-4 w-4 text-violet-300" />
                <p className="mt-1 text-xs text-slate-300">{item.quote}</p>
                <p className="mt-2 text-xs font-medium text-slate-100">{item.name}{item.role && <span className="font-normal text-slate-500"> · {item.role}</span>}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'faq':
      return (
        <div className="space-y-2">
          {(d as Blocks['faq']).items.map((item, i) => (
            <div key={i} className="rounded-lg border border-slate-800 px-3 py-2">
              <div className="text-sm font-medium text-slate-100">{item.q}</div>
              <p className="mt-1 text-xs text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      );
    case 'announcement': {
      const a = d as Blocks['announcement'];
      if (!a.enabled || !a.text) return <p className="text-sm text-slate-400">The strip is off.</p>;
      return (
        <div className="rounded-lg border border-violet-500/25 bg-gradient-to-r from-blue-600/15 via-violet-600/15 to-blue-600/15 px-3 py-2 text-sm text-slate-100">
          {a.text} {a.linkLabel && a.linkUrl && <span className="font-medium text-blue-300">{a.linkLabel} →</span>}
        </div>
      );
    }
    case 'footer':
      return <p className="text-xs text-slate-400">{(d as Blocks['footer']).tagline}</p>;
    case 'colleges': {
      const c = d as Blocks['colleges'];
      return (
        <div className="text-center">
          {c.badge && <span className="inline-block rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] text-slate-300">{c.badge}</span>}
          <h2 className="mt-3 text-2xl font-bold text-white">{c.headline} <span className="gradient-text">{c.highlight}</span></h2>
          <p className="mt-2 text-sm text-slate-400">{c.subtitle}</p>
          <span className="mt-3 inline-block rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">{c.button}</span>
        </div>
      );
    }
  }
};

// ---------- The page ----------

interface AdminBlock {
  key: BlockKey;
  data: Value;
  defaults: Value;
  custom: boolean;
  updatedAt: string | null;
}

export const AdminWebsiteContent: React.FC = () => {
  const [blocks, setBlocks] = useState<AdminBlock[] | null>(null);
  const [selected, setSelected] = useState<BlockKey>('hero');
  const [draft, setDraft] = useState<Value | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ blocks: AdminBlock[] }>('/admin/site-blocks').then(r => setBlocks(r.blocks), e => setError(e.message));
  }, []);

  const block = blocks?.find(b => b.key === selected);
  const spec = BLOCKS.find(b => b.key === selected)!;
  const value = draft ?? block?.data ?? (DEFAULT_BLOCKS[selected] as unknown as Value);
  const changed = !!draft && JSON.stringify(draft) !== JSON.stringify(block?.data);

  const choose = (key: BlockKey) => {
    if (key === selected) return;
    if (changed && !window.confirm('Leave without saving your changes?')) return;
    setSelected(key);
    setDraft(null);
    setError('');
    setSaved(false);
  };

  const apply = (next: AdminBlock) => {
    setBlocks(list => list?.map(b => (b.key === next.key ? next : b)) ?? null);
    setBlock(next.key, next.data as never); // The website shows it at once in this browser
    setDraft(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      apply((await api<{ block: AdminBlock }>(`/admin/site-blocks/${selected}`, { method: 'PUT', body: { data: value } })).block);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Go back to the original text for this block? Your changes to it are lost.')) return;
    setBusy(true);
    setError('');
    try {
      apply((await api<{ block: AdminBlock }>(`/admin/site-blocks/${selected}`, { method: 'DELETE' })).block);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminTitle title="Website content" />
      <p className="mb-5 text-sm text-slate-400">
        Change the website’s text without a new release. Changes show for visitors within a minute. Until a block is saved, the website
        shows its original text, and “Reset to default” brings it back.
      </p>
      <ErrorText>{!blocks ? error : ''}</ErrorText>
      {blocks && (
        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Blocks">
            {BLOCKS.map(b => {
              const info = blocks.find(x => x.key === b.key);
              return (
                <button key={b.key} onClick={() => choose(b.key)}
                  className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${b.key === selected ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}>
                  {b.title}
                  {info?.custom && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" title="Edited" />}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{spec.title}</h2>
              {block?.custom ? <Badge tone="blue">Edited {block.updatedAt ? date(block.updatedAt) : ''}</Badge> : <Badge>Original text</Badge>}
              <a href={spec.link} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                {spec.where} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {spec.intro && (
              <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100/90">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p>{spec.intro}</p>
              </div>
            )}
            <div className="grid items-start gap-5 xl:grid-cols-[1fr_340px]">
              <Card>
                <Fields key={selected} fields={spec.fields} value={value} onChange={setDraft} />
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                  <Button variant="primary" onClick={save} loading={busy} disabled={!changed}>Save</Button>
                  {changed && <Button variant="ghost" onClick={() => setDraft(null)}>Undo changes</Button>}
                  {saved && <span className="flex items-center gap-1 text-sm text-emerald-300"><Check className="h-4 w-4" /> Saved</span>}
                  <Button variant="ghost" className="ml-auto" onClick={reset} disabled={busy || (!block?.custom && !changed)}><RotateCcw className="h-4 w-4" /> Reset to default</Button>
                </div>
                <div className="mt-2"><ErrorText>{error}</ErrorText></div>
              </Card>
              <div className="xl:sticky xl:top-20">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</div>
                <Card className="bg-slate-950/60"><Preview blockKey={selected} data={value} /></Card>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
