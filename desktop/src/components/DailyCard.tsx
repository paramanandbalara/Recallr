import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, Flame, Mic, RotateCcw, Square } from 'lucide-react';
import { answerDaily, fetchDaily, type Daily } from '../services/daily';
import { describeAiError } from '../services/llm';
import { loadSettings } from '../services/storage';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n';
import { Button } from './ui';

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-amber-400' : 'text-red-400');

// "Question of the day" on the empty conversation screen (only while not listening): one question a day,
// answered by typing or voice, with AI feedback (counted on the plan) and the practice streak.
export const DailyCard: React.FC = () => {
  const { allowance } = useAccount();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keys] = useState(() => ({ language: loadSettings().language }));
  const textRef = useRef('');
  const outOfMinutes = allowance.minutesLeft !== null && allowance.minutesLeft <= 0;

  useEffect(() => {
    let alive = true;
    fetchDaily().then(d => { if (alive) setDaily(d); }, () => {}); // The card is extra: no card when it can't load
    return () => { alive = false; };
  }, []);

  // Spoken words are added to the answer box, which can still be edited
  const onText = useCallback((spoken: string) => {
    textRef.current = textRef.current ? `${textRef.current.trimEnd()} ${spoken}` : spoken;
    setText(textRef.current);
  }, []);
  const { isRecording, startRecording, stopRecording, errorMsg } = useAudioCapture(onText, keys, 'microphone');

  if (!daily?.question) return null;
  const question = daily.question;
  const answer = daily.answer;

  const edit = (value: string) => {
    textRef.current = value;
    setText(value);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (isRecording) await stopRecording(true);
      const result = await answerDaily(question.id, textRef.current.trim());
      setDaily(d => (d ? { ...d, answer: result.answer, streak: result.streak } : d));
      setOpen(false);
      edit('');
    } catch (err) {
      setError(describeAiError(err));
      if ((err as { code?: string }).code === 'NEW_DAY') fetchDaily().then(setDaily, () => {});
    } finally {
      setBusy(false);
    }
  };

  const tryAgain = () => {
    edit('');
    setOpen(true);
  };

  return (
    <div className="mt-6 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <CalendarCheck className="h-3.5 w-3.5" /> {t('Question of the day')}
        </span>
        {daily.streak > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300" title={t('Days in a row with practice')}>
            <Flame className="h-3.5 w-3.5" /> {daily.streak === 1 ? t('1 day') : t('{n} days', { n: daily.streak })}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-slate-200 select-text">{question.text}</p>

      {answer && !open && (
        <div className="mt-2.5 space-y-1.5">
          {answer.score !== null && (
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-semibold tabular-nums ${scoreColor(answer.score)}`}>{answer.score}</span>
              <span className="text-[11px] text-slate-500">/ 10</span>
            </div>
          )}
          {answer.feedback?.good && <p className="text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-emerald-300">{t('What worked: ')}</span>{answer.feedback.good}</p>}
          {answer.feedback?.improve && <p className="text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-amber-300">{t('To improve: ')}</span>{answer.feedback.improve}</p>}
          {answer.feedback?.better && (
            <details className="text-[11px] text-slate-400">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">{t('A stronger answer')}</summary>
              <p className="mt-1 leading-relaxed text-slate-200 select-text">{answer.feedback.better}</p>
            </details>
          )}
          <button onClick={tryAgain} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300">
            <RotateCcw className="h-3 w-3" /> {t('Try again')}
          </button>
        </div>
      )}

      {!answer && !open && (
        <button onClick={() => setOpen(true)} className="mt-2 text-[11px] font-medium text-blue-400 hover:text-blue-300">{t('Answer it (2 minutes)')}</button>
      )}

      {open && (
        <div className="mt-2.5 space-y-2">
          <textarea
            value={text}
            onChange={e => edit(e.target.value)}
            rows={4}
            placeholder={isRecording ? t('Listening... speak your answer.') : t('Type your answer, or use the mic.')}
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
          />
          {(error || errorMsg) && <p className="text-[11px] text-red-300">{error || errorMsg}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={submit}>{t('Get feedback')}</Button>
            {!outOfMinutes && (
              <Button size="sm" icon={isRecording ? <Square className="h-3 w-3" /> : <Mic className="h-3.5 w-3.5" />} onClick={() => (isRecording ? stopRecording(true) : startRecording())} disabled={busy}>
                {isRecording ? t('Stop') : t('Speak')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { if (isRecording) stopRecording(); setOpen(false); }} disabled={busy}>{t('Cancel')}</Button>
          </div>
          <p className="text-[10px] text-slate-600">{t('The feedback uses a little of your plan’s AI.')}</p>
        </div>
      )}
    </div>
  );
};
