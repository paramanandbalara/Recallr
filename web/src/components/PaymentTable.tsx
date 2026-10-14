import React from 'react';
import { date, rupees, type Payment } from '../api';
import { Badge } from './ui';

const STATUS: Record<Payment['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  PAID: { label: 'Paid', tone: 'green' },
  PENDING: { label: 'Waiting for confirmation', tone: 'amber' },
  REJECTED: { label: 'Not confirmed', tone: 'red' },
  FAILED: { label: 'Failed', tone: 'red' },
  CREATED: { label: 'Not completed', tone: 'slate' },
};

export const PaymentStatus: React.FC<{ status: Payment['status'] }> = ({ status }) => (
  <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
);

// Payments as a table; `actions` adds buttons per row (admin), `showUser` the payer
export const PaymentTable: React.FC<{ payments: Payment[]; showUser?: boolean; actions?: (payment: Payment) => React.ReactNode }> = ({
  payments, showUser, actions,
}) => (
  <div className="overflow-x-auto rounded-xl border border-slate-800">
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead className="bg-slate-900 text-xs text-slate-400">
        <tr>
          <th className="px-3 py-2 font-medium">Date</th>
          {showUser && <th className="px-3 py-2 font-medium">User</th>}
          <th className="px-3 py-2 font-medium">Plan</th>
          <th className="px-3 py-2 font-medium">Amount</th>
          <th className="px-3 py-2 font-medium">Method</th>
          <th className="px-3 py-2 font-medium">Reference</th>
          <th className="px-3 py-2 font-medium">Status</th>
          {actions && <th className="px-3 py-2" />}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {payments.map(p => (
          <tr key={p.id} className="align-top">
            <td className="whitespace-nowrap px-3 py-2 text-slate-300">{date(p.createdAt)}</td>
            {showUser && <td className="px-3 py-2"><div className="text-slate-200">{p.user?.name}</div><div className="text-xs text-slate-500">{p.user?.email}</div></td>}
            <td className="px-3 py-2 text-slate-200">{p.plan.name}</td>
            <td className="px-3 py-2 tabular-nums text-slate-200">{rupees(p.amountPaise)}</td>
            <td className="px-3 py-2 text-slate-400">{p.method === 'RAZORPAY' ? 'Online' : 'Offline'}</td>
            <td className="max-w-[200px] px-3 py-2 text-xs text-slate-400">
              {p.reference || '–'}
              {p.note && <div className="mt-0.5 text-slate-500">{p.note}</div>}
            </td>
            <td className="px-3 py-2"><PaymentStatus status={p.status} /></td>
            {actions && <td className="whitespace-nowrap px-3 py-2 text-right">{actions(p)}</td>}
          </tr>
        ))}
        {payments.length === 0 && (
          <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No payments yet.</td></tr>
        )}
      </tbody>
    </table>
  </div>
);
