import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, Square, SkipForward, Volume2, Loader2, RotateCcw, Gauge, MessageCircleWarning, Timer, ExternalLink, Sparkles, Keyboard, AlertTriangle, ListChecks } from 'lucide-react';
import { mockInterviewQuestions, resumeInterviewQuestions, scoreMockAnswer, type MockFeedback } from '../services/ai';
import { describeAiError } from '../services/llm';
import { loadActiveProfile, loadSettings } from '../services/storage';
import { ApiError, formatMinutes, openWebsite, request } from '../services/account';
import { analyzeSpeech, formatLength, PACE, type SpeakingFeedback } from '../services/speaking';
import { pastInterviewQuestions } from '../services/sessions';
import {
  estimateListeningMinutes, hasUsableResume, kindLabel, levelHeading, questionsToRetry, RESUME_TEST_QUESTIONS, whatToWorkOn,
  type ResumeInterview,
} from '../services/resumeInterview';
import { speakEnglish } from '../services/voice';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n';
import { Button, IconButton } from './ui';

interface Props {
  onClose: () => void;
  initialQuestions?: string[]; // From the prep pack
}

type Phase = 'setup' | 'preparing' | 'asking' | 'answering' | 'scoring' | 'feedback' | 'summary';
type Source = 'resume' | 'new' | 'past' | 'prep'; // From my resume, resume & job, real ones from History, the prep pack's

interface Result {
  question: string;
  answer: string;
  feedback?: MockFeedback; // Missing when the question was skipped
  speaking?: SpeakingFeedback; // Missing when skipped or typed
}

const COUNTS = [3, 5, 8];

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-amber-400' : 'text-red-400');

const paceTone = (wpm: number | null) => (wpm === null ? 'text-slate-300' : wpm < PACE.slow || wpm > PACE.fast ? 'text-amber-300' : 'text-emerald-300');

const buyMore = () => openWebsite('/account/buy');

const TopUp: React.FC = () => (
  <button onClick={buyMore} className="inline-flex items-center gap-0.5 font-medium text-blue-400 hover:text-blue-300">
    {t('Top up')} <ExternalLink className="h-3 w-3" />
  </button>
);

// Pace, filler words and length of one answer, with what to work on
const Speaking: React.FC<{ speaking: SpeakingFeedback }> = ({ speaking }) => (
  <div className="space-y-2 rounded-lg border border-slate-800 p-2.5">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('How you spoke')}</div>
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <Gauge className="mx-auto h-3.5 w-3.5 text-slate-500" />
        <div className={`mt-0.5 text-sm font-semibold tabular-nums ${paceTone(speaking.wordsPerMinute)}`}>{speaking.wordsPerMinute ?? '–'}</div>
        <div className="text-[10px] text-slate-500">{t('words / min')}</div>
      </div>
      <div>
        <MessageCircleWarning className="mx-auto h-3.5 w-3.5 text-slate-500" />
        <div className={`mt-0.5 text-sm font-semibold tabular-nums ${speaking.fillers >= 3 ? 'text-amber-300' : 'text-emerald-300'}`}>{speaking.fillers}</div>
        <div className="text-[10px] text-slate-500" title={speaking.fillerWords.map(f => `${f.word} ×${f.count}`).join(', ')}>
          {speaking.fillerWords.length ? speaking.fillerWords.slice(0, 2).map(f => `${f.word} ×${f.count}`).join(', ') : t('filler words')}
        </div>
      </div>
      <div>
        <Timer className="mx-auto h-3.5 w-3.5 text-slate-500" />
        <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">{formatLength(speaking.seconds)}</div>
        <div className="text-[10px] text-slate-500">{t('{n} words', { n: speaking.words })}</div>
      </div>
    </div>
    {speaking.notes.map(note => <p key={note} className="text-[11px] leading-relaxed text-slate-400">• {note}</p>)}
  </div>
);

