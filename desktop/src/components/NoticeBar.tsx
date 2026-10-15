import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { fetchAnnouncements, formatMinutes, openWebsite, type Announcement } from '../services/account';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n';

const DISMISSED_KEY = 'secondBrain_dismissedNotices';
const CHECK_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
};

interface Item {
  id: string; // Dismissing remembers this
  tone: 'warn' | 'info';
  text: string;
  action?: { label: string; run: () => void };
}

// One-line notices under the header: running low, plan ending, the admin's announcements (updates: UpdatePrompt)
export const NoticeBar: React.FC = () => {
  const { allowance, lowMinutesWarning } = useAccount();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [now, setNow] = useState(() => Date.now()); // For "ends today", updated with the checks below

  useEffect(() => {
    const load = () => {
      fetchAnnouncements().then(setAnnouncements, () => {});
      setNow(Date.now());
    };
    load();
    const timer = setInterval(load, CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Shown again next time
    }
  };

  const items: Item[] = [];
  const buy = { label: t('Top up'), run: () => openWebsite('/account/buy') };
  const left = allowance.minutesLeft;
  // Low balance and ending soon come back each time they get worse, so they're keyed by the amount
  if (left !== null && left < lowMinutesWarning) {
    items.push({ id: `low-${Math.ceil(left / 5)}`, tone: 'warn', text: allowance.onTrial
      ? t('Only {time} of listening left in your free trial.', { time: formatMinutes(left) })
      : t('Only {time} of listening left.', { time: formatMinutes(left) }), action: buy });
  }
  const daysLeft = allowance.expiresAt ? (new Date(allowance.expiresAt).getTime() - now) / DAY_MS : Infinity;
  if (daysLeft < 2) {
    items.push({
      id: `ending-${allowance.expiresAt}`, tone: 'warn',
      text: allowance.onTrial
        ? (daysLeft < 1 ? t('Your free trial ends today.') : t('Your free trial ends tomorrow.'))
        : (daysLeft < 1 ? t('Your plan ends today.') : t('Your plan ends tomorrow.')),
      action: buy,
    });
  }
  for (const a of announcements) {
    items.push({ id: `a-${a.id}`, tone: a.level === 'WARNING' ? 'warn' : 'info', text: a.body ? `${a.title}: ${a.body}` : a.title });
  }

  const shown = items.filter(i => !dismissed.includes(i.id));
  if (!shown.length) return null;
  return (
    <div className="fade-with-text shrink-0">
      {shown.map(item => (
        <div key={item.id} className={`notice-in flex items-center gap-1.5 border-b px-3 py-1.5 text-[11px] ${
          item.tone === 'warn' ? 'border-amber-900 bg-amber-950/60 text-amber-100' : 'border-blue-900 bg-blue-950/60 text-blue-100'}`}>
          {item.tone === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <Info className="w-3.5 h-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate" title={item.text}>{item.text}</span>
          {item.action && <button onClick={item.action.run} className="shrink-0 rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline">{item.action.label}</button>}
          <button onClick={() => dismiss(item.id)} title={t('Hide')} className="shrink-0 rounded p-0.5 hover:bg-white/10"><X className="w-3 h-3" /></button>
        </div>
      ))}
    </div>
  );
};
