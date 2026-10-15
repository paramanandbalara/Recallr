import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { api, date, hours } from '../../api';
import { Badge, Button, Card, ErrorText, TextArea } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

// Admin → Referrals: college ambassador applications to review, and referral numbers in full (with emails,
// unlike the users' leaderboard)

type Status = 'APPLIED' | 'APPROVED' | 'REJECTED';

interface Ambassador {
  id: string;
  userId: string;
  college: string;
  city: string;
  course: string;
  why: string;
  status: Status;
  note: string;
  createdAt: string;
  approvedAt: string | null;
  invited: number;
  paidFriends: number;
  paidFriendsThisMonth: number;
  user: { id: string; name: string; email: string; referralCode: string | null; createdAt: string };
}

interface Stats {
  totals: { invited: number; paidFriends: number; paidFriendsThisMonth: number; rewarded: number; bonusPacks: number; bonusMinutes: number; referrers: number };
  referrers: {
    id: string; name: string; email: string; status: string; referralCode: string | null; ambassador: { status: Status; college: string } | null;
    invited: number; paidFriends: number; paidFriendsThisMonth: number;
  }[];
  recent: {
    id: string; name: string; email: string; createdAt: string; referralRewardedAt: string | null;
    referredBy: { id: string; name: string; email: string } | null;
  }[];
}

const STATUS: Record<Status, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  APPLIED: { label: 'To review', tone: 'amber' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
};

