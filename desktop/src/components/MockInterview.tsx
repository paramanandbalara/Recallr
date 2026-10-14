import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, Square, SkipForward, Volume2, Loader2, RotateCcw, Gauge, MessageCircleWarning, Timer, ExternalLink } from 'lucide-react';
import { mockInterviewQuestions, scoreMockAnswer, type MockFeedback } from '../services/ai';
import { describeAiError } from '../services/llm';
import { loadActiveProfile, loadSettings } from '../services/storage';
import { openWebsite, request } from '../services/account';
import { analyzeSpeech, formatLength, PACE, type SpeakingFeedback } from '../services/speaking';
import { pastInterviewQuestions } from '../services/sessions';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { Button, IconButton } from './ui';

interface Props {
  onClose: () => void;
}

type Phase = 'setup' | 'preparing' | 'asking' | 'answering' | 'scoring' | 'feedback' | 'summary';

interface Result {
  question: string;
  answer: string;
  feedback?: MockFeedback; // Missing when the question was skipped
  speaking?: SpeakingFeedback;
}

const COUNTS = [3, 5, 8];

// An English system voice, if there is one (voices can load a moment after startup)
const pickVoice = () => {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find(v => v.lang === 'en-US' && v.localService) ?? voices.find(v => v.lang.startsWith('en')) ?? null;
};

// Read text out loud with the system's voice; resolves when done (or right away if speech isn't available)
const speak = (text: string) => new Promise<void>(resolve => {
  const synth = window.speechSynthesis;
  if (!synth) return resolve();
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  utterance.onend = () => resolve();
  utterance.onerror = () => resolve();
  synth.speak(utterance);
});

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-amber-400' : 'text-red-400');

const paceTone = (wpm: number | null) => (wpm === null ? 'text-slate-300' : wpm < PACE.slow || wpm > PACE.fast ? 'text-amber-300' : 'text-emerald-300');

// Pace, filler words and length of one answer, with what to work on
const Speaking: React.FC<{ speaking: SpeakingFeedback }> = ({ speaking }) => (
  <div className="space-y-2 rounded-lg border border-slate-800 p-2.5">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">How you spoke</div>
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <Gauge className="mx-auto h-3.5 w-3.5 text-slate-500" />
        <div className={`mt-0.5 text-sm font-semibold tabular-nums ${paceTone(speaking.wordsPerMinute)}`}>{speaking.wordsPerMinute ?? '–'}</div>
        <div className="text-[10px] text-slate-500">words / min</div>
      </div>
      <div>
        <MessageCircleWarning className="mx-auto h-3.5 w-3.5 text-slate-500" />
        <div className={`mt-0.5 text-sm font-semibold tabular-nums ${speaking.fillers >= 3 ? 'text-amber-300' : 'text-emerald-300'}`}>{speaking.fillers}</div>
        <div className="text-[10px] text-slate-500" title={speaking.fillerWords.map(f => `${f.word} ×${f.count}`).join(', ')}>
          {speaking.fillerWords.length ? speaking.fillerWords.slice(0, 2).map(f => `${f.word} ×${f.count}`).join(', ') : 'filler words'}
        </div>
      </div>
      <div>
        <Timer className="mx-auto h-3.5 w-3.5 text-slate-500" />
        <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">{formatLength(speaking.seconds)}</div>
        <div className="text-[10px] text-slate-500">{speaking.words} words</div>
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
    {feedback.good && <p className="text-xs leading-relaxed text-slate-300"><span className="font-semibold text-emerald-300">What worked: </span>{feedback.good}</p>}
    {feedback.improve && <p className="text-xs leading-relaxed text-slate-300"><span className="font-semibold text-amber-300">To improve: </span>{feedback.improve}</p>}
    {feedback.better && (
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">A stronger answer</div>
        <p className="text-xs leading-relaxed text-slate-200 select-text">{feedback.better}</p>
      </div>
    )}
  </div>
);

