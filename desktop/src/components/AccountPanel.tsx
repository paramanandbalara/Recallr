import React, { useEffect } from 'react';
import { ExternalLink, Gift, Laptop, LifeBuoy, LogOut, RotateCcw } from 'lucide-react';
import { formatDate, formatMinutes, formatTokens, openWebsite } from '../services/account';
import { useAccount } from '../hooks/useAccount';
import { Button } from './ui';

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg bg-slate-800/50 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">{value}</div>
  </div>
);

// Who's signed in and what their plan still allows; buying happens on the website
export const AccountPanel: React.FC = () => {
  const { user, allowance, refresh, signOut } = useAccount();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-slate-200">{user.name}</div>
        <div className="text-[11px] text-slate-500">{user.email}</div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-300">{allowance.onTrial ? 'Free trial' : 'Your plan'}</span>
          <span className="text-[11px] text-slate-500">until {formatDate(allowance.expiresAt)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Listening left" value={formatMinutes(allowance.minutesLeft)} />
          <Stat label="AI answers left" value={`${formatTokens(allowance.tokensLeft)} tokens`} />
        </div>
        {allowance.packs.length > 1 && (
          <ul className="space-y-1">
            {allowance.packs.map(pack => (
              <li key={pack.id} className="flex justify-between rounded-md border border-slate-800 px-2.5 py-1.5 text-[11px]">
                <span className="text-slate-300">{pack.planName}</span>
                <span className="tabular-nums text-slate-500">
                  {formatMinutes(pack.minutesLeft)} · until {formatDate(pack.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">
          Listening time counts only while Recallr hears speech. AI answers are counted in tokens (about 3/4 of a word each);
          a typical answer uses 1,500–3,000.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/buy')}>
          {allowance.onTrial ? 'Upgrade' : 'Buy more'}
        </Button>
        <Button size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account')}>Manage account</Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={refresh}>Refresh</Button>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-3">
        <Button size="sm" variant="ghost" icon={<Laptop className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/devices')}>Devices</Button>
        <Button size="sm" variant="ghost" icon={<Gift className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/invite')}>Invite friends</Button>
        <Button size="sm" variant="ghost" icon={<LifeBuoy className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/support')}>Get help</Button>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <Button size="sm" variant="ghost" icon={<LogOut className="w-3.5 h-3.5" />} onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
};
