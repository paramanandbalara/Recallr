import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Headphones, Keyboard, Loader2, Mic, MessageSquarePlus, SkipForward, Square, Star, Users, X } from 'lucide-react';
import { resumeInterviewQuestions } from '../services/ai';
import { ApiError } from '../services/account';
import { describeAiError } from '../services/llm';
import { loadActiveProfile, loadSettings } from '../services/storage';
import { hasUsableResume, kindLabel, RESUME_QUESTION_KINDS, type ExperienceLevel, type ResumeQuestionKind } from '../services/resumeInterview';
import {
  addQuestions, askQuestion, codeFrom, createRoom, endRoom, joinRoom, pollRoom, rateAnswer, sendAnswer, sendTranscript, setSummary,
  type PeerQuestion, type PeerRole, type PeerRoom, type PeerTurn,
} from '../services/peer';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n';
import { Button, IconButton, TextArea, TextInput } from './ui';

// "Practise with a friend": two people interview each other on any call app (Meet, Zoom, a phone call).
// Recallr shows the interviewer the questions and the candidate's answer as it's said, listens to the candidate's
// microphone in the candidate's app, and the AI scores each answer (on the candidate's plan). No audio or video
// goes between the two apps: only the room's state, polled every 1.5 seconds.

interface Props {
  onClose: () => void;
}

const POLL_MS = 1500;
const LEVEL_WORDS: Record<ExperienceLevel, string> = { fresher: 'Fresher', junior: 'Junior', mid: 'Mid-level', senior: 'Senior' };

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-amber-400' : 'text-red-400');

const Stars: React.FC<{ value: number; onChange?: (stars: number) => void }> = ({ value, onChange }) => (
  <span className="inline-flex gap-0.5">
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} title={t('{n} of 5', { n })} className="disabled:cursor-default">
        <Star className={`h-4 w-4 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
      </button>
    ))}
  </span>
);

// The AI's score and notes on one answer
const AiScore: React.FC<{ turn: PeerTurn }> = ({ turn }) => {
  if (turn.status === 'scoring') {
    return <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('The AI is scoring the answer...')}</p>;
  }
  if (turn.status === 'failed') return <p className="text-[11px] text-amber-300">{turn.aiError || t('The AI could not score this answer.')}</p>;
  if (!turn.ai) return null;
  return (
    <div className="space-y-1.5">
      {turn.ai.score !== null && (
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-semibold tabular-nums ${scoreColor(turn.ai.score)}`}>{turn.ai.score}</span>
          <span className="text-[11px] text-slate-500">/ 10 · {t('AI score')}</span>
        </div>
      )}
      {turn.ai.good && <p className="text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-emerald-300">{t('What worked: ')}</span>{turn.ai.good}</p>}
      {turn.ai.improve && <p className="text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-amber-300">{t('To improve: ')}</span>{turn.ai.improve}</p>}
      {turn.ai.better && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">{t('A stronger answer')}</summary>
          <p className="mt-1 leading-relaxed text-slate-200 select-text">{turn.ai.better}</p>
        </details>
      )}
    </div>
  );
};

// The interviewer's rating, as the candidate sees it
const Rating: React.FC<{ turn: PeerTurn; name: string }> = ({ turn, name }) => (turn.rating ? (
  <div className="space-y-0.5">
    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">{t('{name} rated it', { name })} <Stars value={turn.rating.stars} /></div>
    {turn.rating.comment && <p className="text-[11px] italic leading-relaxed text-slate-300">“{turn.rating.comment}”</p>}
  </div>
) : null);

const statusText = (turn: PeerTurn) => {
  switch (turn.status) {
    case 'asked': return t('Waiting for the answer...');
    case 'answering': return t('Answering...');
    case 'skipped': return t('Skipped');
    default: return '';
  }
};

