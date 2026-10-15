import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { answers, api, days, hours, rupees, tokens, type Plan } from '../../api';
import { Badge, Button, Card, ErrorText, Field, Input, TextArea } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

interface Form {
  name: string;
  description: string;
  price: string; // Rupees
  durationDays: string;
  listeningMinutes: string; // Empty = unlimited
  tokenLimit: string;
  active: boolean;
  isTrial: boolean;
  sortOrder: string;
}

const EMPTY: Form = { name: '', description: '', price: '', durationDays: '30', listeningMinutes: '', tokenLimit: '', active: true, isTrial: false, sortOrder: '0' };

const toForm = (p: Plan): Form => ({
  name: p.name, description: p.description, price: String(p.pricePaise / 100), durationDays: String(p.durationDays),
  listeningMinutes: p.listeningMinutes?.toString() ?? '', tokenLimit: p.tokenLimit?.toString() ?? '',
  active: p.active, isTrial: p.isTrial, sortOrder: String(p.sortOrder),
});

const toBody = (f: Form) => ({
  name: f.name, description: f.description,
  pricePaise: f.isTrial ? 0 : Math.round(Number(f.price || 0) * 100),
  durationDays: Number(f.durationDays),
  listeningMinutes: f.listeningMinutes.trim() ? Number(f.listeningMinutes) : null,
  tokenLimit: f.tokenLimit.trim() ? Number(f.tokenLimit) : null,
  active: f.active, isTrial: f.isTrial, sortOrder: Number(f.sortOrder || 0),
});

const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }> = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-2 text-sm">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1" />
    <span><span className="text-slate-200">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
  </label>
);

const PlanForm: React.FC<{ plan: Plan | null; onDone: () => void; onCancel: () => void }> = ({ plan, onDone, onCancel }) => {
  const [form, setForm] = useState<Form>(plan ? toForm(plan) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [field]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(plan ? `/admin/plans/${plan.id}` : '/admin/plans', { method: plan ? 'PATCH' : 'POST', body: toBody(form) });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const minutes = Number(form.listeningMinutes);
  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-slate-100">{plan ? `Edit ${plan.name}` : 'New plan'}</h2>
      <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name"><Input value={form.name} onChange={set('name')} required maxLength={100} /></Field>
        <Field label="Price (₹)"><Input type="number" min={0} step="0.01" value={form.isTrial ? '0' : form.price} onChange={set('price')} disabled={form.isTrial} required /></Field>
        <Field label="Valid for (days)"><Input type="number" min={1} max={3650} value={form.durationDays} onChange={set('durationDays')} required /></Field>
        <Field label="Order on the website" hint="Lower comes first"><Input type="number" value={form.sortOrder} onChange={set('sortOrder')} /></Field>
        <Field label="Listening minutes" hint={form.listeningMinutes ? `= ${hours(minutes)}` : 'Empty = unlimited'}>
          <Input type="number" min={1} value={form.listeningMinutes} onChange={set('listeningMinutes')} placeholder="Unlimited" />
        </Field>
        <Field label="AI tokens" hint={form.tokenLimit ? answers(Number(form.tokenLimit)) : 'Empty = unlimited. About 2,500 per answer'}>
          <Input type="number" min={1} value={form.tokenLimit} onChange={set('tokenLimit')} placeholder="Unlimited" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description (shown on the website)"><TextArea value={form.description} onChange={set('description')} rows={2} maxLength={1000} /></Field>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Check checked={form.active} onChange={active => setForm({ ...form, active })} label="On sale" hint="Shown on the website and can be bought. Turn off to hide it; packs already sold keep working." />
          <Check checked={form.isTrial} onChange={isTrial => setForm({ ...form, isTrial })} label="This is the free trial"
            hint="Given automatically, once, to every new account (while it's on sale). Only one plan can be the trial; it can't be bought." />
        </div>
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={busy}>{plan ? 'Save' : 'Create plan'}</Button>
        </div>
        <div className="sm:col-span-4"><ErrorText>{error}</ErrorText></div>
      </form>
      {plan && <p className="mt-3 text-xs text-slate-500">Changes apply to new purchases only: packs already sold keep the limits they were bought with.</p>}
    </Card>
  );
};

export const AdminPlans: React.FC = () => {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ plans: Plan[] }>('/admin/plans').then(r => setPlans(r.plans), e => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const trial = plans?.find(p => p.isTrial && p.active);

  return (
    <>
      <AdminTitle title="Plans">
        <Button variant="primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New plan</Button>
      </AdminTitle>
      <ErrorText>{error}</ErrorText>
      <p className="mb-4 text-sm text-slate-400">
        {trial
          ? <>New accounts get the <strong className="text-slate-200">{trial.name}</strong>: {hours(trial.listeningMinutes)} of listening and {tokens(trial.tokenLimit)} tokens for {days(trial.durationDays)}.</>
          : <>No free trial is on: new accounts start without a plan. Mark a plan as the free trial to give one.</>}
      </p>

      {editing && (
        <PlanForm key={editing === 'new' ? 'new' : editing.id} plan={editing === 'new' ? null : editing}
          onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Days</th>
              <th className="px-3 py-2 font-medium">Listening</th>
              <th className="px-3 py-2 font-medium">Tokens</th>
              <th className="px-3 py-2 font-medium">Sold</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {plans?.map(p => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <span className="text-slate-100">{p.name}</span>{' '}
                  {p.isTrial && <Badge tone="green">Free trial</Badge>}{' '}
                  {!p.active && <Badge>Hidden</Badge>}
                  {p.description && <div className="max-w-xs truncate text-xs text-slate-500">{p.description}</div>}
                </td>
                <td className="px-3 py-2 tabular-nums text-slate-300">{rupees(p.pricePaise)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-300">{p.durationDays}</td>
                <td className="px-3 py-2 tabular-nums text-slate-300">{hours(p.listeningMinutes)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-300">{tokens(p.tokenLimit)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-300">{p._count?.purchases ?? 0}</td>
                <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
