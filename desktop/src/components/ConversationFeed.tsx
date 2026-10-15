import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Copy, Check, Ear, RotateCcw, CornerDownRight, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import type { AdjustMode, FollowUp } from '../services/ai';
import type { QuestionKind } from '../services/questionDetect';
import { PROVIDERS, type ProviderId } from '../services/llm';
import type { Layout } from '../services/storage';
import { scoreAnswer } from '../services/answerScore';
import { AnswerText } from './AnswerText';
import { t } from '../i18n';

export interface Turn {
  id: string;
  question: string;
  answer: string;
  status: 'listening' | 'thinking' | 'answering' | 'done' | 'skipped' | 'error';
  source?: 'prepared' | 'ai';
  notes?: string;
  preparedId?: string;     // Which prepared answer it was based on, to redo it the same way
  firstTextMs?: number;    // How long the answer took to start
  provider?: ProviderId;   // Which AI wrote it
  keyPoints?: string[];
  followUps?: FollowUp[];
  error?: string;          // Redoing the answer failed (the previous answer is kept)
  origin?: 'screen';       // The question was read from the screen, not heard
  spoken?: string;         // What the user actually said (heard on the mic in "Call + mic" mode)
  kind?: QuestionKind;     // Technical, coding, system design... (shown as a badge)
}

const KIND_BADGES: Partial<Record<QuestionKind, { label: string; className: string }>> = {
  coding: { label: 'Coding', className: 'bg-violet-500/15 text-violet-300' },
  design: { label: 'System design', className: 'bg-sky-500/15 text-sky-300' },
  experience: { label: 'Experience', className: 'bg-emerald-500/15 text-emerald-300' },
  'about-you': { label: 'About you', className: 'bg-amber-500/15 text-amber-300' },
  concept: { label: 'Concept', className: 'bg-slate-500/20 text-slate-300' },
};

const ADJUST_BUTTONS: { mode: Exclude<AdjustMode, 'regenerate'>; label: string }[] = [
  { mode: 'shorter', label: 'Shorter' },
  { mode: 'longer', label: 'Longer' },
  { mode: 'simpler', label: 'Simpler' },
  { mode: 'technical', label: 'More technical' },
];

const chipClass = 'inline-flex items-center gap-1 rounded-md border border-slate-700/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:border-slate-500 hover:text-slate-100 transition-colors';

const AnswerControls: React.FC<{ onAdjust: (mode: AdjustMode) => void }> = ({ onAdjust }) => (
  <div className="mt-2 flex flex-wrap gap-1">
    <button className={chipClass} title={t('Write a different answer')} onClick={() => onAdjust('regenerate')}>
      <RotateCcw className="w-2.5 h-2.5" /> {t('Regenerate')}
    </button>
    {ADJUST_BUTTONS.map(b => (
      <button key={b.mode} className={chipClass} onClick={() => onAdjust(b.mode)}>{t(b.label)}</button>
    ))}
  </div>
);

const KeyPoints: React.FC<{ points: string[] }> = ({ points }) => (
  <ul className="space-y-1">
    {points.map((point, i) => (
      <li key={i} className="flex gap-2">
        <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
        <span className="font-medium">{point}</span>
      </li>
    ))}
  </ul>
);

