import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, date, hours, type Allowance, type User, downloadFile } from '../../api';
import { Badge, ErrorText, Input, Button } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

type Row = User & { allowance: Allowance };

export const PlanBadge: React.FC<{ allowance: Allowance }> = ({ allowance }) =>
  !allowance.active ? <Badge>No plan</Badge> : allowance.onTrial ? <Badge tone="green">Trial</Badge> : <Badge tone="blue">Active</Badge>;

export const AdminUsers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  // Search as you type, a moment after the last key
  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ users: Row[] }>(`/admin/users${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`)
        .then(r => setUsers(r.users), e => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <>
      <AdminTitle title="Users">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" className="pl-8" />
        </div>
        <Button onClick={() => downloadFile('/admin/users.csv', `recallr-users-${new Date().toISOString().slice(0, 10)}.csv`).catch(e => setError(e.message))}>
          Download CSV
        </Button>
      </AdminTitle>
      <ErrorText>{error}</ErrorText>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Listening left</th>
              <th className="px-3 py-2 font-medium">Plan ends</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users?.map(u => (
              <tr key={u.id} className="hover:bg-slate-900/60">
                <td className="px-3 py-2">
                  <Link to={`/admin/users/${u.id}`} className="block">
                    <span className="text-slate-100 hover:text-blue-300">{u.name}</span>
                    {u.role === 'ADMIN' && <Badge tone="amber">Admin</Badge>}
                    {u.status === 'BLOCKED' && <> <Badge tone="red">Blocked</Badge></>}
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </Link>
                </td>
                <td className="px-3 py-2"><PlanBadge allowance={u.allowance} /></td>
                <td className="px-3 py-2 tabular-nums text-slate-300">{u.allowance.active ? hours(u.allowance.minutesLeft) : '–'}</td>
                <td className="px-3 py-2 text-slate-300">{date(u.allowance.expiresAt)}</td>
                <td className="px-3 py-2 text-slate-400">{date(u.createdAt)}</td>
                <td className="px-3 py-2 text-slate-400">{date(u.lastSeenAt ?? null)}</td>
              </tr>
            ))}
            {users?.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
      {users && users.length >= 200 && <p className="mt-2 text-xs text-slate-500">Showing the newest 200. Search to find others.</p>}
    </>
  );
};
