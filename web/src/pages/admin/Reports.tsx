import React, { useEffect, useState } from 'react';
import { api, rupees } from '../../api';
import { Chart, Legend, type Series } from '../../components/Charts';
import { Button, Card, ErrorText } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

interface Report {
  days: number;
  series: { day: string; signups: number; revenuePaise: number; activeUsers: number; aiCostPaise: number }[];
  plans: { planName: string; revenuePaise: number; sold: number; aiCostPaise: number }[];
  usdToInr: number;
}

const RANGES = [7, 30, 90, 365];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const inr = (paise: number) => rupees(Math.round(paise / 100) * 100);
const count = (n: number) => Math.round(n).toLocaleString('en-IN');

const Tile: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Card>
    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </Card>
);

export const AdminReports: React.FC = () => {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [table, setTable] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Report>(`/admin/reports?days=${days}`).then(setReport, e => setError(e.message));
  }, [days]);

  const s = report?.series ?? [];
  const labels = s.map(d => d.day);
  const money: Series[] = [
    { name: 'Revenue', values: s.map(d => d.revenuePaise) },
    { name: 'AI cost (estimate)', values: s.map(d => d.aiCostPaise) },
  ];
  const revenue = sum(s.map(d => d.revenuePaise));
  const cost = sum(s.map(d => d.aiCostPaise));

  return (
    <>
      <AdminTitle title="Reports">
        <div className="flex rounded-lg border border-slate-700 p-0.5">
          {RANGES.map(r => (
            <button key={r} onClick={() => setDays(r)}
              className={`rounded-md px-3 py-1 text-sm ${days === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {r === 365 ? '1 year' : `${r} days`}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setTable(!table)}>{table ? 'Show charts' : 'Show as table'}</Button>
      </AdminTitle>
      <ErrorText>{error}</ErrorText>

      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Revenue" value={inr(revenue)} />
            <Tile label="AI cost (estimate)" value={inr(cost)} hint={revenue ? `${((cost / revenue) * 100).toFixed(1)}% of revenue` : undefined} />
            <Tile label="Gross margin" value={inr(revenue - cost)} hint="Revenue minus AI cost, before fees and taxes" />
            <Tile label="New sign-ups" value={count(sum(s.map(d => d.signups)))} />
          </div>

          {table ? (
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-900 text-xs text-slate-400">
                  <tr><th className="px-3 py-2">Day</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">AI cost</th><th className="px-3 py-2">Sign-ups</th><th className="px-3 py-2">Active users</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800 tabular-nums text-slate-300">
                  {[...s].reverse().map(d => (
                    <tr key={d.day}><td className="px-3 py-1.5">{d.day}</td><td className="px-3 py-1.5">{rupees(d.revenuePaise)}</td><td className="px-3 py-1.5">{rupees(d.aiCostPaise)}</td><td className="px-3 py-1.5">{d.signups}</td><td className="px-3 py-1.5">{d.activeUsers}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card className="lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-slate-100">Revenue and AI cost per day</h2>
                  <Legend series={money} />
                </div>
                <Chart kind="line" labels={labels} series={money} format={inr} height={220} />
              </Card>
              <Card>
                <h2 className="mb-3 font-semibold text-slate-100">New sign-ups per day</h2>
                <Chart kind="bar" labels={labels} series={[{ name: 'sign-ups', values: s.map(d => d.signups) }]} format={count} />
              </Card>
              <Card>
                <h2 className="mb-3 font-semibold text-slate-100">People using the app per day</h2>
                <Chart kind="bar" labels={labels} series={[{ name: 'active users', values: s.map(d => d.activeUsers) }]} format={count} />
              </Card>
            </div>
          )}

          <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">By plan</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-900 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Sold</th>
                  <th className="px-3 py-2 font-medium">Revenue</th>
                  <th className="px-3 py-2 font-medium">AI cost (estimate)</th>
                  <th className="px-3 py-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 tabular-nums text-slate-300">
                {report.plans.map(p => {
                  const margin = p.revenuePaise - p.aiCostPaise;
                  return (
                    <tr key={p.planName}>
                      <td className="px-3 py-2 text-slate-100">{p.planName}</td>
                      <td className="px-3 py-2">{p.sold}</td>
                      <td className="px-3 py-2">{rupees(p.revenuePaise)}</td>
                      <td className="px-3 py-2">{rupees(p.aiCostPaise)}</td>
                      <td className={`px-3 py-2 ${margin < 0 ? 'text-red-300' : ''}`}>{rupees(margin)}{p.revenuePaise > 0 && <span className="text-xs text-slate-500"> · {((margin / p.revenuePaise) * 100).toFixed(0)}%</span>}</td>
                    </tr>
                  );
                })}
                {report.plans.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No sales or usage in this period.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            AI cost is an estimate from list prices (US$1 ≈ ₹{report.usdToInr}); check your Groq and OpenAI bills for exact amounts.
            Free trials and invite bonuses show cost with no revenue.
          </p>
        </>
      )}
    </>
  );
};