const average = (values: (number | null | undefined)[]) => {
  const known = values.filter((v): v is number => typeof v === 'number');
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

const Feedback: React.FC<{ feedback: MockFeedback }> = ({ feedback }) => (
  <div className="space-y-2.5">
    <div className="flex items-baseline gap-1.5">
      <span className={`text-2xl font-semibold tabular-nums ${scoreColor(feedback.score)}`}>{feedback.score}</span>
      <span className="text-xs text-slate-500">/ 10</span>
    </div>
    {feedback.good && <p className="text-xs leading-relaxed text-slate-300"><span className="font-semibold text-emerald-300">{t('What worked: ')}</span>{feedback.good}</p>}
    {feedback.improve && <p className="text-xs leading-relaxed text-slate-300"><span className="font-semibold text-amber-300">{t('To improve: ')}</span>{feedback.improve}</p>}
    {feedback.better && (
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('A stronger answer')}</div>
        <p className="text-xs leading-relaxed text-slate-200 select-text">{feedback.better}</p>
      </div>
    )}
  </div>
);

// Practice: questions are read out loud, you answer by voice (or type), and each answer gets scored.
// Everything counts against the plan through the normal server calls: the questions and scores as AI tokens
// (/api/ai/chat), spoken answers as listening time (/api/ai/transcribe, with each recording's real length).
export const MockInterview: React.FC<Props> = ({ onClose, initialQuestions }) => {
  const { allowance } = useAccount();
  const [settings] = useState(() => loadSettings());
  const [keys] = useState(() => ({ ...settings, keepFillers: true })); // Keep "um", "uh"... for speaking feedback
  const answerStartedRef = useRef(0);
  const answerSecondsRef = useRef(0); // Time already spent answering before a "Repeat question"
  const [saved, setSaved] = useState<'no' | 'saving' | 'yes' | 'failed'>('no');
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState(5);
  const [readAloud, setReadAloud] = useState(true);
  const readAloudRef = useRef(true);
  const [source, setSource] = useState<Source>(initialQuestions?.length ? 'prep' : 'new');
  const [questions, setQuestions] = useState<string[]>([]);
  const [resumePlan, setResumePlan] = useState<ResumeInterview | null>(null); // Level, role and kinds, for "From my resume"
  const [index, setIndex] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [typing, setTyping] = useState(false); // Typed answers instead of the microphone
  const typingRef = useRef(false);
  const [typed, setTyped] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [planEmpty, setPlanEmpty] = useState(false); // The server said the plan ran out (402)
  const transcriptRef = useRef('');
  const runRef = useRef(0); // Bumped when the panel closes or restarts, so late steps don't act

  const hasResume = hasUsableResume(settings.cv);
  const outOfMinutes = allowance.minutesLeft !== null && allowance.minutesLeft <= 0;
  const outOfTokens = allowance.tokensLeft !== null && allowance.tokensLeft <= 0;
  const outOfMinutesRef = useRef(outOfMinutes);
  useEffect(() => { outOfMinutesRef.current = outOfMinutes; }, [outOfMinutes]);
  const estimate = estimateListeningMinutes(RESUME_TEST_QUESTIONS);

  const onText = useCallback((text: string) => {
    transcriptRef.current = transcriptRef.current ? `${transcriptRef.current} ${text}` : text;
    setTranscript(transcriptRef.current);
  }, []);
  const { isRecording, startRecording, stopRecording, errorMsg, audioLevel } = useAudioCapture(onText, keys, 'microphone');

  // No microphone (or it stopped), or no listening time left: answers are typed
  const micDown = phase === 'answering' && !!errorMsg && !isRecording;
  const typingNow = typing || micDown || outOfMinutes;

  // Stop speaking and listening when the panel closes
  const stopRef = useRef(stopRecording);
  useEffect(() => { stopRef.current = stopRecording; });
  useEffect(() => () => {
    runRef.current++;
    window.speechSynthesis?.cancel();
    stopRef.current();
  }, []);

  const changeReadAloud = (value: boolean) => {
    readAloudRef.current = value;
    setReadAloud(value);
  };

  const showError = (err: unknown) => {
    setError(describeAiError(err));
    setPlanEmpty(err instanceof ApiError && err.status === 402);
  };

  // Start listening for the answer (unless it's typed)
  const listen = () => {
    setPhase('answering');
    answerStartedRef.current = performance.now();
    if (!typingRef.current && !outOfMinutesRef.current) startRecording();
  };

  const ask = async (list: string[], i: number) => {
    const run = runRef.current;
    setIndex(i);
    setTranscript('');
    transcriptRef.current = '';
    setTyped('');
    answerSecondsRef.current = 0;
    setPhase('asking');
    if (readAloudRef.current) await speakEnglish(list[i]);
    if (run !== runRef.current) return;
    listen();
  };

  // `given`: practise these exact questions again (keeps the resume's level and role)
  const begin = async (from: Source, n: number, given?: string[]) => {
    const run = ++runRef.current;
    setError('');
    setPlanEmpty(false);
    setResults([]);
    setSaved('no');
    if (!given) setResumePlan(null);
    if (from === 'resume' && !given && !hasResume) {
      setPhase('setup');
      setError(t('There is no resume in this profile yet. Add it in Settings → Profile → Resume, then start the test.'));
      return;
    }
    setPhase('preparing');
    try {
      let list: string[];
      if (given) list = given;
      else if (from === 'resume') {
        const plan = await resumeInterviewQuestions(settings, n);
        if (run !== runRef.current) return;
        setResumePlan(plan);
        list = plan.questions.map(q => q.question);
      } else if (from === 'prep') list = initialQuestions!.slice(0, n);
      else if (from === 'past') list = await pastInterviewQuestions(n);
      else list = await mockInterviewQuestions(settings, n);
      if (run !== runRef.current) return;
      if (list.length === 0) {
        throw new Error(from === 'past' ? t('No past interview questions yet. They come from conversations saved in History.') : t('No questions came back. Try again.'));
      }
      setQuestions(list);
      ask(list, 0);
    } catch (err) {
      if (run !== runRef.current) return;
      showError(err);
      setPhase('setup');
    }
  };

  // The one button: questions from the resume, read out loud, answered by voice
  const testFromResume = () => {
    setSource('resume');
    changeReadAloud(true);
    begin('resume', RESUME_TEST_QUESTIONS);
  };

  // The results go to the account (website → Progress, and the coach of a college group): scores and
  // speaking numbers only, never what was said
  const resultsRef = useRef(results);
  useEffect(() => { resultsRef.current = results; }, [results]);
  const showSummary = () => {
    setPhase('summary');
    const done = resultsRef.current.filter(r => r.speaking && r.answer);
    if (!done.length) return;
    setSaved('saving');
    request('/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: loadActiveProfile().name,
        answers: done.map(r => ({
          question: r.question, score: r.feedback?.score ?? null, wordsPerMinute: r.speaking!.wordsPerMinute,
          fillers: r.speaking!.fillers, seconds: r.speaking!.seconds,
        })),
      }),
    }).then(() => setSaved('yes'), () => setSaved('failed'));
  };

  const next = () => {
    if (index + 1 < questions.length) ask(questions, index + 1);
    else showSummary();
  };

  const finishAnswer = async () => {
    const run = runRef.current;
    setPhase('scoring');
    const seconds = answerSecondsRef.current + (performance.now() - answerStartedRef.current) / 1000; // Until "Done answering"
    await stopRecording(true); // Wait for the last words to be transcribed
    const spoken = !typingNow;
    const answer = (spoken ? transcriptRef.current : [transcriptRef.current, typed].filter(Boolean).join(' ')).trim();
    const speaking = spoken ? analyzeSpeech(answer, seconds, t) : undefined;
    try {
      const feedback = await scoreMockAnswer(questions[index], answer, settings);
      if (run !== runRef.current) return;
      setResults(prev => [...prev, { question: questions[index], answer, feedback, speaking }]);
      setPhase('feedback');
    } catch (err) {
      if (run !== runRef.current) return;
      showError(err);
      setResults(prev => [...prev, { question: questions[index], answer, speaking }]);
      setPhase('feedback');
    }
  };

  // Read the question again; while answering, the microphone pauses so it doesn't hear the question
  const repeatQuestion = async () => {
    if (phase !== 'answering') {
      speakEnglish(questions[index]);
      return;
    }
    const run = runRef.current;
    answerSecondsRef.current += (performance.now() - answerStartedRef.current) / 1000;
    setPhase('asking');
    await stopRecording(true); // Keeps what was said so far
    await speakEnglish(questions[index]);
    if (run !== runRef.current) return;
    listen();
  };

  const typeInstead = async () => {
    typingRef.current = true;
    setTyping(true);
    await stopRecording(true); // What was said so far stays in the answer
  };

  const speakInstead = () => {
    typingRef.current = false;
    setTyping(false);
    if (typed.trim()) {
      transcriptRef.current = [transcriptRef.current, typed.trim()].filter(Boolean).join(' ');
      setTranscript(transcriptRef.current);
      setTyped('');
    }
    if (phase === 'answering' && !outOfMinutes) startRecording();
  };

  const skip = async () => {
    window.speechSynthesis?.cancel();
    await stopRecording();
    setResults(prev => [...prev, { question: questions[index], answer: '' }]);
    next();
  };

  const endEarly = async () => {
    runRef.current++;
    window.speechSynthesis?.cancel();
    await stopRecording();
    showSummary();
  };

  const scored = results.filter(r => r.feedback);
  const averageScore = average(scored.map(r => r.feedback!.score)) ?? 0;
  const answered = results.filter(r => r.speaking && r.answer);
  const averagePace = average(answered.map(r => r.speaking!.wordsPerMinute));
  const totalFillers = answered.reduce((sum, r) => sum + r.speaking!.fillers, 0);
  const current = results[results.length - 1];
  const inQuestion = ['asking', 'answering', 'scoring', 'feedback'].includes(phase);
  const heading = resumePlan ? levelHeading(resumePlan.level, resumePlan.role, t) : '';
  const kindOf = (question: string) => resumePlan?.questions.find(q => q.question === question)?.kind;
  const currentKind = inQuestion ? kindOf(questions[index]) : undefined;
  const testAnswers = results.map(r => ({
    question: r.question, answer: r.answer, score: r.feedback?.score, improve: r.feedback?.improve, speaking: r.speaking,
  }));
  const workOn = phase === 'summary' ? whatToWorkOn(testAnswers, t) : [];
  const retry = phase === 'summary' ? questionsToRetry(testAnswers) : [];

  return (
    <div className="panel-in absolute inset-0 z-50 flex flex-col bg-slate-900">
      <div className="drag-area flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">{t('Mock interview')}</h2>
          {inQuestion && (
            <p className="truncate text-[10px] text-slate-500">
              {t('Question {n} of {total}', { n: index + 1, total: questions.length })}{heading && ` · ${heading}`}
            </p>
          )}
        </div>
        <IconButton onClick={onClose} title={t('Close')}><X className="w-4 h-4" /></IconButton>
      </div>

      <div className="scrollable flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {(error || errorMsg) && (
          <p className="text-xs text-red-300">
            {error || errorMsg}
            {planEmpty && <> <TopUp /></>}
          </p>
        )}

        {phase === 'setup' && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-blue-500/40 bg-blue-500/5 p-3">
              <Button variant="primary" icon={<Sparkles className="w-4 h-4" />} onClick={testFromResume} disabled={!hasResume || outOfTokens} className="w-full">
                {t('Test interview from my resume')}
              </Button>
              <p className="text-[11px] leading-relaxed text-slate-400">
                {t('{n} questions on your skills, projects and experience level, read out loud. Answer by voice, or type if there is no microphone.', { n: RESUME_TEST_QUESTIONS })}
              </p>
              {!hasResume && (
                <p className="flex gap-1.5 text-[11px] leading-relaxed text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t('There is no resume in this profile yet. Add it in Settings → Profile → Resume, then start the test.')}
                </p>
              )}
              {outOfTokens ? (
                <p className="text-[11px] leading-relaxed text-amber-300">{t("You've used all the AI answers in your plan. Buy a top-up to continue.")} <TopUp /></p>
              ) : outOfMinutes ? (
                <p className="text-[11px] leading-relaxed text-amber-300">
                  {t("You've used all the listening time in your plan. Buy a top-up to continue.")} {t('You can still type your answers.')} <TopUp />
                </p>
              ) : (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {t('Uses your plan: about {n} min of listening for your spoken answers, plus some AI tokens for the questions and scores.', { n: estimate })}
                  {allowance.minutesLeft !== null && allowance.minutesLeft < estimate && (
                    <> {t('You have {time} of listening left.', { time: formatMinutes(allowance.minutesLeft) })} <TopUp /></>
                  )}
                </p>
              )}
            </div>

            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('Or set up your own practice')}</div>
            <p className="text-xs leading-relaxed text-slate-400">
              {t('Answer out loud on your microphone, then get a score and a stronger version of your answer.')}
            </p>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-300">{t('Questions')}</div>
              <div className="flex gap-1.5">
                {COUNTS.map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`rounded-md border px-3 py-1 text-xs ${count === n ? 'border-blue-500 bg-blue-500/10 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-300">{t('Questions from')}</div>
              <div className="flex flex-wrap gap-1.5">
                {([['resume', 'From my resume'], ['new', 'Resume & job'], ['past', 'My past interviews'], ...(initialQuestions?.length ? [['prep', 'Prep pack']] as const : [])] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSource(id)}
                    className={`rounded-md border px-3 py-1 text-xs ${source === id ? 'border-blue-500 bg-blue-500/10 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              {source === 'resume' && (
                <p className="mt-1.5 text-[11px] text-slate-500">{t('Tailored to you: your named projects, your skills and your experience level.')}</p>
              )}
              {source === 'past' && (
                <p className="mt-1.5 text-[11px] text-slate-500">{t('Real questions from History, starting with the weak spots from your interview reviews.')}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={readAloud} onChange={e => changeReadAloud(e.target.checked)} className="accent-blue-500" />
              {t('Read the questions out loud')}
            </label>
            <Button icon={<Mic className="w-4 h-4" />} onClick={() => begin(source, count)} disabled={outOfTokens}>{t('Start')}</Button>
          </div>
        )}

        {phase === 'preparing' && (
          <div className="flex flex-col items-center gap-2 pt-12 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <p className="text-xs text-slate-400">{source === 'resume' ? t('Reading your resume and preparing your questions...') : t('Preparing your questions...')}</p>
          </div>
        )}

        {inQuestion && (
          <>
            <div className="space-y-1.5">
              {currentKind && (
                <span className="inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">{kindLabel(currentKind, t)}</span>
              )}
              <p className="text-sm font-medium leading-relaxed text-slate-100 select-text">{questions[index]}</p>
              <Button size="sm" variant="ghost" icon={<Volume2 className="w-3.5 h-3.5" />} onClick={repeatQuestion} disabled={phase !== 'answering' && phase !== 'feedback'} className="-ml-2.5">
                {t('Repeat question')}
              </Button>
            </div>

            {phase === 'asking' && <p className="text-xs text-blue-300 animate-pulse">{t('Asking...')}</p>}

            {(phase === 'answering' || phase === 'scoring' || (phase === 'asking' && transcript)) && (
              typingNow && phase !== 'asking' ? (
                <div className="space-y-1.5">
                  {micDown && <p className="text-[11px] text-amber-300">{t('The microphone is not available. Type your answer instead.')}</p>}
                  {outOfMinutes && (
                    <p className="text-[11px] text-amber-300">{t("You've used all the listening time in your plan. Buy a top-up to continue.")} <TopUp /></p>
                  )}
                  {transcript && <p className="text-[11px] leading-relaxed text-slate-500 select-text">{transcript}</p>}
                  <textarea
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    disabled={phase !== 'answering'}
                    autoFocus
                    rows={6}
                    placeholder={t('Type your answer the way you would say it...')}
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {isRecording && <span className="h-2 w-2 rounded-full bg-red-500" style={{ opacity: 0.4 + audioLevel * 0.6 }} />}
                    {t('Your answer')}
                  </div>
                  <p className="min-h-[3em] text-xs leading-relaxed text-slate-300 select-text">
                    {transcript || <span className="text-slate-600">{phase === 'answering' ? t('Start talking...') : ''}</span>}
                  </p>
                </div>
              )
            )}

            {phase === 'answering' && (
              typingNow ? (
                !micDown && !outOfMinutes && (
                  <button onClick={speakInstead} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"><Mic className="h-3 w-3" /> {t('Answer by voice instead')}</button>
                )
              ) : (
                <button onClick={typeInstead} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"><Keyboard className="h-3 w-3" /> {t('Type instead')}</button>
              )
            )}

            {phase === 'scoring' && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('Scoring your answer...')}</p>
            )}

            {phase === 'feedback' && current && (
              <>
                {current.answer && (
                  <p className="text-[11px] leading-relaxed text-slate-500 select-text"><span className="font-semibold">{t('You said: ')}</span>{current.answer}</p>
                )}
                {current.feedback ? <Feedback feedback={current.feedback} /> : <p className="text-xs text-slate-500">{t('No score for this one.')}</p>}
                {current.speaking && current.answer && <Speaking speaking={current.speaking} />}
              </>
            )}
          </>
        )}

        {phase === 'summary' && (
          <div className="space-y-3">
            {heading && <p className="text-[11px] font-medium text-slate-400">{heading}</p>}
            {scored.length > 0 ? (
              <div className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-semibold tabular-nums ${scoreColor(averageScore)}`}>{averageScore.toFixed(1)}</span>
                <span className="text-xs text-slate-500">{scored.length === 1 ? t('/ 10 average over 1 answer') : t('/ 10 average over {n} answers', { n: scored.length })}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">{t('No answers were scored.')}</p>
            )}
            {answered.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-800/50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('Average pace')}</div>
                  <div className={`text-sm font-semibold tabular-nums ${paceTone(averagePace === null ? null : Math.round(averagePace))}`}>
                    {averagePace === null ? '–' : t('{n} words / min', { n: Math.round(averagePace) })}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800/50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('Filler words')}</div>
                  <div className={`text-sm font-semibold tabular-nums ${totalFillers / answered.length >= 3 ? 'text-amber-300' : 'text-emerald-300'}`}>{answered.length === 1 ? t('{fillers} in 1 answer', { fillers: totalFillers }) : t('{fillers} in {n} answers', { fillers: totalFillers, n: answered.length })}</div>
                </div>
              </div>
            )}
            {workOn.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  <ListChecks className="h-3.5 w-3.5" /> {t('What to work on')}
                </div>
                <ul className="space-y-1">
                  {workOn.map(item => <li key={item} className="text-[11px] leading-relaxed text-slate-300">• {item}</li>)}
                </ul>
              </div>
            )}
            <ul className="space-y-1.5">
              {results.map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-800 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-xs text-slate-200">{r.question}</span>
                    <span className={`shrink-0 text-xs font-semibold tabular-nums ${r.feedback ? scoreColor(r.feedback.score) : 'text-slate-600'}`}>
                      {r.feedback ? r.feedback.score : t('skipped')}
                    </span>
                  </div>
                  {r.feedback?.improve && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{r.feedback.improve}</p>}
                  {r.speaking && r.answer && (
                    <p className="mt-1 text-[10px] tabular-nums text-slate-500">
                      {t('{wpm} wpm · {fillers} fillers · {length}', { wpm: r.speaking.wordsPerMinute ?? '–', fillers: r.speaking.fillers, length: formatLength(r.speaking.seconds) })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {saved !== 'no' && (
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                {saved === 'saving' && t('Saving to your progress…')}
                {saved === 'failed' && t('Could not save to your progress.')}
                {saved === 'yes' && (
                  <>{t('Saved to your progress.')}
                    <button onClick={() => openWebsite('/account/progress')} className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300">{t('See it over time')} <ExternalLink className="h-3 w-3" /></button>
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
        {inQuestion ? (
          <Button size="sm" variant="ghost" onClick={endEarly}>{t('End')}</Button>
        ) : phase === 'summary' ? (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setPhase('setup')}>{t('Practise again')}</Button>
        ) : <span />}
        <div className="flex gap-2">
          {phase === 'answering' && (
            <>
              <Button size="sm" variant="ghost" icon={<SkipForward className="w-3.5 h-3.5" />} onClick={skip}>{t('Skip')}</Button>
              <Button size="sm" variant="primary" icon={<Square className="w-3.5 h-3.5" />} onClick={finishAnswer}>{t('Done answering')}</Button>
            </>
          )}
          {phase === 'feedback' && (
            <Button size="sm" variant="primary" onClick={next}>{index + 1 < questions.length ? t('Next question') : t('See results')}</Button>
          )}
          {phase === 'summary' && retry.length > 0 && (
            <Button size="sm" variant="primary" icon={<Mic className="w-3.5 h-3.5" />} onClick={() => begin(source, retry.length, retry)} disabled={outOfTokens}>
              {t('Practise these again')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
