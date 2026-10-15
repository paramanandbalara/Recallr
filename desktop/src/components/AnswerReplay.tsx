import React, { useState } from 'react';
import { ArrowLeft, Copy, Check, History, Loader2, Mic, Sparkles, Users, Volume2 } from 'lucide-react';
import { answerReplayFeedback } from '../services/practiceAi';
import { replayBaseline, replayQuestions, type ReplayItem } from '../services/answerReplay';
import { describeAiError } from '../services/llm';
import { saveSession, type Session } from '../services/sessions';
import { settingsForProfile } from '../services/storage';
import { speakEnglish } from '../services/voice';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n';
import { Button, IconButton } from './ui';
import { MockInterview } from './MockInterview';

interface Props {
  session: Session;
  onSaved: (session: Session) => void;
  onClose: () => void;
}

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-amber-400' : 'text-red-400');

// The interview's questions with what was said, keeping stronger versions already written for the same questions
const itemsFor = (session: Session): ReplayItem[] => replayQuestions(session.turns).map(q => {
  const kept = session.replay?.find(r => r.turnId === q.turnId && r.question === q.question && r.spoken === q.spoken);
  return kept?.feedback ? { ...q, feedback: kept.feedback } : q;
});

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      title={t('Copy')}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </IconButton>
  );
};

// After a real interview: "What you said" (heard on the mic in Call + mic mode) next to "A stronger version",
// then "Say it again" in the mock interview to see the before and after
export const AnswerReplay: React.FC<Props> = ({ session, onSaved, onClose }) => {
  const { allowance } = useAccount();
  const [items, setItems] = useState<ReplayItem[]>(() => itemsFor(session));
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [practising, setPractising] = useState(false);

  const outOfTokens = allowance.tokensLeft !== null && allowance.tokensLeft <= 0;
  const spoken = items.filter(item => item.spoken);
  const missing = spoken.filter(item => !item.feedback);

  // One AI call for all of them (counted against the plan), then kept with the conversation
  const write = async () => {
    setWriting(true);
    setError('');
    try {
      const feedback = await answerReplayFeedback(items, settingsForProfile(session.profileId));
      const next = items.map((item, i) => (feedback[i] ? { ...item, feedback: feedback[i] } : item));
      if (!next.some((item, i) => item.feedback && !items[i].feedback)) throw new Error(t('No feedback came back. Try again.'));
      setItems(next);
      const updated = { ...session, replay: next };
      await saveSession(updated);
      onSaved(updated);
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="panel-in absolute inset-0 z-[55] flex flex-col bg-slate-900">
      <div className="drag-area flex items-center gap-2 px-2 py-2.5 border-b border-slate-800 shrink-0">
        <IconButton onClick={onClose} title={t('Back to the review')}><ArrowLeft className="w-4 h-4" /></IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-100">{t('Answer replay')}</h2>
          <p className="truncate text-[10px] text-slate-500">{session.title}</p>
        </div>
      </div>

      <div className="scrollable flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {!spoken.length ? (
          <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300"><Users className="h-3.5 w-3.5" /> {t('Recallr did not hear your answers in this interview')}</p>
            <p className="text-[11px] leading-relaxed text-slate-300">
              {t('To compare what you said with a stronger version, Recallr needs to hear your microphone too. Next time, click the listening source next to the mic until it says “Call + mic” before the interview starts.')}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-400">{t('You can still practise these questions now and get a score for each answer.')}</p>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {t('What you said in the interview (heard on your microphone), next to a stronger version you can use next time.')}
          </p>
        )}

        {spoken.length > 0 && missing.length > 0 && (
          <div className="space-y-1.5">
            <Button variant="primary" icon={writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} onClick={write} disabled={writing || outOfTokens} className="w-full">
              {writing ? t('Writing stronger versions...') : t('Write stronger versions ({n})', { n: missing.length })}
            </Button>
            <p className="text-[11px] text-slate-500">
              {outOfTokens ? t("You've used all the AI answers in your plan. Buy a top-up to continue.") : t('One AI request for all of them, counted against your plan.')}
            </p>
          </div>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}

        <ul className="space-y-3 select-text">
          {items.map(item => (
            <li key={item.turnId} className="space-y-2 rounded-lg border border-slate-800 p-2.5">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-xs font-medium text-slate-200">{item.question}</p>
                {item.feedback && <span className={`shrink-0 text-xs font-semibold tabular-nums ${scoreColor(item.feedback.score)}`}>{item.feedback.score} / 10</span>}
              </div>
              {item.spoken ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-800/40 p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-400">{t('What you said')}</div>
                    <p className="text-[11px] leading-relaxed text-slate-300">{item.spoken}</p>
                  </div>
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      {t('A stronger version')}
                      {item.feedback && (
                        <span className="ml-auto flex">
                          <IconButton title={t('Hear it')} onClick={() => speakEnglish(item.feedback!.better)}><Volume2 className="w-3.5 h-3.5" /></IconButton>
                          <CopyButton text={item.feedback.better} />
                        </span>
                      )}
                    </div>
                    {item.feedback
                      ? <p className="text-[11px] leading-relaxed text-slate-200">{item.feedback.better}</p>
                      : <p className="text-[11px] text-slate-600">{writing ? t('Writing...') : t('Not written yet.')}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">{t('Nothing was heard from you for this question.')}</p>
              )}
              {item.feedback?.good && <p className="text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-emerald-300">{t('What was good: ')}</span>{item.feedback.good}</p>}
              {item.feedback?.fix && <p className="text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-amber-300">{t('What to fix: ')}</span>{item.feedback.fix}</p>}
            </li>
          ))}
        </ul>
        {!items.length && <p className="text-xs text-slate-400">{t('This conversation has no questions to replay.')}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
        <p className="flex items-center gap-1 text-[10px] text-slate-500"><History className="h-3 w-3" /> {t('{n} questions', { n: items.length })}</p>
        <Button size="sm" variant="primary" icon={<Mic className="w-3.5 h-3.5" />} onClick={() => setPractising(true)} disabled={!items.length || outOfTokens}>
          {t('Say it again')}
        </Button>
      </div>

      {practising && <MockInterview replay={replayBaseline(items)} onClose={() => setPractising(false)} />}
    </div>
  );
};