export const PeerPractice: React.FC<Props> = ({ onClose }) => {
  const { allowance } = useAccount();
  const [settings] = useState(() => loadSettings());
  const [keys] = useState(() => ({ language: settings.language }));
  const [room, setRoom] = useState<PeerRoom | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const etagRef = useRef('');
  const codeRef = useRef('');

  // Starting
  const [hostRole, setHostRole] = useState<PeerRole>('candidate');
  const [summary, setSummaryText] = useState(() => [loadActiveProfile().name, settings.company.trim()].filter(Boolean).join(' · '));
  const [joinCode, setJoinCode] = useState('');
  const [resumeNote, setResumeNote] = useState('');

  const outOfTokens = allowance.tokensLeft !== null && allowance.tokensLeft <= 0;
  const outOfMinutes = allowance.minutesLeft !== null && allowance.minutesLeft <= 0;

  // A newer room replaces the one shown (answers to actions and polls can arrive out of order)
  const apply = useCallback((next: PeerRoom) => {
    codeRef.current = next.code;
    setRoom(prev => (!prev || prev.code !== next.code || next.updatedAt >= prev.updatedAt ? next : prev));
  }, []);

  const act = async (name: string, action: () => Promise<PeerRoom>) => {
    setBusy(name);
    setError('');
    try {
      apply(await action());
      return true;
    } catch (err) {
      setError(describeAiError(err));
      return false;
    } finally {
      setBusy('');
    }
  };

  // ---------- Polling ----------

  const scoring = room?.turns.some(turn => turn.status === 'scoring');
  const polling = !!room && (room.status !== 'ENDED' || scoring);
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const result = await pollRoom(codeRef.current, etagRef.current);
        if (stopped) return;
        if (result) {
          etagRef.current = result.etag;
          apply(result.room);
        }
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setError(err.message);
          return; // The room is gone: stop asking
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [polling, apply]);

  // ---------- The candidate: questions from their resume ----------

  // Called once the candidate is in a room: one AI call (on their plan) for questions that fit their resume
  const addResumeQuestions = (next: PeerRoom) => {
    if (next.role !== 'candidate' || next.status === 'ENDED' || !hasUsableResume(settings.cv) || outOfTokens) return;
    const code = next.code;
    setResumeNote(t('Adding questions from your resume for your friend...'));
    resumeInterviewQuestions(settings, 8)
      .then(async plan => {
        if (plan.questions.length) apply(await addQuestions(code, plan.questions.map(q => ({ text: q.question, kind: q.kind }))));
        if (!next.candidate.summary && plan.role) apply(await setSummary(code, [plan.level ? LEVEL_WORDS[plan.level] : '', plan.role].filter(Boolean).join(' ')));
        setResumeNote(plan.questions.length ? t('Your friend can now pick questions from your resume.') : '');
      })
      .catch(() => setResumeNote(''));
  };

  // ---------- The candidate: answering ----------

  const [mode, setMode] = useState<'idle' | 'voice' | 'typing' | 'sending'>('idle');
  const [typed, setTyped] = useState('');
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef('');
  const typedRef = useRef('');
  const turnRef = useRef<string | null>(null); // The question being answered
  const startedRef = useRef(0);

  const onText = useCallback((text: string) => {
    transcriptRef.current = transcriptRef.current ? `${transcriptRef.current} ${text}` : text;
    setTranscript(transcriptRef.current);
    const turnId = turnRef.current;
    if (turnId) sendTranscript(codeRef.current, turnId, transcriptRef.current).then(apply, () => {}); // Live for the interviewer
  }, [apply]);
  const { isRecording, startRecording, stopRecording, errorMsg, audioLevel } = useAudioCapture(onText, keys, 'microphone');

  const stopRef = useRef(stopRecording);
  useEffect(() => { stopRef.current = stopRecording; });
  useEffect(() => () => { stopRef.current(); }, []);

  const startAnswer = (voice: boolean) => {
    if (!room?.current) return;
    turnRef.current = room.current;
    transcriptRef.current = '';
    typedRef.current = '';
    setTranscript('');
    setTyped('');
    startedRef.current = performance.now();
    setMode(voice ? 'voice' : 'typing');
    sendTranscript(room.code, room.current, '').then(apply, () => {}); // "Answering..." for the interviewer
    if (voice) startRecording();
  };

  const switchToTyping = async () => {
    await stopRecording(true); // What was said so far stays
    typedRef.current = transcriptRef.current;
    setTyped(transcriptRef.current);
    setMode('typing');
  };

  const finishAnswer = useCallback(async () => {
    const turnId = turnRef.current;
    if (!turnId) return;
    setMode('sending');
    await stopRef.current(true); // The last words are transcribed first
    const text = (typedRef.current.trim() || transcriptRef.current).trim();
    const seconds = (performance.now() - startedRef.current) / 1000;
    turnRef.current = null;
    try {
      apply(await sendAnswer(codeRef.current, turnId, text, seconds));
      setError('');
    } catch (err) {
      setError(describeAiError(err));
    }
    setMode('idle');
  }, [apply]);

  // The interviewer moved on while an answer was still open: send what was said
  useEffect(() => {
    if (!room || room.role !== 'candidate' || !turnRef.current || (mode !== 'voice' && mode !== 'typing')) return;
    if (room.status === 'ENDED') {
      turnRef.current = null; // The room takes no more answers: just stop listening ("Practise again" resets the rest)
      void stopRef.current();
    } else if (turnRef.current !== room.current) void finishAnswer();
  }, [room, mode, finishAnswer]);

  // ---------- The interviewer ----------

  const [ownQuestion, setOwnQuestion] = useState('');
  // The rating being written, for one question (a new question starts empty)
  const [draft, setDraft] = useState({ turnId: '', stars: 0, comment: '' });

  // ---------- Starting ----------

  const enter = (name: string, action: () => Promise<PeerRoom>) => act(name, async () => {
    const next = await action();
    addResumeQuestions(next);
    return next;
  });
  const host = () => enter('host', () => createRoom(hostRole, hostRole === 'candidate' ? summary : ''));
  const join = () => enter('join', () => joinRoom(codeFrom(joinCode), summary));
  const copyInvite = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(t('Join my Recallr practice interview: {link} (code {code})', { link: room.link, code: room.code }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The code is on screen
    }
  };

  const end = async () => {
    if (mode === 'voice' || mode === 'typing') await finishAnswer();
    await act('end', () => endRoom(codeRef.current));
  };

  const close = () => {
    if (isRecording) void stopRecording();
    onClose();
  };

  // ---------- Drawing ----------

  const friend = room ? (room.host.me ? room.guest?.name : room.host.name) ?? '' : '';
  const turns = room?.turns ?? [];
  const current = turns.length ? turns[turns.length - 1] : null;
  const asked = new Set(turns.map(turn => turn.question));
  const groups: { source: PeerQuestion['source']; title: string }[] = [
    { source: 'resume', title: t('From their resume') },
    { source: 'own', title: t('Your questions') },
    { source: 'common', title: t('Common questions') },
  ];
  const nextUnasked = room?.questions.find(q => !asked.has(q.text));
  const stars = current && draft.turnId === current.id ? draft.stars : 0;
  const comment = current && draft.turnId === current.id ? draft.comment : '';
  const setStars = (n: number) => current && setDraft({ turnId: current.id, stars: n, comment });
  const setComment = (text: string) => current && setDraft({ turnId: current.id, stars, comment: text });

  return (
    <div className="panel-in absolute inset-0 z-50 flex flex-col bg-slate-900">
      <div className="drag-area flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">{t('Practise with a friend')}</h2>
          {room && (
            <p className="truncate text-[10px] text-slate-500">
              {t('Code {code}', { code: room.code })} · {room.role === 'candidate' ? t('You answer') : t('You ask')}{friend && ` · ${friend}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {room && room.status !== 'ENDED' && (
            <Button size="sm" variant="ghost" loading={busy === 'end'} onClick={end}>{t('End practice')}</Button>
          )}
          <IconButton onClick={close} title={t('Close')}><X className="h-4 w-4" /></IconButton>
        </div>
      </div>

      <div className="scrollable flex-1 min-h-0 space-y-4 overflow-y-auto p-4">
        {(error || errorMsg) && <p className="text-xs text-red-300">{error || errorMsg}</p>}

        {/* ---------- Start: host or join ---------- */}
        {!room && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-400">
              {t('Interview each other with a friend. Talk on any call app (Meet, Zoom or a phone call); Recallr gives the interviewer the questions, shows the answer as it is said, and scores it with AI.')}
            </p>
            <div className="space-y-2.5 rounded-xl border border-slate-800 p-3">
              <div className="text-xs font-semibold text-slate-300">{t('Start a practice')}</div>
              <div className="flex gap-1.5">
                {(['candidate', 'interviewer'] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => setHostRole(role)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${hostRole === role ? 'border-blue-500 bg-blue-500/10 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                  >
                    {role === 'candidate' ? t('I answer (candidate)') : t('I ask (interviewer)')}
                  </button>
                ))}
              </div>
              {hostRole === 'candidate' && (
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">{t('Shown to your friend: your role, level or the job')}</span>
                  <TextInput value={summary} onChange={e => setSummaryText(e.target.value)} maxLength={600} placeholder={t('e.g. Java developer, 2 years, applying to banks')} className="!text-xs" />
                </label>
              )}
              <Button variant="primary" icon={<Users className="h-4 w-4" />} loading={busy === 'host'} disabled={hostRole === 'candidate' && outOfTokens} onClick={host} className="w-full">
                {t('Get a code to share')}
              </Button>
              {hostRole === 'candidate' && (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {outOfTokens ? t("You've used all the AI answers in your plan. Buy a top-up to continue.") : t('The scores use your plan: AI tokens for each score, and listening time while you answer out loud.')}
                </p>
              )}
            </div>

            <div className="space-y-2.5 rounded-xl border border-slate-800 p-3">
              <div className="text-xs font-semibold text-slate-300">{t('Join a friend')}</div>
              <div className="flex gap-1.5">
                <TextInput value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder={t('6-letter code or link')} className="!text-xs uppercase tracking-widest" />
                <Button loading={busy === 'join'} disabled={codeFrom(joinCode).length !== 6} onClick={join}>{t('Join')}</Button>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">{t('You take the other role. If you answer, what you show your friend is the line above.')}</p>
            </div>
          </div>
        )}

        {/* ---------- Waiting for the friend ---------- */}
        {room && room.status === 'WAITING' && (
          <div className="space-y-3 pt-4 text-center">
            <p className="text-xs text-slate-400">{t('Share this code with your friend. They open Recallr → Practise with a friend → Join.')}</p>
            <div className="select-text font-mono text-3xl font-semibold tracking-[0.3em] text-slate-100">{room.code}</div>
            <Button size="sm" icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={copyInvite}>
              {copied ? t('Copied') : t('Copy invite')}
            </Button>
            <p className="text-[11px] text-slate-500">
              {room.role === 'candidate' ? t('Your friend can also join from the website, with the link, as the interviewer.') : t('Your friend joins from the Recallr app, because the candidate answers out loud.')}
            </p>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('Waiting for your friend to join...')}</p>
          </div>
        )}

        {resumeNote && room?.status !== 'ENDED' && <p className="text-[11px] text-slate-500">{resumeNote}</p>}

        {/* ---------- The interviewer ---------- */}
        {room && room.status === 'ACTIVE' && room.role === 'interviewer' && (
          <div className="space-y-4">
            {room.candidate.summary && (
              <p className="text-[11px] text-slate-400"><span className="font-semibold text-slate-300">{t('Candidate: ')}</span>{room.candidate.summary}</p>
            )}

            {current ? (
              <div className="space-y-2.5 rounded-xl border border-blue-500/40 bg-blue-500/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('Question {n}', { n: turns.length })} · {t('Read it out loud')}</div>
                <p className="text-sm font-medium leading-relaxed text-slate-100 select-text">{current.question}</p>
                {statusText(current) && <p className="text-[11px] text-slate-500">{statusText(current)}</p>}
                {current.transcript && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('Their answer')}</div>
                    <p className="text-xs leading-relaxed text-slate-200 select-text">{current.transcript}</p>
                  </div>
                )}
                <AiScore turn={current} />
                {current.status !== 'skipped' && (
                  <div className="space-y-1.5 border-t border-slate-800 pt-2.5">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      {t('Your rating')} <Stars value={stars || current.rating?.stars || 0} onChange={setStars} />
                    </div>
                    {current.rating && !stars ? (
                      current.rating.comment && <p className="text-[11px] italic text-slate-400">“{current.rating.comment}”</p>
                    ) : (
                      <div className="flex gap-1.5">
                        <TextInput value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} placeholder={t('A comment for them (optional)')} className="!py-1 !text-xs" />
                        <Button size="sm" disabled={!stars} loading={busy === 'rate'} onClick={() => act('rate', () => rateAnswer(room.code, current.id, stars, comment)).then(ok => { if (ok) setDraft({ turnId: '', stars: 0, comment: '' }); })}>
                          {t('Save')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">{t('{name} has joined. Ask the first question.', { name: friend })}</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              <Button variant="primary" size="sm" icon={<SkipForward className="h-3.5 w-3.5" />} loading={busy === 'next'} disabled={!nextUnasked} onClick={() => act('next', () => askQuestion(room.code, { questionId: nextUnasked!.id }))}>
                {current ? t('Next question') : t('Ask the first question')}
              </Button>
            </div>
            <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); act('own', () => askQuestion(room.code, { text: ownQuestion })).then(ok => { if (ok) setOwnQuestion(''); }); }}>
              <TextInput value={ownQuestion} onChange={e => setOwnQuestion(e.target.value)} maxLength={400} placeholder={t('Ask your own question...')} className="!py-1.5 !text-xs" />
              <Button size="sm" icon={<MessageSquarePlus className="h-3.5 w-3.5" />} loading={busy === 'own'} disabled={ownQuestion.trim().length < 3}>{t('Ask')}</Button>
            </form>

            {groups.map(group => {
              const list = room.questions.filter(q => q.source === group.source);
              if (!list.length) return null;
              return (
                <div key={group.source} className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</div>
                  {list.map(q => (
                    <div key={q.id} className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-slate-800/50">
                      <p className={`flex-1 text-[11px] leading-relaxed ${asked.has(q.text) ? 'text-slate-600' : 'text-slate-300'}`}>
                        {q.text}
                        {q.kind && (RESUME_QUESTION_KINDS as string[]).includes(q.kind) && <span className="ml-1 text-slate-500">· {kindLabel(q.kind as ResumeQuestionKind, t)}</span>}
                      </p>
                      {asked.has(q.text)
                        ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                        : <button onClick={() => act('ask', () => askQuestion(room.code, { questionId: q.id }))} disabled={!!busy} className="shrink-0 text-[11px] font-medium text-blue-400 hover:text-blue-300 disabled:opacity-40">{t('Ask')}</button>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ---------- The candidate ---------- */}
        {room && room.status === 'ACTIVE' && room.role === 'candidate' && (
          <div className="space-y-4">
            {!current ? (
              <div className="space-y-2 pt-6 text-center">
                <p className="text-sm text-slate-300">{t('{name} has joined.', { name: friend })}</p>
                <p className="text-xs text-slate-500">{t('Waiting for the first question...')}</p>
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500"><Headphones className="h-3.5 w-3.5" /> {t('Use headphones, so your microphone only hears you.')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('Question {n}', { n: turns.length })}</div>
                <p className="text-lg font-semibold leading-snug text-slate-100 select-text">{current.question}</p>

                {(current.status === 'asked' || current.status === 'answering') && mode === 'idle' && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="primary" icon={<Mic className="h-4 w-4" />} disabled={outOfMinutes} onClick={() => startAnswer(true)}>{t('Start answering')}</Button>
                    <Button icon={<Keyboard className="h-4 w-4" />} onClick={() => startAnswer(false)}>{t('Type instead')}</Button>
                    {outOfMinutes && <p className="w-full text-[11px] text-amber-300">{t("You've used all the listening time in your plan. Buy a top-up to continue.")} {t('You can still type your answers.')}</p>}
                  </div>
                )}

                {mode === 'voice' && (
                  <div className="space-y-2 rounded-xl border border-slate-800 p-3">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className={`h-2 w-2 rounded-full ${isRecording ? 'animate-pulse bg-red-500' : 'bg-slate-600'}`} />
                      {isRecording ? t('Listening to your answer...') : t('Starting the microphone...')}
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800"><span className="block h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(audioLevel * 100)}%` }} /></span>
                    </div>
                    <p className="min-h-[2.5rem] text-xs leading-relaxed text-slate-300 select-text">{transcript || t('Your words appear here as you speak.')}</p>
                    <div className="flex gap-1.5">
                      <Button variant="primary" size="sm" icon={<Square className="h-3.5 w-3.5" />} onClick={finishAnswer}>{t('Done answering')}</Button>
                      <Button size="sm" variant="ghost" icon={<Keyboard className="h-3.5 w-3.5" />} onClick={switchToTyping}>{t('Type instead')}</Button>
                    </div>
                  </div>
                )}

                {mode === 'typing' && (
                  <div className="space-y-2">
                    <TextArea rows={5} value={typed} onChange={e => { typedRef.current = e.target.value; setTyped(e.target.value); }} placeholder={t('Type your answer...')} className="!text-xs" />
                    <Button variant="primary" size="sm" disabled={!typed.trim()} onClick={finishAnswer}>{t('Done answering')}</Button>
                  </div>
                )}

                {mode === 'sending' && <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('Sending your answer...')}</p>}

                {mode === 'idle' && current.transcript && current.status !== 'asked' && current.status !== 'answering' && (
                  <div className="space-y-2.5 rounded-xl border border-slate-800 p-3">
                    <p className="text-[11px] leading-relaxed text-slate-400 select-text">{current.transcript}</p>
                    <AiScore turn={current} />
                    <Rating turn={current} name={friend} />
                    <p className="text-[11px] text-slate-500">{t('Waiting for the next question...')}</p>
                  </div>
                )}
              </div>
            )}

            {turns.length > 1 && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-200">{t('Earlier answers ({n})', { n: turns.length - 1 })}</summary>
                <div className="mt-2 space-y-3">
                  {turns.slice(0, -1).reverse().map(turn => (
                    <div key={turn.id} className="space-y-1.5 rounded-lg border border-slate-800 p-2.5">
                      <p className="font-medium text-slate-300">{turn.question}</p>
                      {turn.status === 'skipped' ? <p className="text-slate-500">{t('Skipped')}</p> : <><AiScore turn={turn} /><Rating turn={turn} name={friend} /></>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ---------- The end: a summary for both ---------- */}
        {room && room.status === 'ENDED' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-lg font-semibold tabular-nums text-slate-100">{room.summary?.answered ?? 0}/{room.summary?.asked ?? 0}</div>
                <div className="text-[10px] text-slate-500">{t('answered')}</div>
              </div>
              <div className="rounded-lg border border-slate-800 p-2">
                <div className={`text-lg font-semibold tabular-nums ${typeof room.summary?.averageScore === 'number' ? scoreColor(room.summary.averageScore) : 'text-slate-500'}`}>{room.summary?.averageScore ?? '–'}</div>
                <div className="text-[10px] text-slate-500">{t('AI score')}</div>
              </div>
              <div className="rounded-lg border border-slate-800 p-2">
                <div className="text-lg font-semibold tabular-nums text-amber-300">{room.summary?.averageRating ?? '–'}</div>
                <div className="text-[10px] text-slate-500">{t('rating (of 5)')}</div>
              </div>
            </div>
            {room.role === 'candidate' && <p className="text-[11px] text-slate-500">{t('Saved to your progress on the website.')}</p>}
            {turns.map((turn, i) => (
              <div key={turn.id} className="space-y-1.5 rounded-lg border border-slate-800 p-2.5">
                <p className="text-xs font-medium text-slate-200">{i + 1}. {turn.question}</p>
                {turn.status === 'skipped' ? <p className="text-[11px] text-slate-500">{t('Skipped')}</p> : (
                  <>
                    {turn.transcript && <p className="text-[11px] leading-relaxed text-slate-400 select-text">{turn.transcript}</p>}
                    <AiScore turn={turn} />
                    <Rating turn={turn} name={room.role === 'candidate' ? friend : t('You')} />
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-1.5">
              <Button variant="primary" onClick={() => { setRoom(null); setMode('idle'); etagRef.current = ''; codeRef.current = ''; setError(''); setResumeNote(''); }}>{t('Practise again')}</Button>
              <Button variant="ghost" onClick={close}>{t('Close')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
