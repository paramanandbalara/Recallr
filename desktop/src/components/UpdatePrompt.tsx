import React, { useEffect, useState } from 'react';
import { Download, RotateCw, Sparkles, X } from 'lucide-react';
import {
  appVersion, canUpdateInApp, downloadUrl, fetchVersionInfo, installUpdate, onUpdateStatus, openUrl, REMIND_LATER_MS, startUpdate, updateToOffer,
  type UpdateSnooze, type VersionInfo,
} from '../services/account';
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

// offer → downloading (can be hidden, keeps going) → ready (Restart now / Later: installs when the app quits)
type Phase =
  | { step: 'offer' }
  | { step: 'downloading'; percent: number; hidden: boolean }
  | { step: 'ready'; version: string; hidden: boolean }
  | { step: 'failed'; message: string };

// Offers a newer version in a popup: Update or Remind me later (asks again in a day). In the installed app the
// update downloads and installs inside the app; otherwise Update opens the download page.
// Kept back while `paused` (listening or practising), so it never covers answers in an interview.
export const UpdatePrompt: React.FC<{ paused: boolean }> = ({ paused }) => {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [snooze, setSnooze] = useState(readSnooze);
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<Phase>({ step: 'offer' });

  useEffect(() => {
    const load = () => {
      fetchVersionInfo().then(setInfo, () => {});
      setNow(Date.now());
    };
    load();
    const timer = setInterval(load, CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => onUpdateStatus(status => {
    if (status.state === 'downloading') {
      setPhase(p => ({ step: 'downloading', percent: status.percent, hidden: p.step === 'downloading' && p.hidden }));
    }
  }), []);

  const latest = updateToOffer(appVersion(), info, snooze, now);

  const remindLater = () => {
    if (!latest) return;
    const next = { version: latest, until: Date.now() + REMIND_LATER_MS };
    setSnooze(next);
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {
      // Asked again next start
    }
  };

  const openDownloadPage = () => {
    if (info) openUrl(downloadUrl(info));
    remindLater(); // While it downloads and installs
    setPhase({ step: 'offer' });
  };

  const update = () => {
    if (!info) return;
    if (!canUpdateInApp(info)) return openDownloadPage();
    setPhase({ step: 'downloading', percent: 0, hidden: false });
    startUpdate(info.feedUrl!).then(status => {
      if (status.state === 'ready') setPhase({ step: 'ready', version: status.version, hidden: false });
      else if (status.state === 'none') setPhase({ step: 'failed', message: 'The new version isn’t ready to download yet. Get it from the website instead.' });
      else if (status.state === 'error') setPhase({ step: 'failed', message: `The download didn’t finish (${status.message}). Get it from the website instead.` });
    }, () => setPhase({ step: 'failed', message: 'The download didn’t finish. Get it from the website instead.' }));
  };

  // Hidden downloads and "Later" keep going quietly; a finished download asks again when not in an interview
  if (paused || !info) return null;
  if (phase.step === 'offer' && !latest) return null;
  if ((phase.step === 'downloading' || phase.step === 'ready') && phase.hidden) return null;

  const version = phase.step === 'ready' ? phase.version : latest ?? info.latest;
  const close = () => {
    if (phase.step === 'offer') remindLater();
    else if (phase.step === 'failed') setPhase({ step: 'offer' });
    else setPhase({ ...phase, hidden: true });
  };

  return (
    <div data-interactive className="backdrop-in absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-labelledby="update-title" className="dialog-in w-full max-w-[320px] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-blue-500/15 p-2 text-blue-400"><Sparkles className="w-4 h-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="update-title" className="text-sm font-semibold text-slate-100">
              {phase.step === 'ready' ? 'Update ready to install' : phase.step === 'downloading' ? 'Downloading the update' : 'Update available'}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {phase.step === 'ready'
                ? `Recallr ${version} is downloaded. Restart to install it; it takes a few seconds. Your profiles and history are kept.`
                : phase.step === 'downloading'
                  ? 'You can keep using Recallr while it downloads.'
                  : phase.step === 'failed'
                    ? phase.message
                    : `Recallr ${version} is ready${appVersion() ? ` (you have ${appVersion()})` : ''}. Your profiles and history are kept.`}
            </p>
          </div>
          <IconButton onClick={close} title={phase.step === 'offer' ? 'Remind me later' : 'Hide'}><X className="w-3.5 h-3.5" /></IconButton>
        </div>

        {phase.step === 'downloading' && (
          <div className="mt-3" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.percent}>
              <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${Math.max(3, phase.percent)}%` }} />
            </div>
            <div className="mt-1 text-right text-[10px] tabular-nums text-slate-500">{phase.percent}%</div>
          </div>
        )}

        {phase.step === 'offer' && info.notes && (
          <div className="scrollable mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-800/60 px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">What's new</div>
            <p className="whitespace-pre-line text-[11px] leading-relaxed text-slate-300">{info.notes}</p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {phase.step === 'offer' && <>
            <Button size="sm" variant="ghost" onClick={remindLater}>Remind me later</Button>
            <Button size="sm" variant="primary" icon={<Download className="w-3.5 h-3.5" />} onClick={update}>Update</Button>
          </>}
          {phase.step === 'downloading' && <Button size="sm" variant="ghost" onClick={close}>Hide</Button>}
          {phase.step === 'ready' && <>
            <Button size="sm" variant="ghost" onClick={close} title="It installs the next time you quit Recallr">Later</Button>
            <Button size="sm" variant="primary" icon={<RotateCw className="w-3.5 h-3.5" />} onClick={() => { installUpdate(); }}>Restart now</Button>
          </>}
          {phase.step === 'failed' && <>
            <Button size="sm" variant="ghost" onClick={close}>Close</Button>
            <Button size="sm" variant="primary" icon={<Download className="w-3.5 h-3.5" />} onClick={openDownloadPage}>Open download page</Button>
          </>}
        </div>
      </div>
    </div>
  );
};
