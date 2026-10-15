import React, { useCallback, useEffect, useState } from 'react';
import { api, rupees, type Payment } from '../../api';
import { PaymentTable } from '../../components/PaymentTable';
import { Button, ErrorText } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

// Approve or reject an offline payment the user reported
export const ReviewButtons: React.FC<{ payment: Payment; onDone: () => void }> = ({ payment, onDone }) => {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  if (payment.status !== 'PENDING') return null;

  const act = async (action: 'approve' | 'reject') => {
    let note: string | null = '';
    if (action === 'approve' && !window.confirm(`Confirm you received ${rupees(payment.amountPaise)} (ref. ${payment.reference}) from ${payment.user?.email}? The plan starts right away.`)) return;
    if (action === 'reject') {
      note = window.prompt('Why? (shown to the user)', 'Payment not received');
      if (note === null) return;
    }
    setBusy(action);
    try {
      await api(`/admin/payments/${payment.id}/${action}`, { body: action === 'reject' ? { note } : {} });
      onDone();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="inline-flex gap-1.5">
      <Button size="sm" variant="primary" loading={busy === 'approve'} onClick={() => act('approve')}>Approve</Button>
      <Button size="sm" variant="ghost" loading={busy === 'reject'} onClick={() => act('reject')}>Reject</Button>
    </span>
  );
};

const FILTERS = [
  { id: 'PENDING', label: 'Waiting' },
  { id: 'PAID', label: 'Paid' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: '', label: 'All' },
] as const;

export const AdminPayments: React.FC = () => {
  const [status, setStatus] = useState<(typeof FILTERS)[number]['id']>('PENDING');
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ payments: Payment[] }>(`/admin/payments${status ? `?status=${status}` : ''}`).then(r => setPayments(r.payments), e => setError(e.message));
  }, [status]);
  useEffect(load, [load]);

  const total = payments?.filter(p => p.status === 'PAID').reduce((sum, p) => sum + p.amountPaise, 0) ?? 0;

  return (
    <>
      <AdminTitle title="Payments">
        <div className="flex rounded-lg border border-slate-700 p-0.5">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setStatus(f.id)}
              className={`rounded-md px-3 py-1 text-sm ${status === f.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </AdminTitle>
      <ErrorText>{error}</ErrorText>
      {status === 'PENDING' && (
        <p className="mb-4 text-sm text-slate-400">
          Check each reference against your UPI or bank statement before approving. Got paid some other way (cash, a direct transfer)?
          Open the user under Users and use <strong className="text-slate-200">Record a payment</strong>.
        </p>
      )}
      {payments && <PaymentTable payments={payments} showUser admin actions={p => <ReviewButtons payment={p} onDone={load} />} />}
      {payments && total > 0 && <p className="mt-3 text-right text-sm text-slate-400">Paid in this list: <strong className="text-slate-200">{rupees(total)}</strong></p>}
    </>
  );
};
