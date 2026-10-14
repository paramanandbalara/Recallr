import React, { useEffect, useState } from 'react';
import { PROVIDERS, type ProviderId } from '../services/llm';
import { clearUsage, usageForConversation, usageSince, USAGE_EVENT, type ProviderUsage } from '../services/usage';
import { Button } from './ui';

interface Props {
  conversationId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const minutes = (seconds: number) => (seconds >= 60 ? `${(seconds / 60).toFixed(1)} min` : `${Math.round(seconds)} s`);
const dollars = (cost: number) => (cost === 0 ? '$0' : cost < 0.01 ? 'under $0.01' : `≈ $${cost.toFixed(2)}`);

const Table: React.FC<{ title: string; usage: Partial<Record<ProviderId, ProviderUsage>> }> = ({ title, usage }) => {
  const rows = Object.entries(usage) as [ProviderId, ProviderUsage][];
  const total = rows.reduce((sum, [, u]) => sum + u.cost, 0);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-slate-300">{title}</span>
        {rows.length > 0 && <span className="text-[11px] tabular-nums text-slate-300">{dollars(total)}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-500">Nothing yet.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(([provider, u]) => (
            <li key={provider} className="rounded-md bg-slate-800/50 px-2.5 py-1.5 text-[11px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-200">{PROVIDERS[provider].label}</span>
                <span className="tabular-nums text-slate-300">{dollars(u.cost)}{u.unpriced ? '+' : ''}</span>
              </div>
              <div className="mt-0.5 tabular-nums text-slate-500">
                {tokens(u.inputTokens)} in · {tokens(u.outputTokens)} out
                {u.audioSeconds > 0 && ` · ${minutes(u.audioSeconds)} audio`}
                {' · '}{u.requests} {u.requests === 1 ? 'call' : 'calls'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Tokens, audio and approximate cost: this conversation and the last 30 days
export const UsagePanel: React.FC<Props> = ({ conversationId }) => {
  const [, setVersion] = useState(0);

  // Refresh when something is recorded
  useEffect(() => {
    const refresh = () => setVersion(v => v + 1);
    window.addEventListener(USAGE_EVENT, refresh);
    return () => window.removeEventListener(USAGE_EVENT, refresh);
  }, []);

  // eslint-disable-next-line react-hooks/purity -- the 30-day window is meant to move with the clock
  const monthAgo = Date.now() - 30 * DAY_MS;

  return (
    <div className="space-y-3 border-t border-slate-800 pt-4">
      <div>
        <div className="text-xs font-semibold text-slate-300">Usage</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          Costs are approximate list prices. On Groq's free plan you pay nothing: it shows what the same use would cost on a paid plan.
          "+" means some calls used a model without a known price.
        </div>
      </div>
      <Table title="This conversation" usage={usageForConversation(conversationId)} />
      <Table title="Last 30 days" usage={usageSince(monthAgo)} />
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => window.confirm('Clear all usage history?') && clearUsage()}>Clear usage</Button>
      </div>
    </div>
  );
};
