import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download, Info, X } from 'lucide-react';
import { appVersion, downloadUrl, fetchAnnouncements, fetchVersionInfo, formatMinutes, isOlder, openUrl, openWebsite, type Announcement, type VersionInfo } from '../services/account';
import { useAccount } from '../hooks/useAccount';

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

// One-line notices under the header: running low, plan ending, an update, the admin's announcements
export const NoticeBar: React.FC = () => {
  const { allowance, lowMinutesWarning } = useAccount();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [now, setNow] = useState(() => Date.now()); // For "ends today", updated with the checks below

  useEffect(() => {
    const load = () => {
      fetchAnnouncements().then(setAnnouncements, () => {});
      fetchVersionInfo().then(setVersion, () => {});
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
  const buy = { label: 'Top up', run: () => openWebsite('/account/buy') };
  const left = allowance.minutesLeft;
  // Low balance and ending soon come back each time they get worse, so they're keyed by the amount
  if (left !== null && left < lowMinutesWarning) {
    items.push({ id: `low-${Math.ceil(left / 5)}`, tone: 'warn', text: `Only ${formatMinutes(left)} of listening left${allowance.onTrial ? ' in your free trial' : ''}.`, action: buy });
  }
  const daysLeft = allowance.expiresAt ? (new Date(allowance.expiresAt).getTime() - now) / DAY_MS : Infinity;
  if (daysLeft < 2) {
    items.push({
      id: `ending-${allowance.expiresAt}`, tone: 'warn',
      text: `Your ${allowance.onTrial ? 'free trial' : 'plan'} ends ${daysLeft < 1 ? 'today' : 'tomorrow'}.`, action: buy,
    });
  }
  if (version && isOlder(appVersion(), version.latest)) {
    items.push({
      id: `update-${version.latest}`, tone: 'info',
      text: `Recallr ${version.latest} is available.${version.notes ? ` ${version.notes}` : ''}`,
      action: { label: 'Download', run: () => openUrl(downloadUrl(version)) },
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
        <div key={item.id} className={`flex items-center gap-1.5 border-b px-3 py-1.5 text-[11px] ${
          item.tone === 'warn' ? 'border-amber-900 bg-amber-950/60 text-amber-100' : 'border-blue-900 bg-blue-950/60 text-blue-100'}`}>
          {item.tone === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : item.id.startsWith('update') ? <Download className="w-3.5 h-3.5 shrink-0" /> : <Info className="w-3.5 h-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate" title={item.text}>{item.text}</span>
          {item.action && <button onClick={item.action.run} className="shrink-0 rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline">{item.action.label}</button>}
          <button onClick={() => dismiss(item.id)} title="Hide" className="shrink-0 rounded p-0.5 hover:bg-white/10"><X className="w-3 h-3" /></button>
        </div>
      ))}
    </div>
  );
};
