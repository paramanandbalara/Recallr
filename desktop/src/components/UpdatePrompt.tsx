import React, { useEffect, useState } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import { appVersion, downloadUrl, fetchVersionInfo, openUrl, REMIND_LATER_MS, updateToOffer, type UpdateSnooze, type VersionInfo } from '../services/account';
import { Button, IconButton } from './ui';

const SNOOZE_KEY = 'secondBrain_updateSnooze';
const CHECK_MS = 30 * 60 * 1000;

const readSnooze = (): UpdateSnooze | null => {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null');
  } catch {
    return null;
  }
};

// Offers a newer version in a popup: Update (opens the download) or Remind me later (asks again in a day).
// Kept back while `paused` (listening or practising), so it never covers answers in an interview.
export const UpdatePrompt: React.FC<{ paused: boolean }> = ({ paused }) => {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [snooze, setSnooze] = useState(readSnooze);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const load = () => {
      fetchVersionInfo().then(setInfo, () => {});
      setNow(Date.now());
    };
    load();
    const timer = setInterval(load, CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const latest = updateToOffer(appVersion(), info, snooze, now);
  if (paused || !info || !latest) return null;

  const remindLater = () => {
    const next = { version: latest, until: Date.now() + REMIND_LATER_MS };
    setSnooze(next);
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {
      // Asked again next start
    }
  };

  const update = () => {
    openUrl(downloadUrl(info));
    remindLater(); // While it downloads and installs
  };

  return (
    <div data-interactive className="backdrop-in absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-labelledby="update-title" className="dialog-in w-full max-w-[320px] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-blue-500/15 p-2 text-blue-400"><Sparkles className="w-4 h-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="update-title" className="text-sm font-semibold text-slate-100">Update available</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Recallr {latest} is ready{appVersion() ? ` (you have ${appVersion()})` : ''}. Your profiles and history are kept.
            </p>
          </div>
          <IconButton onClick={remindLater} title="Remind me later"><X className="w-3.5 h-3.5" /></IconButton>
        </div>
        {info.notes && (
          <div className="scrollable mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-800/60 px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">What's new</div>
            <p className="whitespace-pre-line text-[11px] leading-relaxed text-slate-300">{info.notes}</p>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={remindLater}>Remind me later</Button>
          <Button size="sm" variant="primary" icon={<Download className="w-3.5 h-3.5" />} onClick={update}>Update</Button>
        </div>
      </div>
    </div>
  );
};
