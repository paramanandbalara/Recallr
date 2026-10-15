import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, dateTime } from '../../api';
import { Badge, Card, ErrorText, Select } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

// Every WhatsApp message: reminders, the question of the day, verification codes and tests (sent, failed or skipped)

interface Log {
  id: string;
  userId: string | null;
  email: string | null;
  to: string; // Masked
  template: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string;
  createdAt: string;
}

interface Result {
  ready: boolean;
  counts: { verified: number; reminders: number; daily: number };
  logs: Log[];
}

const TONE = { sent: 'green', failed: 'red', skipped: 'slate' } as const;

export const AdminWhatsApp: React.FC = () => {
  const [status, setStatus] = useState('');
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Result>(`/admin/whatsapp/logs${status ? `?status=${status}` : ''}`).then(setData, e => setError(e.message));
  }, [status]);

  return (
    <>
      <AdminTitle title="WhatsApp">
        <Select value={status} onChange={e => setStatus(e.target.value)} className="!w-40">
          <option value="">All messages</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </Select>
      </AdminTitle>
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Card className="!p-4"><div className="text-xs text-slate-400">Status</div><div className="mt-1 text-sm font-semibold">{data.ready ? <span className="text-emerald-300">Set up</span> : <span className="text-amber-300">Not set up</span>}</div></Card>
            <Card className="!p-4"><div className="text-xs text-slate-400">Verified numbers</div><div className="mt-1 text-2xl font-bold text-white">{data.counts.verified}</div></Card>
            <Card className="!p-4"><div className="text-xs text-slate-400">Want reminders</div><div className="mt-1 text-2xl font-bold text-white">{data.counts.reminders}</div></Card>
            <Card className="!p-4"><div className="text-xs text-slate-400">Want the daily question</div><div className="mt-1 text-2xl font-bold text-white">{data.counts.daily}</div></Card>
          </div>
          {!data.ready && (
            <p className="mb-4 text-sm text-slate-400">Messages are logged as skipped until the token and phone number ID are saved in <Link to="/admin/settings" className="text-blue-400 hover:text-blue-300">Settings → WhatsApp</Link>.</p>
          )}
          <Card className="overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">To</th><th className="px-4 py-2">Template</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.logs.map(log => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-400">{dateTime(log.createdAt)}</td>
                    <td className="px-4 py-2 text-slate-300">
                      <span className="font-mono">{log.to}</span>
                      {log.email && <Link to={`/admin/users/${log.userId}`} className="block text-xs text-blue-400 hover:text-blue-300">{log.email}</Link>}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">{log.template}</td>
                    <td className="px-4 py-2">
                      <Badge tone={TONE[log.status]}>{log.status}</Badge>
                      {log.error && <div className="mt-1 max-w-md text-xs text-slate-500">{log.error}</div>}
                    </td>
                  </tr>
                ))}
                {!data.logs.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No messages yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
};