const FollowUps: React.FC<{ items: FollowUp[]; startOpen: boolean }> = ({ items, startOpen }) => {
  const [open, setOpen] = useState<boolean | null>(null); // null = follow the default
  const isOpen = open ?? startOpen;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!isOpen)} className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-300">
        <ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} /> {t('Likely follow-ups ({n})', { n: items.length })}
      </button>
      {isOpen && (
        <ul className="mt-1 space-y-1.5 select-text">
          {items.map((f, i) => (
            <li key={i} className="flex gap-1.5 leading-snug" style={{ fontSize: 'calc(var(--answer-size) * 0.8)' }}>
              <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />
              <span>
                <span className="text-slate-300">{f.question}</span>
                {f.hint && <span className="block text-slate-500">{f.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

// How natural and simple the finished answer sounds out loud; a low score offers a simpler version
const NaturalScore: React.FC<{ answer: string; question: string; onSimpler: () => void }> = ({ answer, question, onSimpler }) => {
  const { score, issues } = scoreAnswer(answer, question, t);
  const tone = score >= 8 ? 'text-emerald-300 bg-emerald-500/10' : score >= 6 ? 'text-slate-300 bg-slate-700/40' : 'text-amber-300 bg-amber-500/10';
  const title = `${t('Sounds natural and simple: {score}/10', { score })}${issues.length ? `\n${issues.join('\n')}` : `\n${t('Short sentences, everyday words.')}`}${score < 6 ? `\n${t('Click for a simpler version.')}` : ''}`;
  return (
    <button
      onClick={score < 6 ? onSimpler : undefined}
      title={title}
      className={`rounded px-1.5 py-px text-[10px] font-semibold tabular-nums ${tone} ${score < 6 ? 'hover:brightness-125' : 'cursor-default'}`}
    >
      {score < 6 ? t('Simplify') : t('Natural')} {score}/10
    </button>
  );
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      title={t('Copy answer')}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-opacity"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
};

interface Props {
  turns: Turn[];
  layout?: Layout; // Compact and Teleprompter show only the latest question
  isRecording: boolean;
  keyPointsView: boolean;
  onAdjust: (turnId: string, mode: AdjustMode) => void;
  onAnswer?: (turnId: string) => void; // Answer a line that was taken as a remark
  onCheck: () => void; // Open the pre-interview check
  onMock: () => void;  // Open the mock interview
}

export const ConversationFeed: React.FC<Props> = ({ turns, layout = 'classic', isRecording, keyPointsView, onAdjust, onAnswer, onCheck, onMock }) => {
  const latestOnly = layout === 'compact' || layout === 'teleprompter';
  const hidden = latestOnly ? Math.max(0, turns.length - 1) : 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<HTMLDivElement>(null); // The newest question and answer
  const following = useRef(true); // Keep the newest answer in view until the user scrolls away
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set()); // Answers opened in full in key-points view

  const toggleExpanded = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // Where to scroll: the bottom, but never past the start of the newest question, so a long answer
  // (and the follow-ups added after it) grow below it instead of pushing the answer out of view
  const followPosition = () => {
    const scroller = scrollRef.current;
    if (!scroller) return 0;
    const bottom = scroller.scrollHeight - scroller.clientHeight;
    const latest = latestRef.current;
    return latest ? Math.max(0, Math.min(bottom, latest.offsetTop - 12)) : bottom;
  };

  // A new question: follow it again
  useEffect(() => {
    following.current = true;
  }, [turns.length]);

  // Follow new text as it is typed, unless the user scrolled up to read
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const observer = new ResizeObserver(() => {
      if (following.current) scroller.scrollTop = followPosition();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) following.current = Math.abs(el.scrollTop - followPosition()) < 40;
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="fade-with-text scrollable relative flex-1 min-h-0 overflow-y-auto px-4 py-3">
      <div ref={contentRef} className="space-y-4">
        {turns.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 pt-16 text-center">
            <Ear className="w-6 h-6 text-slate-600" />
            <p className="text-sm text-slate-400">
              {isRecording ? t('Listening... answers will appear here.') : t('Press the mic to start listening.')}
            </p>
            {!isRecording && (
              <div className="mt-1 flex gap-3 text-[11px] font-medium">
                <button onClick={onCheck} className="text-blue-400 hover:text-blue-300">{t('Pre-interview check')}</button>
                <button onClick={onMock} className="text-blue-400 hover:text-blue-300">{t('Mock interview')}</button>
              </div>
            )}
          </div>
        )}

        {hidden > 0 && (
          <p className="text-[10px] text-slate-600">{hidden === 1 ? t('1 earlier question in this conversation (Classic style shows them all)') : t('{n} earlier questions in this conversation (Classic style shows them all)', { n: hidden })}</p>
        )}
        {turns.slice(hidden).map((turn, shownIndex) => {
          const index = shownIndex + hidden;
          const isLatest = index === turns.length - 1;
          // Key-points view: the latest answer shows its key points above the full text (so it never
          // collapses while being read); older answers show only their key points until opened.
          const hasPoints = keyPointsView && turn.status === 'done' && !!turn.keyPoints?.length;
          const showFull = !hasPoints || isLatest || expanded.has(turn.id);
          return (
          <div key={turn.id} ref={isLatest ? latestRef : undefined} className={`group turn-in ${turn.status === 'skipped' ? 'opacity-40' : ''}`}>
            {/* What was heard */}
            <p className="text-slate-400 leading-relaxed select-text" style={{ fontSize: 'calc(var(--answer-size) * 0.86)' }}>
              <span className="font-semibold text-slate-500" title={turn.origin === 'screen' ? t('Read from your screen') : undefined}>
                {turn.origin === 'screen' ? t('Screen · ') : t('Q · ')}
              </span>
              {turn.kind && KIND_BADGES[turn.kind] && (
                <span className={`mr-1.5 inline-block rounded px-1.5 py-px align-[1px] text-[9px] font-semibold uppercase tracking-wide ${KIND_BADGES[turn.kind]!.className}`}>
                  {t(KIND_BADGES[turn.kind]!.label)}
                </span>
              )}
              {turn.question}
              {turn.status === 'listening' && <span className="ml-1 text-slate-600 animate-pulse">…</span>}
              {turn.status === 'skipped' && onAnswer && (
                <button onClick={() => onAnswer(turn.id)} className="ml-2 text-[10px] font-medium text-blue-400 opacity-0 hover:text-blue-300 group-hover:opacity-100 focus:opacity-100">
                  {t('Answer this')}
                </button>
              )}
            </p>

            {/* The typed answer */}
            {turn.status === 'thinking' && (
              <div className="mt-2 flex gap-1 pl-3">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" />
              </div>
            )}
            {turn.status === 'error' && <p className="mt-1.5 pl-3 text-[11px] text-red-300">{turn.answer}</p>}
            {(turn.status === 'answering' || turn.status === 'done') && (
              <div className={`mt-2 border-l-2 pl-3 ${turn.source === 'prepared' ? 'border-emerald-500/60' : 'border-blue-500/60'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {turn.source === 'prepared' && (
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium text-emerald-300" title={t('From your prepared answer')}>
                      <BookOpen className="w-3 h-3" /> {t('Prepared')}
                    </span>
                  )}
                  {turn.notes && <span className="min-w-0 text-[10px] text-amber-300/80 truncate" title={turn.notes}>{t('Tip:')} {turn.notes}</span>}
                  <span className="ml-auto flex items-center gap-1 shrink-0">
                    {turn.firstTextMs !== undefined && (
                      <span
                        className="text-[10px] tabular-nums text-slate-600"
                        title={t('How long the answer took to start')}
                      >
                        {formatSeconds(turn.firstTextMs)}{turn.provider && ` · ${PROVIDERS[turn.provider].label}`}
                      </span>
                    )}
                    {turn.status === 'done' && turn.answer && <NaturalScore answer={turn.answer} question={turn.question} onSimpler={() => onAdjust(turn.id, 'simpler')} />}
                    {turn.status === 'done' && <CopyButton text={turn.answer} />}
                  </span>
                </div>
                <div className="answer-text text-slate-100 leading-relaxed select-text" style={{ fontSize: 'var(--answer-size)' }}>
                  {hasPoints && (
                    <div className={`fade-in ${showFull ? 'mb-2 rounded-md bg-slate-800/60 px-2.5 py-2' : ''}`}>
                      <KeyPoints points={turn.keyPoints!} />
                    </div>
                  )}
                  {showFull && <AnswerText text={turn.answer} streaming={turn.status === 'answering'} />}
                </div>
                {hasPoints && !isLatest && (
                  <button
                    onClick={() => toggleExpanded(turn.id)}
                    className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-400 hover:text-blue-300"
                  >
                    {showFull ? <><ChevronUp className="w-3 h-3" /> {t('Hide full answer')}</> : <><ChevronDown className="w-3 h-3" /> {t('Show full answer')}</>}
                  </button>
                )}
                {turn.error && <p className="mt-1 text-[11px] text-red-300">{turn.error}</p>}
                {turn.status === 'done' && (
                  <div className={`prompter-hover ${isLatest ? '' : 'hidden group-hover:block'}`}>
                    <AnswerControls onAdjust={mode => onAdjust(turn.id, mode)} />
                  </div>
                )}
                {turn.status === 'done' && !!turn.followUps?.length && layout !== 'teleprompter' && (
                  <FollowUps items={turn.followUps} startOpen={isLatest} />
                )}
              </div>
            )}
            {turn.spoken && (
              <p className="mt-2 pl-3 leading-relaxed text-slate-400 select-text" style={{ fontSize: 'calc(var(--answer-size) * 0.86)' }}>
                <span className="font-semibold text-sky-400">{t('You said · ')}</span>{turn.spoken}
              </p>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
};
