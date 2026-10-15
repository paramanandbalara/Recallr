import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BadgeIndianRupee, Check, ExternalLink, Keyboard, Loader2, Mic, RotateCcw, Send, Volume2, X } from 'lucide-react';
import { negotiationDebrief, negotiationHrTurn } from '../services/practiceAi';
import {
  cleanSetup, emptySetup, estimateNegotiationMinutes, MAX_REPLIES, missingSetup, repliesSoFar,
  type Market, type NegotiationSetup, type NegotiationSummary, type NegotiationTurn,
} from '../services/salaryNegotiation';
import { describeAiError } from '../services/llm';
import { loadSettings } from '../services/storage';
import { ApiError, openWebsite, request } from '../services/account';
import { speakEnglish } from '../services/voice';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n';
import { Button, IconButton, TextInput } from './ui';

interface Props {
  onBack: () => void; // Back to the mock interview's start screen
  onClose: () => void;
}

type Phase = 'setup' | 'thinking' | 'speaking' | 'answering' | 'debriefing' | 'debrief';

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-400' : score >= 5 ? 'text-amber-400' : 'text-red-400');

const MISSING: Record<'role' | 'offer' | 'target', () => string> = {
  role: () => t('Add the role you are being offered.'),
  offer: () => t('Add the offer amount.'),
  target: () => t('Add the amount you want.'),
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-semibold text-slate-300">{label}{hint && <span className="ml-1 font-normal text-slate-500">{hint}</span>}</span>
    {children}
  </label>
);

