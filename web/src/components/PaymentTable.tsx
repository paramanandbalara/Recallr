import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { date, downloadFile, rupees, type Payment } from '../api';
import { Badge } from './ui';

// The payment's invoice as a PDF (the admin's copy with `admin`)
const InvoiceLink: React.FC<{ invoice: { id: string; number: string }; admin?: boolean }> = ({ invoice, admin }) => {
  const [busy, setBusy] = useState(false);
  const download = () => {
    setBusy(true);
    downloadFile(`${admin ? '/admin/invoices' : '/invoices'}/${invoice.id}/pdf`, `invoice-${invoice.number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`)
      .catch(err => window.alert((err as Error).message))
      .finally(() => setBusy(false));
  };
  return (
    <button onClick={download} disabled={busy} className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50" title="Download the invoice">
      <FileText className="h-3.5 w-3.5" /> {invoice.number}
    </button>
  );
};

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

// Payments as a table; `actions` adds buttons per row (admin), `showUser` the payer, `admin` the admin's invoice links
export const PaymentTable: React.FC<{ payments: Payment[]; showUser?: boolean; admin?: boolean; actions?: (payment: Payment) => React.ReactNode }> = ({
  payments, showUser, admin, actions,
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
              {p.invoice && <div><InvoiceLink invoice={p.invoice} admin={admin} /></div>}
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
