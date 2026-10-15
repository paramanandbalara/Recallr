import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchAccount, isSignedIn, SIGNED_IN_EVENT } from '../services/account';
import { setProfileSync } from '../services/profileSync';
import { t } from '../i18n';
import { Button } from './ui';

const SEEN_KEY = 'secondBrain_profileCopyNoticeSeen';

const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Shown again next start; harmless
  }
};

// Shown once (after the update that started keeping a copy of the profiles on the account): what is kept, why,
// that it's encrypted, and a way to turn it off (the same switch as Settings → Data). Kept back while `paused`
// (listening, practising or a check is open), and not shown when signed out or when the copy is already off.
export const ProfileCopyNotice: React.FC<{ paused: boolean }> = ({ paused }) => {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [turnedOff, setTurnedOff] = useState(false);

  useEffect(() => {
    if (seen()) return;
    let cancelled = false;
    const check = () => {
      if (!isSignedIn() || seen()) return;
      fetchAccount().then(({ user }) => {
        if (cancelled) return;
        if (user.profileSync === false) markSeen(); // Nothing is kept: nothing to tell
        else setShow(true);
      }, () => {});
    };
    check();
    window.addEventListener(SIGNED_IN_EVENT, check);
    return () => {
      cancelled = true;
      window.removeEventListener(SIGNED_IN_EVENT, check);
    };
  }, []);

  if (!show || paused) return null;

  const close = () => {
    markSeen();
    setShow(false);
  };

  const turnOff = async () => {
    setBusy(true);
    setError('');
    try {
      await setProfileSync(false);
      markSeen();
      setTurnedOff(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not change it.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-interactive className="backdrop-in absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-labelledby="profile-copy-title" className="dialog-in w-full max-w-[340px] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-300"><ShieldCheck className="w-4 h-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="profile-copy-title" className="text-sm font-semibold text-slate-100">{t('A copy of your profiles is kept on your account')}</h2>
            {turnedOff ? (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t('Turned off. The copy on your Recallr account was deleted. Your profiles on this computer stay.')}</p>
            ) : (
              <div className="mt-1 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
                <p>{t('Recallr now keeps a copy of your profiles on your Recallr account: your resume, job details, notes, prepared answers and stories.')}</p>
                <p>{t('It lets you get them back on a new computer, and helps us improve Recallr.')}</p>
                <p>{t('The copy is stored encrypted. You can turn it off at any time in Settings → Data, which deletes the copy. Your profiles on this computer stay.')}</p>
              </div>
            )}
            {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {turnedOff ? (
            <Button size="sm" variant="primary" onClick={close}>{t('OK')}</Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" loading={busy} onClick={turnOff}>{t('Turn it off')}</Button>
              <Button size="sm" variant="primary" disabled={busy} onClick={close}>{t('OK')}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
