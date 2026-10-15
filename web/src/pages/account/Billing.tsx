import React, { useEffect, useState } from 'react';
import { Download, Mail } from 'lucide-react';
import { api, date, downloadFile, rupees } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Badge, Button, Card, ErrorText, Field, Input, Select, TextArea } from '../../components/ui';
import { gstinError, INDIAN_STATES, invoiceFilename, stateOfGstin, type Invoice } from '../../gst';

interface Details {
  billingName: string;
  billingAddress: string;
  billingState: string;
  gstin: string;
  defaultName?: string;
}

// Download or resend an invoice (the user's own, or any for the admin with `admin`)
export const InvoiceActions: React.FC<{ invoice: Pick<Invoice, 'id' | 'number'>; admin?: boolean; compact?: boolean }> = ({ invoice, admin, compact }) => {
  const [busy, setBusy] = useState<'pdf' | 'email' | null>(null);
  const [message, setMessage] = useState('');
  const base = admin ? '/admin/invoices' : '/invoices';
  const run = async (what: 'pdf' | 'email') => {
    setBusy(what);
    setMessage('');
    try {
      if (what === 'pdf') await downloadFile(`${base}/${invoice.id}/pdf`, invoiceFilename(invoice.number));
      else {
        await api(`${base}/${invoice.id}/email`, { method: 'POST' });
        setMessage('Sent.');
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <Button size="sm" variant="secondary" loading={busy === 'pdf'} onClick={() => run('pdf')} title="Download PDF">
        <Download className="h-3.5 w-3.5" /> {compact ? 'PDF' : 'Download PDF'}
      </Button>
      <Button size="sm" variant="ghost" loading={busy === 'email'} onClick={() => run('email')} title="Email the invoice again">
        <Mail className="h-3.5 w-3.5" /> {compact ? 'Email' : 'Email it again'}
      </Button>
      {message && <span className="w-full text-right text-xs text-slate-400">{message}</span>}
    </span>
  );
};

const BillingDetails: React.FC = () => {
  const [details, setDetails] = useState<Details | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Details>('/invoices/billing-details').then(setDetails, e => setError(e.message));
  }, []);
  if (!details) return <Card><ErrorText>{error}</ErrorText></Card>;

  const set = (changes: Partial<Details>) => { setDetails({ ...details, ...changes }); setSaved(false); };
  const gstin = details.gstin.trim().toUpperCase();
  const gstinProblem = gstin ? gstinError(gstin) : '';
  const registeredIn = gstin && !gstinProblem ? stateOfGstin(gstin) : null;
  const stateProblem = registeredIn && details.billingState && details.billingState !== registeredIn.name
    ? `This GSTIN is registered in ${registeredIn.name}.` : '';

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (gstinProblem || stateProblem) return;
    setSaving(true);
    setError('');
    try {
      setDetails(await api<Details>('/invoices/billing-details', { method: 'PUT', body: { ...details, gstin } }));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="font-semibold text-slate-100">Billing details</h2>
      <p className="mt-1 text-sm text-slate-400">Printed on your future invoices. Invoices already made don’t change.</p>
      <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Name on the invoice" hint={`Your name or your company’s. Empty: ${details.defaultName ?? 'your account name'}.`}>
          <Input value={details.billingName} maxLength={200} placeholder={details.defaultName} onChange={e => set({ billingName: e.target.value })} />
        </Field>
        <Field label="GSTIN (optional)" hint={gstinProblem || (registeredIn ? `Registered in ${registeredIn.name}.` : 'Only for businesses registered for GST.')}>
          <Input value={details.gstin} maxLength={15} placeholder="e.g. 29ABCDE1234F1Z5" className={`uppercase ${gstinProblem ? 'border-red-500' : ''}`}
            onChange={e => {
              const value = e.target.value.toUpperCase();
              const state = !gstinError(value) ? stateOfGstin(value) : null;
              set({ gstin: value, ...(state ? { billingState: state.name } : {}) });
            }} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <TextArea rows={2} value={details.billingAddress} maxLength={500} onChange={e => set({ billingAddress: e.target.value })} />
          </Field>
        </div>
        <Field label="State" hint={stateProblem || 'Decides the GST on your invoice (place of supply).'}>
          <Select value={details.billingState} onChange={e => set({ billingState: e.target.value })} className={stateProblem ? 'border-red-500' : ''}>
            <option value="">Choose your state</option>
            {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-end gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" loading={saving} disabled={!!gstinProblem || !!stateProblem}>Save</Button>
          {saved && <span className="text-sm text-emerald-300">Saved.</span>}
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Card>
  );
};

export const AccountBilling: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ invoices: Invoice[] }>('/invoices').then(r => setInvoices(r.invoices), e => setError(e.message));
  }, []);

  return (
    <AccountPage title="Billing">
      <h2 className="text-lg font-semibold text-slate-100">Invoices</h2>
      <p className="mt-1 text-sm text-slate-400">Every payment gets an invoice, also sent to you by email.</p>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">For</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {invoices?.map(invoice => (
              <tr key={invoice.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="font-medium text-slate-200">{invoice.number}</div>
                  <Badge tone={invoice.kind === 'TAX_INVOICE' ? 'blue' : 'slate'}>{invoice.kind === 'TAX_INVOICE' ? 'Tax invoice' : 'Invoice'}</Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-300">{date(invoice.issuedAt)}</td>
                <td className="px-3 py-2 text-slate-300">{invoice.description}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">
                  {rupees(invoice.totalPaise)}
                  {invoice.kind === 'TAX_INVOICE' && <div className="text-xs text-slate-500">incl. {rupees(invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise)} GST</div>}
                </td>
                <td className="px-3 py-2 text-right"><InvoiceActions invoice={invoice} /></td>
              </tr>
            ))}
            {invoices?.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No invoices yet. They appear here after you pay for a plan.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-10"><BillingDetails /></div>
    </AccountPage>
  );
};
