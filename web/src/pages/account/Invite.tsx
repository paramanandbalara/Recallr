import React, { useEffect, useState } from 'react';
import { Check, Copy, Gift } from 'lucide-react';
import { api, date, hours } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Badge, Button, Card, ErrorText, Input } from '../../components/ui';

interface Referrals {
  code: string;
  link: string;
  bonus: { minutes: number; days: number };
  invited: { name: string; joinedAt: string; rewarded: boolean }[];
}

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
                  {on ? `Give ${hours(data.bonus.minutes)}, get ${hours(data.bonus.minutes)}` : 'Share Recallr'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {on
                    ? `When a friend signs up with your link and makes their first purchase, you both get ${hours(data.bonus.minutes)} of bonus listening time, valid ${data.bonus.days} days.`
                    : 'Invite bonuses are paused at the moment, but you can still share your link.'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Input readOnly value={data.link} onFocus={e => e.target.select()} />
              <Button variant="primary" onClick={copy}>{copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Your code: <span className="font-mono text-slate-300">{data.code}</span></p>
          </Card>

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