// Salary negotiation practice: the AI plays the recruiter making an offer and pushing back, out loud; the user
// negotiates by voice (or typing), turn by turn, then gets a score, what worked, what cost money and better lines.
// Counts against the plan like the mock interview: AI tokens through /api/ai/chat, spoken replies as listening time.
export const SalaryPractice: React.FC<Props> = ({ onBack, onClose }) => {
  const { allowance } = useAccount();
  const [settings] = useState(() => loadSettings());
  const [setup, setSetup] = useState<NegotiationSetup>(() => ({ ...emptySetup(), company: settings.company.trim() }));
  const [phase, setPhase] = useState<Phase>('setup');
  const [turns, setTurns] = useState<NegotiationTurn[]>([]);
  const [offerNow, setOfferNow] = useState('');
  const [summary, setSummary] = useState<NegotiationSummary | null>(null);
  const [saved, setSaved] = useState<'no' | 'saving' | 'yes' | 'failed'>('no');
  const [error, setError] = useState('');
  const [planEmpty, setPlanEmpty] = useState(false);
  const [readAloud, setReadAloud] = useState(true);
  const readAloudRef = useRef(true);
  const [typing, setTyping] = useState(false);
  const typingRef = useRef(false);
  const [typed, setTyped] = useState('');
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef('');
  const runRef = useRef(0); // Bumped when the panel closes or restarts, so late steps don't act
  const turnsRef = useRef<NegotiationTurn[]>([]);
  const setupRef = useRef(setup);
  const bottomRef = useRef<HTMLDivElement>(null);

  const outOfMinutes = allowance.minutesLeft !== null && allowance.minutesLeft <= 0;
  const outOfTokens = allowance.tokensLeft !== null && allowance.tokensLeft <= 0;
  const outOfMinutesRef = useRef(outOfMinutes);
  useEffect(() => { outOfMinutesRef.current = outOfMinutes; }, [outOfMinutes]);

  const onText = useCallback((text: string) => {
    transcriptRef.current = transcriptRef.current ? `${transcriptRef.current} ${text}` : text;
    setTranscript(transcriptRef.current);
  }, []);
  const { isRecording, startRecording, stopRecording, errorMsg, audioLevel } = useAudioCapture(onText, settings, 'microphone');

  const micDown = phase === 'answering' && !!errorMsg && !isRecording;
  const typingNow = typing || micDown || outOfMinutes;

  const stopRef = useRef(stopRecording);
  useEffect(() => { stopRef.current = stopRecording; });
  useEffect(() => () => {
    runRef.current++;
    window.speechSynthesis?.cancel();
    stopRef.current();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [turns.length, phase]);

  const update = (field: keyof NegotiationSetup) => (e: React.ChangeEvent<HTMLInputElement>) => setSetup(prev => ({ ...prev, [field]: e.target.value }));
  const setMarket = (market: Market) => setSetup(prev => ({ ...prev, market }));

  const showError = (err: unknown) => {
    setError(describeAiError(err));
    setPlanEmpty(err instanceof ApiError && err.status === 402);
  };

  const pushTurn = (turn: NegotiationTurn) => {
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
  };

  const listen = () => {
    transcriptRef.current = '';
    setTranscript('');
    setTyped('');
    setPhase('answering');
    if (!typingRef.current && !outOfMinutesRef.current) startRecording();
  };

  // Keep the verdict and the call on the account, as a career report (only the user sees it)
  const save = (finalSummary: NegotiationSummary) => {
    setSaved('saving');
    request('/practice/salary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setup: setupRef.current,
        result: { ...finalSummary, turns: turnsRef.current.slice(-40).map(turn => ({ who: turn.who, text: turn.text.slice(0, 4000) })) },
      }),
    }).then(() => setSaved('yes'), () => setSaved('failed'));
  };

  const debrief = async () => {
    const run = ++runRef.current;
    window.speechSynthesis?.cancel();
    await stopRecording();
    if (!repliesSoFar(turnsRef.current)) {
      setPhase('setup');
      return;
    }
    setPhase('debriefing');
    try {
      const result = await negotiationDebrief(setupRef.current, turnsRef.current);
      if (run !== runRef.current) return;
      setSummary(result);
      setPhase('debrief');
      save(result);
    } catch (err) {
      if (run !== runRef.current) return;
      showError(err);
      setPhase('debrief');
    }
  };

  // The recruiter's next line: shown, read out, then it's the user's turn (or the call is over)
  const recruiterSays = async () => {
    const run = runRef.current;
    setPhase('thinking');
    try {
      const turn = await negotiationHrTurn(setupRef.current, turnsRef.current);
      if (run !== runRef.current) return;
      if (!turn.say) throw new Error(t('The recruiter had nothing to say. Try again.'));
      pushTurn({ who: 'hr', text: turn.say });
      if (turn.offer) setOfferNow(turn.offer);
      if (readAloudRef.current) {
        setPhase('speaking');
        await speakEnglish(turn.say);
        if (run !== runRef.current) return;
      }
      if (turn.done) debrief();
      else listen();
    } catch (err) {
      if (run !== runRef.current) return;
      showError(err);
      setPhase(turnsRef.current.length ? 'answering' : 'setup');
    }
  };

  const start = () => {
    const clean = cleanSetup(setup);
    const missing = missingSetup(clean);
    if (missing) {
      setError(MISSING[missing]());
      return;
    }
    runRef.current++;
    setupRef.current = clean;
    turnsRef.current = [];
    setTurns([]);
    setOfferNow(clean.offer);
    setSummary(null);
    setSaved('no');
    setError('');
    setPlanEmpty(false);
    recruiterSays();
  };

  const sendReply = async () => {
    setPhase('thinking');
    await stopRecording(true); // Wait for the last words to be transcribed
    const reply = [transcriptRef.current, typed].map(s => s.trim()).filter(Boolean).join(' ');
    if (!reply) {
      setError(t('Say or type your reply first.'));
      listen();
      return;
    }
    setError('');
    pushTurn({ who: 'you', text: reply });
    recruiterSays();
  };

  const repeatLine = () => {
    const last = [...turnsRef.current].reverse().find(turn => turn.who === 'hr');
    if (last) speakEnglish(last.text);
  };

  const typeInstead = async () => {
    typingRef.current = true;
    setTyping(true);
    await stopRecording(true); // What was said so far stays in the reply
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

  const again = () => {
    runRef.current++;
    setPhase('setup');
    setTurns([]);
    turnsRef.current = [];
    setSummary(null);
    setError('');
  };

  const replies = repliesSoFar(turns);
  const inCall = ['thinking', 'speaking', 'answering'].includes(phase);
  const india = setup.market === 'india';

  return (
    <div className="panel-in absolute inset-0 z-[55] flex flex-col bg-slate-900">
      <div className="drag-area flex items-center gap-2 border-b border-slate-800 px-2 py-2.5 shrink-0">
        <IconButton onClick={onBack} title={t('Back')}><ArrowLeft className="w-4 h-4" /></IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-100">{t('Salary negotiation practice')}</h2>
          {inCall && (
            <p className="truncate text-[10px] text-slate-500">
              {t('Reply {n} of up to {max}', { n: Math.min(replies + 1, MAX_REPLIES), max: MAX_REPLIES })}{offerNow && ` · ${t('On the table: {offer}', { offer: offerNow })}`}
            </p>
          )}
        </div>
        <IconButton onClick={onClose} title={t('Close')}><X className="w-4 h-4" /></IconButton>
      </div>

      <div className="scrollable flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {(error || (inCall && errorMsg)) && (
          <p className="text-xs text-red-300">
            {error || errorMsg}
            {planEmpty && <> <button onClick={() => openWebsite('/account/buy')} className="inline-flex items-center gap-0.5 font-medium text-blue-400 hover:text-blue-300">{t('Top up')} <ExternalLink className="h-3 w-3" /></button></>}
          </p>
        )}

        {phase === 'setup' && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-400">
              {t('The AI plays the recruiter: it makes the offer, pushes back and reacts to what you say. Negotiate out loud (or type), then get a score, what worked, what cost you money and better lines to use.')}
            </p>
            <div className="flex gap-1.5">
              {([['india', 'India (CTC, LPA)'], ['global', 'Global']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setMarket(id)}
                  className={`rounded-md border px-3 py-1 text-xs ${setup.market === id ? 'border-blue-500 bg-blue-500/10 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={t('Role')}><TextInput value={setup.role} onChange={update('role')} placeholder={t('e.g. Backend engineer')} className="!py-1.5 text-xs" /></Field>
              <Field label={t('City')}><TextInput value={setup.city} onChange={update('city')} placeholder={india ? t('e.g. Bengaluru') : t('e.g. London')} className="!py-1.5 text-xs" /></Field>
              <Field label={t('Their offer')}><TextInput value={setup.offer} onChange={update('offer')} placeholder={india ? t('e.g. 16 LPA') : t('e.g. $120k base')} className="!py-1.5 text-xs" /></Field>
              <Field label={t('What you want')}><TextInput value={setup.target} onChange={update('target')} placeholder={india ? t('e.g. 20 LPA') : t('e.g. $140k base')} className="!py-1.5 text-xs" /></Field>
              <Field label={t('Current pay')} hint={t('(optional)')}><TextInput value={setup.currentCtc} onChange={update('currentCtc')} placeholder={india ? t('e.g. 12 LPA') : t('e.g. $100k')} className="!py-1.5 text-xs" /></Field>
              <Field label={t('Notice period')}><TextInput value={setup.noticePeriod} onChange={update('noticePeriod')} placeholder={t('e.g. 60 days')} className="!py-1.5 text-xs" /></Field>
            </div>
            <Field label={t('Other offers')} hint={t('(optional)')}>
              <TextInput value={setup.otherOffers} onChange={update('otherOffers')} placeholder={t('e.g. 18 LPA from another product company')} className="!py-1.5 text-xs" />
            </Field>
            {setup.company && <p className="text-[11px] text-slate-500">{t('The recruiter is from {company} (your profile’s company).', { company: setup.company })}</p>}
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={readAloud} onChange={e => { readAloudRef.current = e.target.checked; setReadAloud(e.target.checked); }} className="accent-blue-500" />
              {t('Read the recruiter’s lines out loud')}
            </label>
            {outOfTokens ? (
              <p className="text-[11px] leading-relaxed text-amber-300">{t("You've used all the AI answers in your plan. Buy a top-up to continue.")}</p>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-500">
                {t('Uses your plan: about {n} min of listening for your spoken replies, plus some AI tokens for the recruiter and the feedback.', { n: estimateNegotiationMinutes() })}
                {outOfMinutes && <> {t('You can still type your answers.')}</>}
              </p>
            )}
          </div>
        )}

        {(inCall || phase === 'debriefing' || phase === 'debrief') && turns.length > 0 && (
          <ul className="space-y-2">
            {turns.map((turn, i) => (
              <li key={i} className={`rounded-lg px-3 py-2 text-xs leading-relaxed select-text ${turn.who === 'hr' ? 'border border-slate-800 bg-slate-950/40 text-slate-200' : 'ml-6 bg-blue-500/10 text-slate-200'}`}>
                <div className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${turn.who === 'hr' ? 'text-slate-500' : 'text-blue-300'}`}>
                  {turn.who === 'hr' ? t('Recruiter') : t('You')}
                </div>
                {turn.text}
              </li>
            ))}
          </ul>
        )}

        {phase === 'thinking' && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('The recruiter is thinking...')}</p>
        )}
        {phase === 'speaking' && <p className="text-xs text-blue-300 animate-pulse">{t('The recruiter is speaking...')}</p>}

        {phase === 'answering' && (
          typingNow ? (
            <div className="space-y-1.5">
              {micDown && <p className="text-[11px] text-amber-300">{t('The microphone is not available. Type your answer instead.')}</p>}
              {transcript && <p className="text-[11px] leading-relaxed text-slate-500 select-text">{transcript}</p>}
              <textarea
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoFocus
                rows={4}
                placeholder={t('Type your reply the way you would say it...')}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
              />
              {!micDown && !outOfMinutes && (
                <button onClick={speakInstead} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"><Mic className="h-3 w-3" /> {t('Answer by voice instead')}</button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="rounded-lg border border-slate-800 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {isRecording && <span className="h-2 w-2 rounded-full bg-red-500" style={{ opacity: 0.4 + audioLevel * 0.6 }} />}
                  {t('Your reply')}
                </div>
                <p className="min-h-[2.5em] text-xs leading-relaxed text-slate-300 select-text">
                  {transcript || <span className="text-slate-600">{t('Start talking...')}</span>}
                </p>
              </div>
              <button onClick={typeInstead} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"><Keyboard className="h-3 w-3" /> {t('Type instead')}</button>
            </div>
          )
        )}

        {phase === 'debriefing' && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('Your coach is reviewing the call...')}</p>
        )}

        {phase === 'debrief' && summary && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-3xl font-semibold tabular-nums ${scoreColor(summary.score)}`}>{summary.score}</span>
              <span className="text-xs text-slate-500">/ 10</span>
            </div>
            {summary.verdict && <p className="text-xs leading-relaxed text-slate-300">{summary.verdict}</p>}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"><BadgeIndianRupee className="h-3.5 w-3.5" /> {t('Final deal')}</div>
              <p className="text-xs leading-relaxed text-slate-200 select-text">{summary.finalDeal}</p>
            </div>
            {summary.worked.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">{t('What worked')}</div>
                <ul className="space-y-1">{summary.worked.map(item => <li key={item} className="text-[11px] leading-relaxed text-slate-300">• {item}</li>)}</ul>
              </div>
            )}
            {summary.costMoney.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">{t('What cost you money')}</div>
                <ul className="space-y-1">{summary.costMoney.map(item => <li key={item} className="text-[11px] leading-relaxed text-slate-300">• {item}</li>)}</ul>
              </div>
            )}
            {summary.betterPhrasings.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('Better ways to say it')}</div>
                {summary.betterPhrasings.map((p, i) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 select-text">
                    {p.instead && <p className="text-[11px] leading-relaxed text-slate-500 line-through decoration-slate-600">{p.instead}</p>}
                    <p className="text-xs leading-relaxed text-slate-200">{p.say}</p>
                  </div>
                ))}
              </div>
            )}
            {saved !== 'no' && (
              <p className="flex items-center gap-1 text-[11px] text-slate-500">
                {saved === 'saving' && t('Saving to your account…')}
                {saved === 'failed' && t('Could not save to your account.')}
                {saved === 'yes' && <><Check className="h-3 w-3 text-emerald-400" /> {t('Saved to your account.')}</>}
              </p>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 shrink-0">
        {inCall ? (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={debrief} disabled={!replies}>{t('End the call')}</Button>
            <Button size="sm" variant="ghost" icon={<Volume2 className="w-3.5 h-3.5" />} onClick={repeatLine} disabled={phase !== 'answering'}>{t('Repeat')}</Button>
          </div>
        ) : phase === 'debrief' ? (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={again}>{t('Practise again')}</Button>
        ) : <span />}
        {phase === 'setup' && (
          <Button size="sm" variant="primary" icon={<Mic className="w-3.5 h-3.5" />} onClick={start} disabled={outOfTokens}>{t('Start the call')}</Button>
        )}
        {phase === 'answering' && (
          <Button size="sm" variant="primary" icon={<Send className="w-3.5 h-3.5" />} onClick={sendReply}>{t('Send reply')}</Button>
        )}
      </div>
    </div>
  );
};