const Application: React.FC<{ item: Ambassador; onChange: () => void }> = ({ item, onChange }) => {
  const [note, setNote] = useState(item.note);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(action);
    setError('');
    try {
      await api(`/admin/ambassadors/${item.id}/${action}`, { body: { note } });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/users/${item.user.id}`} className="font-medium text-slate-100 hover:text-blue-300">{item.user.name}</Link>
            <span className="text-xs text-slate-500">{item.user.email}</span>
            <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-300">{item.college}{item.city && `, ${item.city}`} <span className="text-slate-500">· {item.course}</span></p>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-400">{item.why}</p>
          <p className="mt-2 text-xs text-slate-500">
            Applied {date(item.createdAt)}{item.approvedAt && ` · approved ${date(item.approvedAt)}`} · code <span className="font-mono">{item.user.referralCode ?? '–'}</span>
            {' '}· {item.invited} invited · {item.paidFriends} paid ({item.paidFriendsThisMonth} this month)
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <TextArea rows={2} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="Note to the applicant (optional, included in the email)" />
        </div>
        <Button variant="primary" loading={busy === 'approve'} disabled={!!busy} onClick={() => decide('approve')}><Check className="h-4 w-4" /> {item.status === 'APPROVED' ? 'Save note' : 'Approve'}</Button>
        <Button variant="danger" loading={busy === 'reject'} disabled={!!busy} onClick={() => decide('reject')}><X className="h-4 w-4" /> {item.status === 'REJECTED' ? 'Save note' : item.status === 'APPROVED' ? 'Remove' : 'Reject'}</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
};

const AmbassadorList: React.FC = () => {
  const [status, setStatus] = useState<Status | ''>('APPLIED');
  const [data, setData] = useState<{ counts: Record<Status, number>; ambassadors: Ambassador[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ counts: Record<Status, number>; ambassadors: Ambassador[] }>(`/admin/ambassadors${status ? `?status=${status}` : ''}`).then(setData, e => setError(e.message));
  }, [status]);
  useEffect(load, [load]);

  const filter = (value: Status | '', label: string) => (
    <button key={value} onClick={() => setStatus(value)}
      className={`rounded-lg px-3 py-1.5 text-sm ${status === value ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
      {label}{value && data ? ` (${data.counts[value]})` : ''}
    </button>
  );

  return (
    <>
      <p className="mb-4 text-sm text-slate-400">
        Approved ambassadors get the ambassador bonus (Settings → Referrals) for each invited friend’s first payment, instead of the usual
        bonus. Approving or rejecting emails the applicant, with your note.
      </p>
      <div className="mb-4 flex flex-wrap gap-1">
        {filter('APPLIED', 'To review')}{filter('APPROVED', 'Approved')}{filter('REJECTED', 'Rejected')}{filter('', 'All')}
      </div>
      <ErrorText>{error}</ErrorText>
      {data && (data.ambassadors.length === 0
        ? <p className="text-sm text-slate-500">No applications here.</p>
        : <div className="space-y-2">{data.ambassadors.map(a => <Application key={`${a.id}-${a.status}-${a.note}`} item={a} onChange={load} />)}</div>)}
    </>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Card className="!p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-white">{value}</div></Card>
);

const ReferralStats: React.FC = () => {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Stats>('/admin/referrals').then(setData, e => setError(e.message)); }, []);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const t = data.totals;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Joined with an invite" value={t.invited} />
        <Tile label="Of them paid" value={t.paidFriends} />
        <Tile label="Paid this month" value={t.paidFriendsThisMonth} />
        <Tile label="People who invited" value={t.referrers} />
        <Tile label="Bonus packs given" value={t.bonusPacks} />
        <Tile label="Bonus time given" value={hours(t.bonusMinutes)} />
      </div>

      <h2 className="mb-3 mt-8 font-semibold text-slate-100">Who invited</h2>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-800"><th className="px-4 py-2">Person</th><th className="px-4 py-2">Ambassador</th><th className="px-4 py-2 text-right">Invited</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2 text-right">This month</th></tr>
          </thead>
          <tbody>
            {data.referrers.map(r => (
              <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                <td className="px-4 py-2">
                  <Link to={`/admin/users/${r.id}`} className="text-slate-100 hover:text-blue-300">{r.name}</Link>
                  <div className="text-xs text-slate-500">{r.email}{r.status !== 'ACTIVE' && ' · blocked or closed'}</div>
                </td>
                <td className="px-4 py-2">{r.ambassador ? <Badge tone={STATUS[r.ambassador.status].tone}>{STATUS[r.ambassador.status].label}</Badge> : <span className="text-slate-600">–</span>}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.invited}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.paidFriends}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.paidFriendsThisMonth}</td>
              </tr>
            ))}
            {data.referrers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No one has invited anyone yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-3 mt-8 font-semibold text-slate-100">Latest friends who joined</h2>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-800"><th className="px-4 py-2">Friend</th><th className="px-4 py-2">Invited by</th><th className="px-4 py-2">Joined</th><th className="px-4 py-2">Bonus</th></tr>
          </thead>
          <tbody>
            {data.recent.map(r => (
              <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                <td className="px-4 py-2"><Link to={`/admin/users/${r.id}`} className="text-slate-100 hover:text-blue-300">{r.name}</Link><div className="text-xs text-slate-500">{r.email}</div></td>
                <td className="px-4 py-2">{r.referredBy ? <><div className="text-slate-200">{r.referredBy.name}</div><div className="text-xs text-slate-500">{r.referredBy.email}</div></> : '–'}</td>
                <td className="px-4 py-2 text-slate-400">{date(r.createdAt)}</td>
                <td className="px-4 py-2">{r.referralRewardedAt ? <Badge tone="green">Given {date(r.referralRewardedAt)}</Badge> : <Badge>Not paid yet</Badge>}</td>
              </tr>
            ))}
            {data.recent.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No one yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
};

export const AdminReferrals: React.FC = () => {
  const [tab, setTab] = useState<'ambassadors' | 'stats'>('ambassadors');
  const tabClass = (t: typeof tab) => `whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`;
  return (
    <>
      <AdminTitle title="Referrals" />
      <nav className="mb-5 flex gap-1 border-b border-slate-800">
        <button className={tabClass('ambassadors')} onClick={() => setTab('ambassadors')}>College ambassadors</button>
        <button className={tabClass('stats')} onClick={() => setTab('stats')}>Referral numbers</button>
      </nav>
      {tab === 'ambassadors' ? <AmbassadorList /> : <ReferralStats />}
    </>
  );
};
