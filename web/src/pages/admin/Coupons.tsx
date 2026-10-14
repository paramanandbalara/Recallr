import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, date, rupees, type Plan } from '../../api';
import { Badge, Button, Card, ErrorText, Field, Input, Select } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

interface Coupon {
  id: string;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  amount: number; // Percent, or paise
  maxUses: number | null;
  usedCount: number;
  onePerUser: boolean;
  planIds: string[] | null;
  expiresAt: string | null;
  active: boolean;
  note: string;
  revenuePaise: number;
  discountGivenPaise: number;
}

const off = (c: Pick<Coupon, 'kind' | 'amount'>) => (c.kind === 'PERCENT' ? `${c.amount}% off` : `${rupees(c.amount)} off`);

const CouponForm: React.FC<{ plans: Plan[]; onDone: () => void; onCancel: () => void }> = ({ plans, onDone, onCancel }) => {
  const [form, setForm] = useState({ code: '', kind: 'PERCENT' as Coupon['kind'], amount: '20', maxUses: '', onePerUser: true, expiresAt: '', note: '', planIds: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/coupons', {
        body: {
          code: form.code, kind: form.kind, note: form.note, onePerUser: form.onePerUser,
          amount: form.kind === 'PERCENT' ? Number(form.amount) : Math.round(Number(form.amount) * 100),
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
          planIds: form.planIds.length ? form.planIds : null,
        },
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const togglePlan = (id: string) => setForm({ ...form, planIds: form.planIds.includes(id) ? form.planIds.filter(p => p !== id) : [...form.planIds, id] });

  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-slate-100">New coupon</h2>
      <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Code" hint="Letters and numbers; people can type it in any case."><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LAUNCH20" required /></Field>
        <Field label="Discount">
          <div className="flex gap-2">
            <Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as Coupon['kind'] })} className="w-24">
              <option value="PERCENT">%</option>
              <option value="FIXED">₹</option>
            </Select>
            <Input type="number" min={1} max={form.kind === 'PERCENT' ? 100 : undefined} step={form.kind === 'PERCENT' ? 1 : '0.01'} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
          </div>
        </Field>
        <Field label="Total uses" hint="Empty = no limit"><Input type="number" min={1} value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} placeholder="No limit" /></Field>
        <Field label="Valid until" hint="Empty = no end"><Input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-300">Works for</span>
          <div className="flex flex-wrap gap-2">
            {plans.filter(p => !p.isTrial).map(p => (
              <label key={p.id} className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs ${form.planIds.includes(p.id) ? 'border-blue-500 bg-blue-500/10 text-blue-100' : 'border-slate-700 text-slate-300'}`}>
                <input type="checkbox" className="sr-only" checked={form.planIds.includes(p.id)} onChange={() => togglePlan(p.id)} /> {p.name}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">{form.planIds.length ? 'Only the plans picked.' : 'Every plan (pick some to limit it).'}</span>
        </div>
        <Field label="Note (only you see it)"><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="e.g. Instagram campaign" /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.onePerUser} onChange={e => setForm({ ...form, onePerUser: e.target.checked })} /> Once per person
        </label>
        <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={busy}>Create coupon</Button>
        </div>
        <div className="sm:col-span-4"><ErrorText>{error}</ErrorText></div>
      </form>
    </Card>
  );
};

export const AdminCoupons: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ coupons: Coupon[] }>('/admin/coupons').then(r => setCoupons(r.coupons), e => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    api<{ plans: Plan[] }>('/admin/plans').then(r => setPlans(r.plans), () => {});
  }, [load]);

  const toggle = async (c: Coupon) => {
    await api(`/admin/coupons/${c.id}`, { method: 'PATCH', body: { active: !c.active } }).catch(e => setError(e.message));
    load();
  };

  const planNames = (ids: string[] | null) => (ids ? ids.map(id => plans.find(p => p.id === id)?.name ?? '?').join(', ') : 'All plans');

  return (
    <>
      <AdminTitle title="Coupons">
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New coupon</Button>
      </AdminTitle>
      <p className="mb-4 text-sm text-slate-400">Codes people enter on the Buy page. A use is counted once the payment is paid. A 100% code gives the plan without any payment.</p>
      <ErrorText>{error}</ErrorText>
      {creating && <CouponForm plans={plans} onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Discount</th>
              <th className="px-3 py-2 font-medium">For</th>
              <th className="px-3 py-2 font-medium">Used</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
              <th className="px-3 py-2 font-medium">Ends</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {coupons?.map(c => {
              const ended = !!c.expiresAt && new Date(c.expiresAt) < new Date();
              const usedUp = c.maxUses !== null && c.usedCount >= c.maxUses;
              return (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <span className="font-mono text-slate-100">{c.code}</span>{' '}
                    {!c.active ? <Badge>Off</Badge> : ended ? <Badge>Ended</Badge> : usedUp ? <Badge tone="amber">Used up</Badge> : <Badge tone="green">Live</Badge>}
                    {c.note && <div className="text-xs text-slate-500">{c.note}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{off(c)}{c.onePerUser && <div className="text-xs text-slate-500">once per person</div>}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{planNames(c.planIds)}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">{c.usedCount}{c.maxUses !== null && ` / ${c.maxUses}`}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">{rupees(c.revenuePaise)}<div className="text-xs text-slate-500">{rupees(c.discountGivenPaise)} given off</div></td>
                  <td className="px-3 py-2 text-slate-400">{date(c.expiresAt)}</td>
                  <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => toggle(c)}>{c.active ? 'Turn off' : 'Turn on'}</Button></td>
                </tr>
              );
            })}
            {coupons?.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No coupons yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
};
