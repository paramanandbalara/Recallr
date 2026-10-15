import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Info, Sparkles, X } from 'lucide-react';
import { api } from '../api';
import { useBlock } from '../siteContent';

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

// Messages from Admin → Announcements, and the strip from Admin → Website content, until the visitor closes them
export const AnnouncementBar: React.FC = () => {
  const strip = useBlock('announcement');
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
  // Closing the strip hides this text; new text shows again
  const stripId = `site:${strip.text}`;
  const showStrip = strip.enabled && !!strip.text && !dismissed.includes(stripId);
  if (!shown.length && !showStrip) return null;
  return (
    <div>
      {showStrip && (
        <div className="border-b border-violet-500/25 bg-gradient-to-r from-blue-600/15 via-violet-600/15 to-blue-600/15 px-4 py-2 text-sm text-slate-100">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
            <p className="flex-1">
              {strip.text}
              {strip.linkUrl && strip.linkLabel && (
                strip.linkUrl.startsWith('/')
                  ? <Link to={strip.linkUrl} className="ml-2 inline-flex items-center gap-1 font-medium text-blue-300 hover:text-blue-200">{strip.linkLabel} <ArrowRight className="h-3.5 w-3.5" /></Link>
                  : <a href={strip.linkUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-medium text-blue-300 hover:text-blue-200">{strip.linkLabel} <ArrowRight className="h-3.5 w-3.5" /></a>
              )}
            </p>
            <button onClick={() => close(stripId)} aria-label="Close" className="rounded p-0.5 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
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
