import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, rupees, tokens, type Payment } from '../../api';
import { PaymentTable } from '../../components/PaymentTable';
import { Card, ErrorText } from '../../components/ui';
import { AdminTitle } from './AdminLayout';
import { ReviewButtons } from './Payments';

interface Stats {
  setup: { ai: boolean; razorpay: boolean; offlinePayment: boolean; supportEmail: boolean };
  users: number;
  newUsers7d: number;
  usersWithPlan: number;
  payingUsers: number;
  pendingPayments: number;
  revenuePaise30d: number;
  tokens30d: number;
  audioMinutes30d: number;
}

const Stat: React.FC<{ label: string; value: string | number; hint?: string; to?: string }> = ({ label, value, hint, to }) => {
  const body = (
    <Card className={to ? 'transition-colors hover:border-slate-600' : ''}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<Payment[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats, e => setError(e.message));
    api<{ payments: Payment[] }>('/admin/payments?status=PENDING').then(r => setPending(r.payments), () => {});
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <AdminTitle title="Dashboard" />
      <ErrorText>{error}</ErrorText>
      {stats && Object.values(stats.setup).some(done => !done) && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
          <strong>Finish setting up</strong> in <Link to="/admin/settings" className="underline">Settings</Link>:
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {!stats.setup.ai && <li>Add a Groq or OpenAI key. Without one, the app can't answer anything.</li>}
            {!stats.setup.razorpay && <li>Add Razorpay keys to take online payments (optional: offline payment works without them).</li>}
            {!stats.setup.offlinePayment && <li>Add your UPI / bank details for offline payments.</li>}
            {!stats.setup.supportEmail && <li>Add a support email (shown on the contact and legal pages).</li>}
          </ul>
        </div>
      )}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Revenue (30 days)" value={rupees(stats.revenuePaise30d)} />
          <Stat label="Users" value={stats.users} hint={`${stats.newUsers7d} new this week`} to="/admin/users" />
          <Stat label="With an active plan" value={stats.usersWithPlan} hint={`${stats.payingUsers} paying, ${stats.usersWithPlan - stats.payingUsers} on trial or given`} />
          <Stat label="Waiting for approval" value={stats.pendingPayments} hint="Offline payments" to="/admin/payments" />
          <Stat label="Listening (30 days)" value={`${stats.audioMinutes30d.toLocaleString('en-IN')} min`} />
          <Stat label="AI tokens (30 days)" value={tokens(stats.tokens30d)} />
        </div>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold text-slate-100">Offline payments to check</h2>
      {pending.length === 0
        ? <p className="text-sm text-slate-500">Nothing waiting.</p>
        : <PaymentTable payments={pending} showUser actions={p => <ReviewButtons payment={p} onDone={load} />} />}
    </>
  );
};
