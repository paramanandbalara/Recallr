import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, ListChecks, Undo2, X } from 'lucide-react';
import { CALENDAR_EVENT, loadInterviews, nextAction, updateInterview, whenLabel, type CalendarAction, type Interview } from '../services/calendar';
import { loadActiveProfile, loadProfiles, setActiveProfile } from '../services/storage';
import { t } from '../i18n';
import { Button, IconButton } from './ui';

const CHECK_MS = 30 * 1000;

interface Props {
  paused: boolean;                         // Listening or practising: nothing changes and nothing pops up
  onPrep: (interview: Interview) => void;  // Open the prep pack for it (its profile is already active)
  onProfileChanged: () => void;            // The active profile was switched
}

interface Switched {
  interview: Interview;
  profileName: string;
  previousId: string | null; // For Undo; null when it was already the right profile
}

// A desktop notification too when the window is hidden, so the reminder isn't missed
const notify = (title: string, body: string) => {
  try {
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission !== 'denied') new Notification(title, { body, silent: false });
  } catch {
    // Notifications unavailable
  }
};

// The interview calendar at work: the day before an interview it offers a prep pack, and shortly before it starts
// it switches to that interview's profile (with Undo).
export const CalendarReminder: React.FC<Props> = ({ paused, onPrep, onProfileChanged }) => {
  const [action, setAction] = useState<CalendarAction | null>(null);
  const [switched, setSwitched] = useState<Switched | null>(null);
  const latest = useRef({ paused, onProfileChanged });
  useEffect(() => { latest.current = { paused, onProfileChanged }; });

  useEffect(() => {
    let notified = '';
    // Switching happens on its own, but not while listening, so answers never change mid-question
    const switchFor = (interview: Interview) => {
      updateInterview(interview.id, { switched: true, prepOffered: true });
      const profile = loadProfiles().find(p => p.id === interview.profileId);
      if (!profile) return;
      const current = loadActiveProfile().id;
      if (profile.id !== current) {
        setActiveProfile(profile.id);
        latest.current.onProfileChanged();
      }
      setSwitched({ interview, profileName: profile.name, previousId: profile.id !== current ? current : null });
      notify(t('Interview soon: {title}', { title: interview.title }), t('Recallr is ready with the "{profile}" profile.', { profile: profile.name }));
    };
    const check = () => {
      const next = nextAction(loadInterviews(), Date.now());
      if (next?.kind === 'switch') {
        if (!latest.current.paused) switchFor(next.interview);
        return;
      }
      setAction(next);
      if (next?.kind === 'prep' && notified !== next.interview.id && !latest.current.paused) {
        notified = next.interview.id;
        notify(t('Interview tomorrow: {title}', { title: next.interview.title }), t('Open Recallr to get ready with a prep pack.'));
      }
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    window.addEventListener(CALENDAR_EVENT, check);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CALENDAR_EVENT, check);
    };
  }, []);

  // Look again as soon as listening or practice stops
  useEffect(() => {
    if (!paused) window.dispatchEvent(new Event(CALENDAR_EVENT));
  }, [paused]);

  if (paused) return null;

  if (switched) {
    const undo = () => {
      if (switched.previousId) {
        setActiveProfile(switched.previousId);
        onProfileChanged();
      }
      setSwitched(null);
    };
    return (
      <div data-interactive role="status" className="dialog-in absolute inset-x-3 bottom-16 z-[55] rounded-xl border border-blue-500/30 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-blue-500/15 p-1.5 text-blue-400"><CalendarClock className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-100">{switched.interview.title} · {whenLabel(switched.interview.startsAt)}</div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {switched.previousId
                ? t('Switched to the "{profile}" profile for this interview. Good luck!', { profile: switched.profileName })
                : t('You’re on the "{profile}" profile for this interview. Good luck!', { profile: switched.profileName })}
            </p>
          </div>
          <IconButton onClick={() => setSwitched(null)} title={t('Close')}><X className="h-3.5 w-3.5" /></IconButton>
        </div>
        {switched.previousId && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={undo}>{t('Undo')}</Button>
          </div>
        )}
      </div>
    );
  }

  if (action?.kind !== 'prep') return null;
  const { interview } = action;
  const answered = () => {
    updateInterview(interview.id, { prepOffered: true });
    setAction(null);
  };
  const prep = () => {
    answered();
    if (loadProfiles().some(p => p.id === interview.profileId) && loadActiveProfile().id !== interview.profileId) {
      setActiveProfile(interview.profileId);
      onProfileChanged();
    }
    onPrep(interview);
  };

  return (
    <div data-interactive role="dialog" aria-labelledby="prep-reminder" className="dialog-in absolute inset-x-3 bottom-16 z-[55] rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-2.5">
        <div className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-400"><ListChecks className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div id="prep-reminder" className="text-xs font-semibold text-slate-100">{interview.title} · {whenLabel(interview.startsAt)}</div>
          <p className="mt-0.5 text-[11px] text-slate-400">{t('Get ready with a prep pack: the questions this job will likely bring up, with answers from your resume.')}</p>
        </div>
        <IconButton onClick={answered} title={t('Not now')}><X className="h-3.5 w-3.5" /></IconButton>
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={answered}>{t('Not now')}</Button>
        <Button size="sm" variant="primary" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={prep}>{t('Build prep pack')}</Button>
      </div>
    </div>
  );
};
