import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import { api, date, downloadFile, rupees } from '../../api';
import { Badge, Button, ErrorText, Input, Select } from '../../components/ui';
import type { Invoice } from '../../gst';
import { InvoiceActions } from '../account/Billing';
import { AdminTitle } from './AdminLayout';

interface InvoiceList {
  invoices: Invoice[];
  count: number;
  totals: { totalPaise: number | null; taxablePaise: number | null; cgstPaise: number | null; sgstPaise: number | null; igstPaise: number | null };
  financialYears: string[];
}

// Every invoice, with filters, and the spreadsheet for the accountant
export const AdminInvoices: React.FC = () => {
  const [search, setSearch] = useState('');
  const [fy, setFy] = useState('');
  const [kind, setKind] = useState('');
  const [data, setData] = useState<InvoiceList | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const query = new URLSearchParams({ ...(search.trim() ? { search: search.trim() } : {}), ...(fy ? { fy } : {}), ...(kind ? { kind } : {}) }).toString();
  const load = useCallback(() => {
    api<InvoiceList>(`/admin/invoices${query ? `?${query}` : ''}`).then(setData, e => setError(e.message));
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(load, 250); // Wait for typing to stop
    return () => clearTimeout(timer);
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile(`/admin/invoices.csv${query ? `?${query}` : ''}`, `recallr-invoices-${fy || 'all'}.csv`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const t = data?.totals;
  return (
    <>
      <AdminTitle title="Invoices">
        <Button variant="secondary" loading={exporting} onClick={exportCsv}><FileSpreadsheet className="h-4 w-4" /> Export CSV</Button>
      </AdminTitle>
      <p className="mb-4 text-sm text-slate-400">
        One invoice per paid payment, numbered without gaps for each financial year. The seller details, GSTIN and GST rate are set in{' '}
        <Link to="/admin/settings" className="text-blue-400">Settings → Invoices</Link>; changes apply to new invoices only.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Number, name, email or GSTIN" className="max-w-xs" />
        <Select value={fy} onChange={e => setFy(e.target.value)} className="w-auto">
          <option value="">All financial years</option>
          {data?.financialYears.map(y => <option key={y} value={y}>FY {y}</option>)}
        </Select>
        <Select value={kind} onChange={e => setKind(e.target.value)} className="w-auto">
          <option value="">Tax invoices and bills</option>
          <option value="TAX_INVOICE">Tax invoices</option>
          <option value="BILL">Bills (no GST)</option>
        </Select>
      </div>
      <ErrorText>{error}</ErrorText>
      {t && (
        <div className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
          {[['Invoices', String(data.count)], ['Total', rupees(t.totalPaise ?? 0)], ['Taxable value', rupees(t.taxablePaise ?? 0)],
            ['GST', rupees((t.cgstPaise ?? 0) + (t.sgstPaise ?? 0) + (t.igstPaise ?? 0))]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-100">{value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Taxable</th>
              <th className="px-3 py-2 font-medium">GST</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data?.invoices.map(i => (
              <tr key={i.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="font-medium text-slate-200">{i.number}</div>
                  <Badge tone={i.kind === 'TAX_INVOICE' ? 'blue' : 'slate'}>{i.kind === 'TAX_INVOICE' ? 'Tax invoice' : 'Bill'}</Badge>
                  {!i.emailedAt && <span className="ml-1"><Badge tone="amber">Not emailed</Badge></span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-300">{date(i.issuedAt)}</td>
                <td className="px-3 py-2">
                  <Link to={`/admin/users/${i.userId}`} className="text-slate-200 hover:text-white">{i.buyerName}</Link>
                  <div className="text-xs text-slate-500">{i.buyerEmail}</div>
                  {(i.buyerGstin || i.buyerState) && <div className="text-xs text-slate-500">{[i.buyerGstin, i.buyerState].filter(Boolean).join(' · ')}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-300">{rupees(i.taxablePaise)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-400">
                  {i.igstPaise > 0 && <div>IGST {rupees(i.igstPaise)}</div>}
                  {i.cgstPaise + i.sgstPaise > 0 && <div>CGST {rupees(i.cgstPaise)}<br />SGST {rupees(i.sgstPaise)}</div>}
                  {i.kind === 'BILL' && '–'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">{rupees(i.totalPaise)}</td>
                <td className="px-3 py-2 text-right"><InvoiceActions invoice={i} admin compact /></td>
              </tr>
            ))}
            {data?.invoices.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No invoices.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.count > data.invoices.length && (
        <p className="mt-3 text-sm text-slate-500">Showing the latest {data.invoices.length} of {data.count}. Narrow the search, or export the CSV for all of them.</p>
      )}
    </>
  );
};
