import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw, Copy, Check, FileText, FileDown, Loader2, AudioLines } from 'lucide-react';
import { reviewInterview } from '../services/ai';
import { describeAiError } from '../services/llm';
import { loadSession, saveSession, type Session } from '../services/sessions';
import { exportSession } from '../services/exportSession';
import { settingsForProfile } from '../services/storage';
import { t } from '../i18n';
import { Button, IconButton } from './ui';
import { AnswerReplay } from './AnswerReplay';

interface Props {
  sessionId: string;
  onClose: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
    {children}
  </section>
);

const CopyEmail: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? t('Copied') : t('Copy email')}
    </Button>
  );
};

// After the interview: what was asked, weak spots, what to prepare next, and a thank-you email.
// Written the first time it's opened, then kept with the conversation.
export const ReviewPanel: React.FC<Props> = ({ sessionId, onClose }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [replayOpen, setReplayOpen] = useState(false);

  const write = useCallback(async (target: Session) => {
    setWriting(true);
    setError('');
    try {
      const turns = target.turns
        .filter(turn => turn.status !== 'skipped')
        .map(turn => ({ question: turn.question, answer: turn.status === 'done' ? turn.answer : '', spoken: turn.spoken }));
      const review = await reviewInterview(turns, settingsForProfile(target.profileId));
      const updated = { ...target, review: { ...review, createdAt: Date.now() } };
      await saveSession(updated);
      setSession(updated);
    } catch (err) {
      console.error('Review error:', err);
      setError(describeAiError(err));
    } finally {
      setWriting(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSession(sessionId).then(saved => {
      if (cancelled) return;
      if (!saved) {
        setError(t('This conversation could not be loaded.'));
        return;
      }
      setSession(saved);
      if (!saved.review) write(saved);
    });
    return () => { cancelled = true; };
  }, [sessionId, write]);

  const review = session?.review;
  const email = review?.email.body ? `Subject: ${review.email.subject}\n\n${review.email.body}` : '';

  return (
    <div className="panel-in absolute inset-0 z-50 flex flex-col bg-slate-900">
      <div className="drag-area flex items-center gap-2 px-2 py-2.5 border-b border-slate-800 shrink-0">
        <IconButton onClick={onClose} title={t('Back to history')}><ArrowLeft className="w-4 h-4" /></IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-100">{t('Interview review')}</h2>
          {session && <p className="truncate text-[10px] text-slate-500">{session.title}</p>}
        </div>
        {session && (
          <>
            <IconButton title={t('Write the review again')} disabled={writing} onClick={() => write(session)}>
              <RotateCcw className="w-4 h-4" />
            </IconButton>
            <IconButton title={t('Export as Markdown (with the review)')} disabled={writing} onClick={() => exportSession(session, 'md')}>
              <FileText className="w-4 h-4" />
            </IconButton>
            <IconButton title={t('Export as PDF (with the review)')} disabled={writing} onClick={() => exportSession(session, 'pdf')}>
              <FileDown className="w-4 h-4" />
            </IconButton>
          </>
        )}
      </div>

      <div className="scrollable flex-1 min-h-0 overflow-y-auto p-4 space-y-5 select-text">
        {writing && (
          <div className="flex flex-col items-center gap-2 pt-12 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <p className="text-xs text-slate-400">{t('Reviewing the interview...')}</p>
          </div>
        )}
        {error && !writing && <p className="text-xs text-red-300">{error}</p>}

        {session && !writing && (
          <button
            onClick={() => setReplayOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5 text-left hover:border-blue-500/60"
          >
            <AudioLines className="h-4 w-4 shrink-0 text-blue-300" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-100">{t('Answer replay')}</span>
              <span className="block text-[11px] leading-relaxed text-slate-400">
                {session.turns.some(turn => turn.spoken)
                  ? t('What you said next to a stronger version, then say it again and compare.')
                  : t('Practise this interview’s questions again and get a score for each answer.')}
              </span>
            </span>
          </button>
        )}

        {review && !writing && (
          <>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {session?.turns.some(turn => turn.spoken)
                ? t('Based on the questions asked and what you actually said (heard on your microphone).')
                : t('Based on the questions asked and the answers Recallr suggested. Use "Call + mic" next time so the review can judge what you actually said.')}
            </p>

            <Section title={t('Summary')}>
              <p className="text-[13px] leading-relaxed text-slate-200">{review.summary}</p>
              {review.topics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {review.topics.map(topic => (
                    <span key={topic} className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{topic}</span>
                  ))}
                </div>
              )}
            </Section>

            {review.weakSpots.length > 0 && (
              <Section title={t('Weak spots')}>
                <ul className="space-y-2.5">
                  {review.weakSpots.map((w, i) => (
                    <li key={i} className="rounded-lg border border-slate-800 p-2.5">
                      <p className="text-xs font-medium text-slate-200">{w.question}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{w.why}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-emerald-300">{t('Next time:')} {w.fix}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {review.prepareNext.length > 0 && (
              <Section title={t('Prepare next')}>
                <ul className="space-y-1.5">
                  {review.prepareNext.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                      <span className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {email && (
              <Section title={t('Thank-you email')}>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs font-medium text-slate-200">{review.email.subject}</p>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-300">{review.email.body}</p>
                </div>
                <div className="mt-1.5 flex justify-end"><CopyEmail text={email} /></div>
              </Section>
            )}
          </>
        )}
      </div>

      {replayOpen && session && <AnswerReplay session={session} onSaved={setSession} onClose={() => setReplayOpen(false)} />}
    </div>
  );
};
