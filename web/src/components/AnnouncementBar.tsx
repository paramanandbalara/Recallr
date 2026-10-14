import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { api } from '../api';

interface Announcement {
  id: string;
  title: string;
  body: string;
  level: 'INFO' | 'WARNING';
}

const DISMISSED_KEY = 'recallr_dismissed';
const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
};

// Messages from Admin → Announcements, until the visitor closes them
export const AnnouncementBar: React.FC = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    api<{ announcements: Announcement[] }>('/announcements?for=website').then(r => setItems(r.announcements), () => {});
  }, []);

  const close = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-50)));
    } catch {
      // Shown again next visit
    }
  };

  const shown = items.filter(a => !dismissed.includes(a.id));
  if (!shown.length) return null;
  return (
    <div>
      {shown.map(a => (
        <div key={a.id} className={`border-b px-4 py-2.5 text-sm ${a.level === 'WARNING' ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-blue-500/30 bg-blue-500/10 text-blue-100'}`}>
          <div className="mx-auto flex max-w-6xl items-start gap-2">
            {a.level === 'WARNING' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="flex-1"><strong>{a.title}</strong>{a.body && <span className="text-slate-300"> {a.body}</span>}</div>
            <button onClick={() => close(a.id)} aria-label="Close" className="rounded p-0.5 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
};
