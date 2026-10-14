import React, { useCallback, useEffect, useState } from 'react';
import { api, rupees } from '../../api';
import { Badge, Button, ErrorText, Select } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

interface Entry {
  id: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  actor: { email: string; name: string } | null;
}

const ACTIONS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'slate' }> = {
  'payment.approve': { label: 'Approved payment', tone: 'green' },
  'payment.reject': { label: 'Rejected payment', tone: 'red' },
  'payment.record': { label: 'Recorded payment', tone: 'green' },
  'user.block': { label: 'Blocked user', tone: 'red' },
  'user.unblock': { label: 'Unblocked user', tone: 'blue' },
  'user.make_admin': { label: 'Made admin', tone: 'amber' },
  'user.remove_admin': { label: 'Removed admin', tone: 'amber' },
  'user.grant_plan': { label: 'Gave plan', tone: 'blue' },
  'user.reset_password': { label: 'Reset password', tone: 'amber' },
  'pack.edit': { label: 'Edited pack', tone: 'blue' },
  'plan.create': { label: 'Created plan', tone: 'blue' },
  'plan.update': { label: 'Changed plan', tone: 'blue' },
  'settings.update': { label: 'Changed settings', tone: 'amber' },
};

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'payment.', label: 'Payments' },
  { value: 'user.', label: 'Users' },
  { value: 'plan.', label: 'Plans' },
  { value: 'pack.', label: 'Packs' },
  { value: 'settings.', label: 'Settings' },
];

// A short, readable line from the details
const describe = (entry: Entry) => {
  const d = entry.details ?? {};
  const parts: string[] = [];
  if (Array.isArray(d.changed)) parts.push(`Changed: ${(d.changed as string[]).join(', ')}`);
  if (typeof d.plan === 'string') parts.push(d.plan);
  if (typeof d.pack === 'string') parts.push(d.pack);
  if (typeof d.amountPaise === 'number') parts.push(rupees(d.amountPaise));
  if (typeof d.reference === 'string' && d.reference) parts.push(`ref. ${d.reference}`);
  if (typeof d.note === 'string' && d.note) parts.push(`“${d.note}”`);
  if (entry.action === 'plan.update' || entry.action === 'pack.edit') {
    const shown = Object.entries(d).filter(([key]) => !['pack', 'plan'].includes(key));
    if (shown.length) parts.push(shown.map(([key, value]) => `${key}: ${value === null ? 'unlimited' : String(value)}`).join(', '));
  }
  return parts.join(' · ');
};

export const AdminActivity: React.FC = () => {
  const [filter, setFilter] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (before?: string) => {
    try {
      const params = new URLSearchParams({ ...(filter ? { action: filter } : {}), ...(before ? { before } : {}) });
      const r = await api<{ entries: Entry[] }>(`/admin/audit?${params}`);
      setEntries(prev => (before ? [...prev, ...r.entries] : r.entries));
      setMore(r.entries.length === 100);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <AdminTitle title="Activity">
        <Select value={filter} onChange={e => setFilter(e.target.value)} className="w-44">
          {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
      </AdminTitle>
      <p className="mb-4 text-sm text-slate-400">Everything admins did, newest first. Secret values are never recorded.</p>
      <ErrorText>{error}</ErrorText>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">What</th>
              <th className="px-3 py-2 font-medium">For</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {entries.map(e => {
              const action = ACTIONS[e.action] ?? { label: e.action, tone: 'slate' as const };
              return (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{new Date(e.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2 text-slate-300">{e.actor?.email ?? 'Deleted user'}</td>
                  <td className="px-3 py-2"><Badge tone={action.tone}>{action.label}</Badge></td>
                  <td className="px-3 py-2 text-slate-300">{e.target ?? '–'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{describe(e)}</td>
                </tr>
              );
            })}
            {entries.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <div className="mt-4 text-center"><Button onClick={() => load(entries[entries.length - 1].id)}>Load more</Button></div>}
    </>
  );
};
