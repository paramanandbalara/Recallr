import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Download, Gift } from 'lucide-react';
import { api, date, hours, tokens, type Payment } from '../../api';
import { useAuth } from '../../auth';
import { AccountPage } from '../../components/AccountNav';
import { PaymentTable } from '../../components/PaymentTable';
import { Badge, Card } from '../../components/ui';

const SOURCE_LABEL = { TRIAL: 'Free trial', RAZORPAY: 'Paid online', OFFLINE: 'Paid offline', ADMIN_GRANT: 'Given by Recallr', REFERRAL: 'Invite bonus', COUPON: 'With a code' } as const;

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Card>
    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </Card>
);

export const AccountOverview: React.FC = () => {
  const { user, allowance, refresh } = useAuth();
  const [params] = useSearchParams();
  const [payments, setPayments] = useState<Payment[] | null>(null);

  useEffect(() => {
    refresh();
    api<{ payments: Payment[] }>('/billing/payments').then(r => setPayments(r.payments), () => setPayments([]));
  }, [refresh]);

  const pending = payments?.filter(p => p.status === 'PENDING') ?? [];

  return (
    <AccountPage title={`Hi, ${user!.name.split(' ')[0]}`}>
      {params.get('welcome') && (
        <div className="mb-6 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <strong>Your account is ready.</strong>{' '}
            Next: <Link to="/download" className="underline">download the app</Link> and sign in with {user!.email}: your free trial starts then.
            The <Link to="/guide" className="underline">guide</Link> walks you through the rest.
          </div>
        </div>
      )}
      {params.get('reset') && (
        <div className="mb-6 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div><strong>Password changed.</strong> Sign in to the app again with the new one.</div>
        </div>
      )}
      {params.get('paid') && (
        <div className="mb-6 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div><strong>Payment received, your plan is active.</strong> In the app, click “I’ve paid, check again” (or restart it).</div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <strong>{pending.length === 1 ? 'Your offline payment is' : `${pending.length} offline payments are`} waiting for confirmation.</strong>{' '}
            We check payments within a few hours; the plan starts as soon as it’s confirmed.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Your plan</h2>
        {allowance?.active ? (allowance.onTrial ? <Badge tone="green">Free trial</Badge> : <Badge tone="blue">Active</Badge>) : <Badge tone="red">No active plan</Badge>}
      </div>

      {allowance?.active ? (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Stat label="Listening left" value={hours(allowance.minutesLeft)} />
            <Stat label="AI tokens left" value={tokens(allowance.tokensLeft)} hint="A typical answer uses 1,500–3,000" />
            <Stat label="Valid until" value={date(allowance.expiresAt)} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-900 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Pack</th>
                  <th className="px-3 py-2 font-medium">Listening left</th>
                  <th className="px-3 py-2 font-medium">Tokens left</th>
                  <th className="px-3 py-2 font-medium">Ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {allowance.packs.map(pack => (
                  <tr key={pack.id}>
                    <td className="px-3 py-2"><div className="text-slate-200">{pack.planName}</div><div className="text-xs text-slate-500">{SOURCE_LABEL[pack.source]}</div></td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{hours(pack.minutesLeft)}{pack.listeningMinutes !== null && <span className="text-slate-500"> of {hours(pack.listeningMinutes)}</span>}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{tokens(pack.tokensLeft)}</td>
                    <td className="px-3 py-2 text-slate-300">{date(pack.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/account/buy" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
              {allowance.onTrial ? 'Upgrade to a full plan' : 'Buy a top-up'}
            </Link>
            <Link to="/download" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
              <Download className="h-4 w-4" /> Download the app
            </Link>
          </div>
        </>
      ) : (
        <Card className="mt-4">
          <p className="text-sm text-slate-300">
            You don’t have an active plan. New here? Your free trial starts when you first sign in to the <Link to="/download" className="text-blue-400">app</Link> (one per computer).
            Otherwise, buy a plan to keep using Recallr.
          </p>
          <Link to="/account/buy" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">See plans</Link>
        </Card>
      )}

      <h2 className="mt-10 text-lg font-semibold text-slate-100">Payments</h2>
      <div className="mt-4">{payments && <PaymentTable payments={payments} />}</div>
    </AccountPage>
  );
};
