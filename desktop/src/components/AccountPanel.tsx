import React, { useEffect, useState } from 'react';
import { BookMarked, ExternalLink, Gift, Laptop, LifeBuoy, LogOut, RotateCcw } from 'lucide-react';
import { formatDate, formatMinutes, formatTokens, openWebsite } from '../services/account';
import { useAccount } from '../hooks/useAccount';
import { setSaveAnswers } from '../services/questionBank';
import { t } from '../i18n';
import { Button } from './ui';

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg bg-slate-800/50 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">{value}</div>
  </div>
);

// Who's signed in and what their plan still allows; buying happens on the website
export const AccountPanel: React.FC = () => {
  const { user, allowance, refresh, signOut } = useAccount();
  const [saveAnswers, setSave] = useState(user.saveAnswers !== false);
  const [saveError, setSaveError] = useState('');
  const toggleSave = async () => {
    const next = !saveAnswers;
    setSave(next);
    setSaveError('');
    try {
      await setSaveAnswers(next);
    } catch (error) {
      setSave(!next);
      setSaveError(error instanceof Error ? error.message : t('Could not change it.'));
    }
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-slate-200">{user.name}</div>
        <div className="text-[11px] text-slate-500">{user.email}</div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-300">{allowance.onTrial ? t('Free trial') : t('Your plan')}</span>
          <span className="text-[11px] text-slate-500">{t('until {date}', { date: formatDate(allowance.expiresAt) })}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t('Listening left')} value={formatMinutes(allowance.minutesLeft)} />
          <Stat label={t('AI answers left')} value={t('{n} tokens', { n: formatTokens(allowance.tokensLeft) })} />
        </div>
        {allowance.packs.length > 1 && (
          <ul className="space-y-1">
            {allowance.packs.map(pack => (
              <li key={pack.id} className="flex justify-between rounded-md border border-slate-800 px-2.5 py-1.5 text-[11px]">
                <span className="text-slate-300">{pack.planName}</span>
                <span className="tabular-nums text-slate-500">
                  {t('{minutes} · until {date}', { minutes: formatMinutes(pack.minutesLeft), date: formatDate(pack.expiresAt) })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">
          {t('Listening time counts only while Recallr hears speech. AI answers are counted in tokens (about 3/4 of a word each); a typical answer uses 1,500–3,000.')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/buy')}>
          {allowance.onTrial ? t('Upgrade') : t('Buy more')}
        </Button>
        <Button size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account')}>{t('Manage account')}</Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={refresh}>{t('Refresh')}</Button>
      </div>

      <div className="space-y-1.5 border-t border-slate-800 pt-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={saveAnswers} onChange={toggleSave} className="mt-0.5 accent-blue-500" />
          <span className="text-[11px] leading-relaxed text-slate-400">
            <span className="font-medium text-slate-200">{t('Save my questions and answers to my account.')}</span>{' '}
            {t('See them by category on the website (My questions) and use them to prepare. Questions are also counted, without your name, to show which ones interviewers ask most.')}
          </span>
        </label>
        {saveError && <p className="text-[11px] text-red-300">{saveError}</p>}
        <Button size="sm" variant="ghost" icon={<BookMarked className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/questions')}>{t('My questions')}</Button>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-3">
        <Button size="sm" variant="ghost" icon={<Laptop className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/devices')}>{t('Devices')}</Button>
        <Button size="sm" variant="ghost" icon={<Gift className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/invite')}>{t('Invite friends')}</Button>
        <Button size="sm" variant="ghost" icon={<LifeBuoy className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/support')}>{t('Get help')}</Button>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <Button size="sm" variant="ghost" icon={<LogOut className="w-3.5 h-3.5" />} onClick={signOut}>{t('Sign out')}</Button>
      </div>
    </div>
  );
};
