import React, { useEffect, useState } from 'react';
import { fetchAccount, isSignedIn } from '../services/account';
import { setProfileSync } from '../services/profileSync';
import { t } from '../i18n';

// Settings → Data: keep a copy of the profiles on the account (on by default). Turning it off deletes the copy.
export const ProfileSyncToggle: React.FC = () => {
  const [on, setOn] = useState<boolean | null>(null); // null: loading, or signed out
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSignedIn()) return;
    fetchAccount().then(({ user }) => setOn(user.profileSync !== false), () => setOn(null));
  }, []);

  if (on === null) return null;

  const toggle = async () => {
    const next = !on;
    if (!next && !window.confirm(t('Turn this off? The copy of your profiles on your Recallr account is deleted. Your profiles on this computer stay.'))) return;
    setBusy(true);
    setError('');
    try {
      await setProfileSync(next);
      setOn(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not change it.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1 border-b border-slate-800 pb-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" checked={on} disabled={busy} onChange={toggle} className="mt-0.5 accent-blue-500" />
        <span className="text-[11px] leading-relaxed text-slate-400">
          <span className="font-medium text-slate-200">{t('Keep a copy of my profiles in my Recallr account')}</span>{' '}
          {t('Your resume, job details, notes, prepared answers and stories, stored encrypted and updated in the background, so they can be restored and Recallr can improve. Turning it off deletes the copy.')}
        </span>
      </label>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
};
