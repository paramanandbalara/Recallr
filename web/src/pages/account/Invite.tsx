import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, Crown, Gift, GraduationCap, Trophy } from 'lucide-react';
import { api, date, hours } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Badge, Button, Card, ErrorText, Input } from '../../components/ui';
import { AmbassadorStatus, type AmbassadorApplication } from '../Ambassadors';

interface Referrals {
  code: string;
  link: string;
  bonus: { minutes: number; days: number };
  invited: { name: string; joinedAt: string; rewarded: boolean }[];
  ambassador: { status: AmbassadorApplication['status']; college: string; bonusMinutes: number } | null;
}

interface Board {
  top: { rank: number; name: string; friends: number; ambassador: boolean; you: boolean }[];
  me: { rank: number; friends: number } | null;
  total: number;
}

// Who brought the most friends who paid: this month (India time) and ever. Names are shortened by the server.
const Leaderboard: React.FC = () => {
  const [data, setData] = useState<{ month: Board & { label: string }; allTime: Board } | null>(null);
  const [tab, setTab] = useState<'month' | 'allTime'>('month');
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ month: Board & { label: string }; allTime: Board }>('/referrals/leaderboard').then(setData, e => setError(e.message));
  }, []);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const board = data[tab];
  const meShown = board.top.some(r => r.you);
  const tabClass = (t: typeof tab) => `rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-100"><Trophy className="h-5 w-5 text-amber-300" /> Leaderboard</h2>
        <div className="flex gap-1" role="tablist">
          <button role="tab" aria-selected={tab === 'month'} className={tabClass('month')} onClick={() => setTab('month')}>{data.month.label}</button>
          <button role="tab" aria-selected={tab === 'allTime'} className={tabClass('allTime')} onClick={() => setTab('allTime')}>All time</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Friends who joined with an invite and made their first payment. Only first names and initials are shown.</p>
      {board.top.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No one yet{tab === 'month' ? ' this month' : ''}. Be the first: share your link.</p>
      ) : (
        <ol className="mt-4 space-y-1.5">
          {board.top.map((row, i) => (
            <li key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${row.you ? 'border border-blue-500/40 bg-blue-500/10' : 'bg-slate-900/60'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                row.rank === 1 ? 'bg-amber-400/20 text-amber-300' : row.rank === 2 ? 'bg-slate-300/15 text-slate-200' : row.rank === 3 ? 'bg-orange-400/15 text-orange-300' : 'bg-slate-800 text-slate-400'}`}>
                {row.rank === 1 ? <Crown className="h-3.5 w-3.5" /> : row.rank}
              </span>
              <span className="flex-1 text-slate-200">
                {row.name}{row.you && <span className="ml-1.5 text-xs font-medium text-blue-300">(you)</span>}
                {row.ambassador && <span className="ml-2"><Badge tone="blue">Ambassador</Badge></span>}
              </span>
              <span className="tabular-nums text-slate-300">{row.friends} {row.friends === 1 ? 'friend' : 'friends'}</span>
            </li>
          ))}
        </ol>
      )}
      {!meShown && (
        <p className="mt-3 text-sm text-slate-400">
          {board.me ? `You’re number ${board.me.rank} with ${board.me.friends} ${board.me.friends === 1 ? 'friend' : 'friends'}.` : 'You’re not on the board yet: it counts friends who make their first payment.'}
        </p>
      )}
    </Card>
  );
};

export const AccountInvite: React.FC = () => {
  const [data, setData] = useState<Referrals | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<Referrals>('/referrals').then(setData, e => setError(e.message));
  }, []);

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const on = data && data.bonus.minutes > 0;
  // An approved ambassador gets the ambassador bonus; the friend still gets the usual one
  const mine = data?.ambassador?.status === 'APPROVED' ? data.ambassador.bonusMinutes : data?.bonus.minutes ?? 0;

  return (
    <AccountPage title="Invite friends">
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          <Card>
            <div className="flex gap-3">
              <Gift className="h-6 w-6 shrink-0 text-emerald-300" />
              <div>
                <h2 className="font-semibold text-slate-100">
                  {on || mine > 0 ? `Give ${hours(data.bonus.minutes)}, get ${hours(mine)}` : 'Share Recallr'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {!on && mine <= 0
                    ? 'Invite bonuses are paused at the moment, but you can still share your link.'
                    : mine !== data.bonus.minutes
                      ? `When a friend signs up with your link and makes their first purchase, you get ${hours(mine)} as an ambassador${on ? ` and they get ${hours(data.bonus.minutes)}` : ''} of bonus listening time, valid ${data.bonus.days} days.`
                      : `When a friend signs up with your link and makes their first purchase, you both get ${hours(data.bonus.minutes)} of bonus listening time, valid ${data.bonus.days} days.`}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Input readOnly value={data.link} onFocus={e => e.target.select()} />
              <Button variant="primary" onClick={copy}>{copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Your code: <span className="font-mono text-slate-300">{data.code}</span></p>
          </Card>

          <div className="mt-6">
            {data.ambassador ? (
              <Card><AmbassadorApplicationCard /></Card>
            ) : (
              <Link to="/ambassadors" className="group flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4 text-sm text-slate-400 hover:border-slate-700">
                <GraduationCap className="h-5 w-5 shrink-0 text-violet-300" />
                <span className="flex-1"><span className="font-medium text-slate-200">A student?</span> Become a college ambassador and get a bigger bonus for each friend who pays.</span>
                <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>

          <div className="mt-6"><Leaderboard /></div>

          <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Friends who joined</h2>
          {data.invited.length === 0 ? (
            <p className="text-sm text-slate-500">No one yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.invited.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-sm">
                  <span className="text-slate-200">{f.name} <span className="text-xs text-slate-500">· joined {date(f.joinedAt)}</span></span>
                  {f.rewarded ? <Badge tone="green">Bonus given</Badge> : <Badge>Waiting for first purchase</Badge>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AccountPage>
  );
};

// The full application (with the admin's note), loaded only for people who applied
const AmbassadorApplicationCard: React.FC = () => {
  const [data, setData] = useState<{ ambassador: AmbassadorApplication | null; bonus: number } | null>(null);
  useEffect(() => {
    Promise.all([
      api<{ ambassador: AmbassadorApplication | null }>('/ambassadors/me'),
      api<{ bonusMinutes: number }>('/ambassadors/program').catch(() => ({ bonusMinutes: 0 })),
    ]).then(([me, program]) => setData({ ambassador: me.ambassador, bonus: program.bonusMinutes }), () => {});
  }, []);
  if (!data?.ambassador) return null;
  return <AmbassadorStatus application={data.ambassador} bonusMinutes={data.bonus} />;
};
