import React, { useRef, useState } from 'react';
import { Check, ExternalLink, FileCheck, FileUp, Plus, UserSearch, X } from 'lucide-react';
import { openWebsite } from '../services/account';
import { checkResume, fetchInterviewerInsights, interviewerSummary, looksLikeLinkedInLink, reportPath, type InterviewerInsights, type ResumeCheckResult } from '../services/career';
import { extractTextFromFile } from '../services/fileText';
import { describeAiError } from '../services/llm';
import { newId, type PreparedAnswer, type Settings } from '../services/storage';
import { t } from '../i18n';
import { Button, TextArea } from './ui';

// Settings → Profile: "Check my resume" (score, ATS score, top things to keep and fix) and "Paste their
// LinkedIn" next to the Interviewer field (likely questions and tips). Both run on the server with the
// best model, so they take a while; the full report is on the website.

const tone = (score: number) => (score >= 80 ? 'text-emerald-300' : score >= 70 ? 'text-blue-300' : score >= 55 ? 'text-amber-300' : 'text-red-300');
const stroke = (score: number) => (score >= 80 ? '#34d399' : score >= 70 ? '#60a5fa' : score >= 55 ? '#fbbf24' : '#f87171');

const Ring: React.FC<{ score: number; label: string }> = ({ score, label }) => {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2">
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90 shrink-0" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={stroke(score)} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div>
        <div className={`text-lg font-bold tabular-nums leading-none ${tone(score)}`}>{score}</div>
        <div className="mt-0.5 text-[10px] text-slate-400">{label}</div>
      </div>
    </div>
  );
};

const Slow: React.FC = () => <p className="text-[11px] text-blue-300 animate-pulse">{t('Our best AI model is reading it carefully. This can take a minute or two.')}</p>;

// ---------- Check my resume ----------

export const ResumeCheck: React.FC<{ settings: Settings }> = ({ settings }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResumeCheckResult | null>(null);

  const run = async () => {
    if (settings.cv.trim().length < 200) return setError(t('Add your resume above first.'));
    setBusy(true);
    setError('');
    try {
      setResult(await checkResume(settings.cv, settings.job));
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <Button size="sm" icon={<FileCheck className="w-3.5 h-3.5" />} loading={busy} onClick={run}>
        {result ? t('Check again') : t('Check my resume')}
      </Button>
      {busy && <Slow />}
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      {result && !busy && (
        <div className="panel-in space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex flex-wrap gap-5">
            <Ring score={result.overall} label={t('Resume score')} />
            <Ring score={result.ats} label={t('ATS-friendly')} />
          </div>
          {result.summary && <p className="text-[11px] leading-relaxed text-slate-300 select-text">{result.summary}</p>}
          {result.good.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-300">{t("What's good")}</div>
              <ul className="space-y-1">
                {result.good.slice(0, 3).map((g, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-slate-300 select-text"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />{g.point}</li>
                ))}
              </ul>
            </div>
          )}
          {result.bad.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-300">{t('Fix these first')}</div>
              <ul className="space-y-1.5">
                {result.bad.slice(0, 3).map((b, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-slate-300 select-text">
                    <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                    <span>{b.point}{b.fix && <span className="block text-blue-300">{b.fix}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={() => openWebsite(reportPath('resume-score', result.id))} className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
            <ExternalLink className="h-3 w-3" /> {t('See the full report on the website')}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------- Interviewer insights from their LinkedIn ----------

interface InsightsProps {
  settings: Settings;
  onAddQuestions: (answers: PreparedAnswer[]) => void; // Into the prepared answers (no answer yet: drafted in the Answers tab)
  onUseSummary: (text: string) => void;                // Fills the Interviewer field
}

export const InterviewerInsightsPanel: React.FC<InsightsProps> = ({ settings, onAddQuestions, onUseSummary }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState<InterviewerInsights | null>(null);
  const [added, setAdded] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const existing = new Set(settings.answers.map(a => a.question.trim().toLowerCase()));
  const fresh = insights?.questions.filter(q => !existing.has(q.question.trim().toLowerCase())) ?? [];

  const pickFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setReading(true);
    try {
      setText(await extractTextFromFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not read this file.'));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const run = async () => {
    if (looksLikeLinkedInLink(text)) return setError(t("Recallr can't open LinkedIn links. On their profile click More → Save to PDF and choose that file, or copy the profile text and paste it here."));
    if (text.trim().length < 80) return setError(t('Paste more of their profile: headline, About and experience.'));
    setBusy(true);
    setError('');
    setAdded(0);
    try {
      setInsights(await fetchInterviewerInsights(text, settings.cv, settings.job));
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    onAddQuestions(fresh.map(q => ({ id: newId(), question: q.question, notes: q.why || undefined, answer: '' })));
    setAdded(fresh.length);
  };

  if (!open) {
    return (
      <Button size="sm" variant="ghost" icon={<UserSearch className="w-3.5 h-3.5" />} onClick={() => setOpen(true)} className="mt-1.5">
        {t('Paste their LinkedIn')}
      </Button>
    );
  }

  return (
    <div className="panel-in mt-2 space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-slate-400">{t("Open the interviewer's LinkedIn profile, click More → Save to PDF and choose that file, or copy the profile text and paste it here.")}</p>
        <button onClick={() => setOpen(false)} title={t('Close')} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
      </div>
      <TextArea value={text} onChange={e => setText(e.target.value)} placeholder={t('Their headline, About, experience, education...')} className="h-28 text-xs" />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<FileUp className="w-3.5 h-3.5" />} loading={reading} onClick={() => fileRef.current?.click()}>{t('Choose PDF')}</Button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
        <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={run}>{t('Get insights')}</Button>
      </div>
      {busy && <Slow />}
      {error && <p className="text-[11px] text-red-300">{error}</p>}

      {insights && !busy && (
        <div className="space-y-3 border-t border-slate-800 pt-3 select-text">
          <div>
            <div className="text-xs font-semibold text-slate-100">{[insights.who.name, insights.who.role].filter(Boolean).join(' · ') || t('Your interviewer')}</div>
            {insights.who.background && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{insights.who.background}</p>}
            <button onClick={() => onUseSummary(interviewerSummary(insights.who))} className="mt-1 text-[11px] text-blue-400 hover:text-blue-300">
              {t('Use this in the Interviewer field')}
            </button>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-slate-300">{t('Likely questions')}</div>
            <ol className="list-decimal space-y-1.5 pl-4">
              {insights.questions.map((q, i) => (
                <li key={i} className="text-[11px] text-slate-200">{q.question}{q.why && <span className="block text-slate-500">{q.why}</span>}</li>
              ))}
            </ol>
          </div>
          {insights.tips.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-300">{t('Tips for this interviewer')}</div>
              <ul className="list-disc space-y-1 pl-4">{insights.tips.map((tip, i) => <li key={i} className="text-[11px] text-slate-300">{tip}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} disabled={!fresh.length || added > 0} onClick={add}>
              {t('Add these questions to my prep')}
            </Button>
            <button onClick={() => openWebsite(reportPath('interviewer', insights.id))} className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
              <ExternalLink className="h-3 w-3" /> {t('Full report on the website')}
            </button>
          </div>
          {added > 0 && <p className="text-[11px] text-emerald-300">{t('Added {n} questions to your prepared answers. Draft their answers in the Answers tab, then Save.', { n: added })}</p>}
          {!added && insights.questions.length > 0 && !fresh.length && <p className="text-[11px] text-slate-500">{t('These questions are already in your answers.')}</p>}
        </div>
      )}
    </div>
  );
};