// Practice: questions are read out loud, you answer by voice, and each answer gets scored
export const MockInterview: React.FC<Props> = ({ onClose }) => {
  const [settings] = useState(() => loadSettings());
  const [keys] = useState(() => ({ ...settings, keepFillers: true })); // Keep "um", "uh"... for speaking feedback
  const answerStartedRef = useRef(0);
  const [saved, setSaved] = useState<'no' | 'saving' | 'yes' | 'failed'>('no');
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState(5);
  const [readAloud, setReadAloud] = useState(true);
  const [source, setSource] = useState<'new' | 'past'>('new'); // New questions, or real ones from History
  const [questions, setQuestions] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const transcriptRef = useRef('');
  const runRef = useRef(0); // Bumped when the panel closes or restarts, so late steps don't act

  const onText = useCallback((text: string) => {
    transcriptRef.current = transcriptRef.current ? `${transcriptRef.current} ${text}` : text;
    setTranscript(transcriptRef.current);
  }, []);
  const { isRecording, startRecording, stopRecording, errorMsg, audioLevel } = useAudioCapture(onText, keys, 'microphone');

  // Stop speaking and listening when the panel closes
  const stopRef = useRef(stopRecording);
  useEffect(() => { stopRef.current = stopRecording; });
  useEffect(() => () => {
    runRef.current++;
    window.speechSynthesis?.cancel();
    stopRef.current();
  }, []);

  const ask = async (list: string[], i: number) => {
    const run = runRef.current;
    setIndex(i);
    setTranscript('');
    transcriptRef.current = '';
    setPhase('asking');
    if (readAloud) await speak(list[i]);
    if (run !== runRef.current) return;
    setPhase('answering');
    answerStartedRef.current = performance.now();
    startRecording();
  };

  const start = async () => {
    const run = ++runRef.current;
    setError('');
    setResults([]);
    setSaved('no');
    setPhase('preparing');
    try {
      const list = source === 'past' ? await pastInterviewQuestions(count) : await mockInterviewQuestions(settings, count);
      if (run !== runRef.current) return;
      if (list.length === 0) {
        throw new Error(source === 'past' ? 'No past interview questions yet. They come from conversations saved in History.' : 'No questions came back. Try again.');
      }
      setQuestions(list);
      ask(list, 0);
    } catch (err) {
      if (run !== runRef.current) return;
      setError(describeAiError(err));
      setPhase('setup');
    }
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
    const seconds = (performance.now() - answerStartedRef.current) / 1000; // Until "Done answering"
    await stopRecording(true); // Wait for the last words to be transcribed
    const answer = transcriptRef.current.trim();
    const speaking = analyzeSpeech(answer, seconds);
    try {
      const feedback = await scoreMockAnswer(questions[index], answer, settings);
      if (run !== runRef.current) return;
      setResults(prev => [...prev, { question: questions[index], answer, feedback, speaking }]);
      setPhase('feedback');
    } catch (err) {
      if (run !== runRef.current) return;
      setError(describeAiError(err));
      setResults(prev => [...prev, { question: questions[index], answer, speaking }]);
      setPhase('feedback');
    }
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



  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-slate-900">
      <div className="drag-area flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Mock interview</h2>
          {['asking', 'answering', 'scoring', 'feedback'].includes(phase) && (
            <p className="text-[10px] text-slate-500">Question {index + 1} of {questions.length}</p>
          )}
        </div>
        <IconButton onClick={onClose} title="Close"><X className="w-4 h-4" /></IconButton>
      </div>

      <div className="scrollable flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {(error || errorMsg) && <p className="text-xs text-red-300">{error || errorMsg}</p>}

        {phase === 'setup' && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-400">
              Answer out loud on your microphone, then get a score
              and a stronger version of your answer.
            </p>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-300">Questions</div>
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
              <div className="mb-1.5 text-xs font-semibold text-slate-300">Questions from</div>
              <div className="flex gap-1.5">
                {([['new', 'Resume & job'], ['past', 'My past interviews']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSource(id)}
                    className={`rounded-md border px-3 py-1 text-xs ${source === id ? 'border-blue-500 bg-blue-500/10 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {source === 'past' && (
                <p className="mt-1.5 text-[11px] text-slate-500">Real questions from History, starting with the weak spots from your interview reviews.</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={readAloud} onChange={e => setReadAloud(e.target.checked)} className="accent-blue-500" />
              Read the questions out loud
            </label>
            <Button variant="primary" icon={<Mic className="w-4 h-4" />} onClick={start}>Start</Button>
          </div>
        )}

        {phase === 'preparing' && (
          <div className="flex flex-col items-center gap-2 pt-12 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <p className="text-xs text-slate-400">Preparing your questions...</p>
          </div>
        )}

        {['asking', 'answering', 'scoring', 'feedback'].includes(phase) && (
          <>
            <div className="flex gap-2">
              <p className="flex-1 text-sm font-medium leading-relaxed text-slate-100 select-text">{questions[index]}</p>
              <IconButton title="Read it again" onClick={() => speak(questions[index])} disabled={phase !== 'answering' && phase !== 'feedback'}>
                <Volume2 className="w-4 h-4" />
              </IconButton>
            </div>

            {phase === 'asking' && <p className="text-xs text-blue-300 animate-pulse">Asking...</p>}

            {(phase === 'answering' || phase === 'scoring') && (
              <div className="rounded-lg border border-slate-800 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {isRecording && <span className="h-2 w-2 rounded-full bg-red-500" style={{ opacity: 0.4 + audioLevel * 0.6 }} />}
                  Your answer
                </div>
                <p className="min-h-[3em] text-xs leading-relaxed text-slate-300 select-text">
                  {transcript || <span className="text-slate-600">{phase === 'answering' ? 'Start talking...' : ''}</span>}
                </p>
              </div>
            )}

            {phase === 'scoring' && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scoring your answer...</p>
            )}

            {phase === 'feedback' && current && (
              <>
                {current.answer && (
                  <p className="text-[11px] leading-relaxed text-slate-500 select-text"><span className="font-semibold">You said: </span>{current.answer}</p>
                )}
                {current.feedback ? <Feedback feedback={current.feedback} /> : <p className="text-xs text-slate-500">No score for this one.</p>}
                {current.speaking && current.answer && <Speaking speaking={current.speaking} />}
              </>
            )}
          </>
        )}

        {phase === 'summary' && (
          <div className="space-y-3">
            {scored.length > 0 ? (
              <div className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-semibold tabular-nums ${scoreColor(averageScore)}`}>{averageScore.toFixed(1)}</span>
                <span className="text-xs text-slate-500">/ 10 average over {scored.length} {scored.length === 1 ? 'answer' : 'answers'}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No answers were scored.</p>
            )}
            {answered.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-800/50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Average pace</div>
                  <div className={`text-sm font-semibold tabular-nums ${paceTone(averagePace === null ? null : Math.round(averagePace))}`}>
                    {averagePace === null ? '–' : `${Math.round(averagePace)} words / min`}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800/50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Filler words</div>
                  <div className={`text-sm font-semibold tabular-nums ${totalFillers / answered.length >= 3 ? 'text-amber-300' : 'text-emerald-300'}`}>{totalFillers} in {answered.length} {answered.length === 1 ? 'answer' : 'answers'}</div>
                </div>
              </div>
            )}
            <ul className="space-y-1.5">
              {results.map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-800 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-xs text-slate-200">{r.question}</span>
                    <span className={`shrink-0 text-xs font-semibold tabular-nums ${r.feedback ? scoreColor(r.feedback.score) : 'text-slate-600'}`}>
                      {r.feedback ? r.feedback.score : 'skipped'}
                    </span>
                  </div>
                  {r.feedback?.improve && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{r.feedback.improve}</p>}
                  {r.speaking && r.answer && (
                    <p className="mt-1 text-[10px] tabular-nums text-slate-500">
                      {r.speaking.wordsPerMinute ?? '–'} wpm · {r.speaking.fillers} fillers · {formatLength(r.speaking.seconds)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {saved !== 'no' && (
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                {saved === 'saving' && 'Saving to your progress…'}
                {saved === 'failed' && 'Could not save to your progress.'}
                {saved === 'yes' && (
                  <>Saved to your progress.
                    <button onClick={() => openWebsite('/account/progress')} className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300">See it over time <ExternalLink className="h-3 w-3" /></button>
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
        {['asking', 'answering', 'scoring', 'feedback'].includes(phase) ? (
          <Button size="sm" variant="ghost" onClick={endEarly}>End</Button>
        ) : <span />}
        <div className="flex gap-2">
          {phase === 'answering' && (
            <>
              <Button size="sm" variant="ghost" icon={<SkipForward className="w-3.5 h-3.5" />} onClick={skip}>Skip</Button>
              <Button size="sm" variant="primary" icon={<Square className="w-3.5 h-3.5" />} onClick={finishAnswer}>Done answering</Button>
            </>
          )}
          {phase === 'feedback' && (
            <Button size="sm" variant="primary" onClick={next}>{index + 1 < questions.length ? 'Next question' : 'See results'}</Button>
          )}
          {phase === 'summary' && (
            <Button size="sm" variant="primary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setPhase('setup')}>Practise again</Button>
          )}
        </div>
      </div>
    </div>
  );
};
