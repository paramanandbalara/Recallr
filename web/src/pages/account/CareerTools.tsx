import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileCheck, FileText, IdCard, Loader2, Mail, Trash2, Upload, UserSearch, WandSparkles } from 'lucide-react';
import { api, ApiError, dateTime, getToken, setToken } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Badge, Button, Card, ErrorText, Field, Input, Select, TextArea } from '../../components/ui';
import {
  CoverLetterView, InterviewerView, LinkedInView, ResumeRewriteView, ResumeScoreView, scoreTone,
  type CoverLetterResult, type InterviewerResult, type LinkedInResult, type ResumeRewriteResult, type ResumeScoreResult,
} from '../../components/CareerResults';

// Career tools: resume score + ATS check, resume tailored to a job, LinkedIn review, cover letter, and
// insights about the interviewer. Each run uses the best AI model (counted against the plan) and is saved
// to the history below.

type Kind = 'RESUME_SCORE' | 'RESUME_REWRITE' | 'LINKEDIN_REVIEW' | 'COVER_LETTER' | 'INTERVIEWER_INSIGHTS';

const TOOLS: { id: string; kind: Kind; path: string; name: string; text: string; icon: React.ElementType }[] = [
  { id: 'resume-score', kind: 'RESUME_SCORE', path: '/career/resume-score', name: 'Resume score', text: 'Score, ATS check and fixes', icon: FileCheck },
  { id: 'resume-rewrite', kind: 'RESUME_REWRITE', path: '/career/resume-rewrite', name: 'Tailor to a job', text: 'Match score and a rewritten resume', icon: WandSparkles },
  { id: 'linkedin', kind: 'LINKEDIN_REVIEW', path: '/career/linkedin-review', name: 'LinkedIn review', text: 'Headline, About and what to fix', icon: IdCard },
  { id: 'cover-letter', kind: 'COVER_LETTER', path: '/career/cover-letter', name: 'Cover letter', text: '250–350 words, your real facts', icon: Mail },
  { id: 'interviewer', kind: 'INTERVIEWER_INSIGHTS', path: '/career/interviewer-insights', name: 'Interviewer insights', text: 'Likely questions from their profile', icon: UserSearch },
];

interface ReportSummary { id: string; kind: Kind | 'SALARY_PRACTICE'; title: string; score: number | null; model: string; createdAt: string }
interface Report extends ReportSummary { result: unknown; input?: unknown }
type FileHints = Record<string, unknown> | null;

// ---------- Uploads (multipart, so not through api()) ----------

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

const extractText = async (file: File) => {
  const body = new FormData();
  body.append('file', file);
  const token = getToken();
  const res = await fetch(`${BASE}/api/career/extract-text`, { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data.error ?? 'The file could not be read.', data.code);
  }
  return data as { text: string; fileHints: FileHints; words: number };
};

// The resume and job are shared by the tools and remembered on this browser, so they're typed once
const DRAFT_KEY = 'recallr_career_draft';
const loadDraft = (): { resume: string; job: string } => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
    return { resume: typeof d.resume === 'string' ? d.resume : '', job: typeof d.job === 'string' ? d.job : '' };
  } catch {
    return { resume: '', job: '' };
  }
};
const saveDraft = (draft: { resume: string; job: string }) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* Only for this visit */ }
};

// A text box that can also be filled from a PDF or Word file (read on the server)
const TextSource: React.FC<{
  label: string; hint?: string; value: string; onChange: (text: string, hints: FileHints) => void; placeholder: string;
  rows?: number; accept?: string; uploadLabel?: string;
}> = ({ label, hint, value, onChange, placeholder, rows = 10, accept = '.pdf,.docx,.txt', uploadLabel = 'Upload PDF or Word' }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setNote('');
    if (file.size > 5 * 1024 * 1024) return setError('The file is too big. The limit is 5 MB.');
    setBusy(true);
    try {
      const { text, fileHints, words } = await extractText(file);
      onChange(text, fileHints);
      setNote(`Read ${words} words from ${file.name}. Check the text below.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <Button type="button" size="sm" variant="ghost" loading={busy} onClick={() => input.current?.click()}>
          {!busy && <Upload className="h-3.5 w-3.5" />} {uploadLabel}
        </Button>
        <input ref={input} type="file" accept={accept} className="hidden" onChange={e => pick(e.target.files?.[0])} />
      </div>
      <TextArea value={value} onChange={e => onChange(e.target.value, null)} placeholder={placeholder} rows={rows} className="font-mono text-xs leading-relaxed" />
      {hint && !note && !error && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
      {note && <p className="mt-1 text-[11px] text-emerald-300">{note}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
};

const ResultView: React.FC<{ report: Report }> = ({ report }) => {
  switch (report.kind) {
    case 'RESUME_SCORE': return <ResumeScoreView r={report.result as ResumeScoreResult} />;
    case 'RESUME_REWRITE': return <ResumeRewriteView r={report.result as ResumeRewriteResult} />;
    case 'LINKEDIN_REVIEW': return <LinkedInView r={report.result as LinkedInResult} />;
    case 'COVER_LETTER': return <CoverLetterView r={report.result as CoverLetterResult} />;
    case 'INTERVIEWER_INSIGHTS': return <InterviewerView r={report.result as InterviewerResult} />;
    default: return <Card className="text-sm text-slate-400">This report is shown in the app.</Card>;
  }
};

const KIND_NAMES: Record<string, string> = Object.fromEntries([...TOOLS.map(t => [t.kind, t.name]), ['SALARY_PRACTICE', 'Salary practice']]);

export const AccountCareerTools: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tool = TOOLS.find(t => t.id === params.get('tool')) ?? TOOLS[0];
  const reportId = params.get('report');

  const [draft, setDraft] = useState(loadDraft);
  const [resumeHints, setResumeHints] = useState<FileHints>(null);
  const [targetRole, setTargetRole] = useState('');
  const [profile, setProfile] = useState('');
  const [interviewer, setInterviewer] = useState('');
  const [company, setCompany] = useState('');
  const [tone, setTone] = useState('professional');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<ReportSummary[] | null>(null);
  const [historyPage, setHistoryPage] = useState({ page: 1, pages: 1 });
  const [historyAll, setHistoryAll] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const shownId = useRef<string | null>(null); // The report already on screen (not loaded again)

  const setResume = (resume: string, hints: FileHints) => {
    setDraft(d => { const next = { ...d, resume }; saveDraft(next); return next; });
    setResumeHints(hints);
  };
  const setJob = (job: string) => setDraft(d => { const next = { ...d, job }; saveDraft(next); return next; });

  const loadHistory = useCallback(async (page = 1) => {
    const query = new URLSearchParams({ page: String(page), limit: '10', ...(historyAll ? {} : { kind: tool.kind }) });
    try {
      const data = await api<{ reports: ReportSummary[]; page: number; pages: number }>(`/career/reports?${query}`);
      setHistory(previous => (page > 1 && previous ? [...previous, ...data.reports] : data.reports));
      setHistoryPage({ page: data.page, pages: data.pages });
    } catch (err) {
      setError({ message: (err as Error).message });
    }
  }, [tool.kind, historyAll]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // A report opened from the history (or from the app's link)
  useEffect(() => {
    if (!reportId || reportId === shownId.current) return;
    shownId.current = reportId;
    api<{ report: Report }>(`/career/reports/${reportId}`).then(r => {
      setReport(r.report);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }, err => setError({ message: (err as Error).message }));
  }, [reportId]);

  const choose = (id: string) => {
    shownId.current = null;
    setParams({ tool: id });
    setReport(null);
    setError(null);
  };

  const bodyFor = (): object | string => {
    const resume = draft.resume.trim();
    const job = draft.job.trim();
    switch (tool.kind) {
      case 'RESUME_SCORE':
        if (!resume) return 'Paste your resume or upload it first.';
        return { resumeText: resume, targetRole: targetRole.trim() || undefined, jobDescription: job || undefined, fileHints: resumeHints ?? undefined };
      case 'RESUME_REWRITE':
        if (!resume || !job) return 'Add your resume and the job description.';
        return { resumeText: resume, jobDescription: job };
      case 'LINKEDIN_REVIEW':
        if (!profile.trim()) return 'Paste your LinkedIn profile or upload its PDF.';
        return { profileText: profile.trim(), targetRole: targetRole.trim() || undefined };
      case 'COVER_LETTER':
        if (!resume || !job) return 'Add your resume and the job description.';
        return { resumeText: resume, jobDescription: job, company: company.trim() || undefined, tone };
      case 'INTERVIEWER_INSIGHTS':
        if (!interviewer.trim()) return 'Paste the interviewer’s LinkedIn profile or upload its PDF.';
        return { interviewerText: interviewer.trim(), resumeText: resume || undefined, jobDescription: job || undefined };
    }
  };

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = bodyFor();
    if (typeof body === 'string') return setError({ message: body });
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const { report: made } = await api<{ report: Report }>(tool.path, { body });
      setReport(made);
      shownId.current = made.id;
      setParams({ tool: tool.id, report: made.id }, { replace: true });
      loadHistory();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      setError({ message: (err as Error).message, code: err instanceof ApiError ? err.code : undefined });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this report?')) return;
    try {
      await api(`/career/reports/${id}`, { method: 'DELETE' });
      setHistory(h => h?.filter(r => r.id !== id) ?? null);
      if (report?.id === id) { setReport(null); setParams({ tool: tool.id }); }
    } catch (err) {
      setError({ message: (err as Error).message });
    }
  };

  const needsJob = tool.kind === 'RESUME_REWRITE' || tool.kind === 'COVER_LETTER';
  const usesResume = tool.kind !== 'LINKEDIN_REVIEW';

  return (
    <AccountPage title="Career tools">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => choose(t.id)}
            disabled={busy}
            className={`rounded-xl border p-3 text-left transition-colors ${t.id === tool.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'}`}
          >
            <t.icon className={`h-5 w-5 ${t.id === tool.id ? 'text-blue-300' : 'text-slate-400'}`} />
            <div className="mt-2 text-sm font-semibold text-slate-100">{t.name}</div>
            <div className="text-xs text-slate-500">{t.text}</div>
          </button>
        ))}
      </div>

      <Card className="mt-4">
        <form onSubmit={run} className="space-y-4">
          {tool.kind === 'LINKEDIN_REVIEW' && (
            <TextSource
              label="Your LinkedIn profile" value={profile} onChange={setProfile} rows={12} accept=".pdf,.txt" uploadLabel="Upload the profile PDF"
              placeholder="Copy everything on your profile (headline, About, experience, skills) and paste it here."
              hint="Or on your profile click More → Save to PDF, and upload that file. Recallr can't open LinkedIn links."
            />
          )}
          {tool.kind === 'INTERVIEWER_INSIGHTS' && (
            <TextSource
              label="The interviewer's LinkedIn profile" value={interviewer} onChange={setInterviewer} rows={8} accept=".pdf,.txt" uploadLabel="Upload their profile PDF"
              placeholder="Paste their headline, About, experience and education."
              hint="On their profile click More → Save to PDF and upload it, or copy and paste the text. Recallr can't open LinkedIn links."
            />
          )}
          {usesResume && (
            <TextSource
              label={tool.kind === 'INTERVIEWER_INSIGHTS' ? 'Your resume (optional, finds common ground)' : 'Your resume'}
              value={draft.resume} onChange={setResume} rows={tool.kind === 'INTERVIEWER_INSIGHTS' ? 5 : 12}
              placeholder="Paste your resume text, or upload the PDF or Word file."
              hint="Upload the same file you send to companies: the ATS check looks at its layout too."
            />
          )}
          {(tool.kind === 'RESUME_SCORE' || tool.kind === 'LINKEDIN_REVIEW') && (
            <Field label="Target role (optional)">
              <Input value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder="e.g. Backend engineer, Data analyst" maxLength={200} />
            </Field>
          )}
          {tool.kind !== 'LINKEDIN_REVIEW' && (
            <Field label={needsJob ? 'Job description' : 'Job description (optional)'} hint={tool.kind === 'RESUME_SCORE' ? 'Add it to check keywords against this job.' : undefined}>
              <TextArea value={draft.job} onChange={e => setJob(e.target.value)} rows={needsJob ? 8 : 5} placeholder="Paste the job ad: title, responsibilities, requirements." className="text-xs leading-relaxed" />
            </Field>
          )}
          {tool.kind === 'COVER_LETTER' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company (optional)"><Input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Northwind" maxLength={120} /></Field>
              <Field label="Tone">
                <Select value={tone} onChange={e => setTone(e.target.value)}>
                  {['professional', 'warm', 'confident', 'enthusiastic'].map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                </Select>
              </Field>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={busy}>{busy ? 'Working…' : `Run ${tool.name.toLowerCase()}`}</Button>
            <span className="text-xs text-slate-500">
              {busy ? 'Our best AI model is reading it carefully. This can take a minute or two; you can leave this page, the result is saved below.' : 'Uses your plan’s AI allowance.'}
            </span>
          </div>
          {error && (
            <ErrorText>
              {error.message}{' '}
              {['NO_PLAN', 'TOKENS_USED_UP'].includes(error.code ?? '') && <Link to="/account/buy" className="underline">Buy a plan</Link>}
            </ErrorText>
          )}
        </form>
      </Card>

      <div ref={resultRef} className="mt-6 scroll-mt-6">
        {busy && (
          <Card className="flex items-center gap-3 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /> Working on your {tool.name.toLowerCase()}…</Card>
        )}
        {report && !busy && (
          <>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">{report.title}</h2>
              <span className="text-xs text-slate-500">{dateTime(report.createdAt)}</span>
            </div>
            <ResultView report={report} />
          </>
        )}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Past results</h2>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={historyAll} onChange={e => setHistoryAll(e.target.checked)} className="accent-blue-500" /> All tools
          </label>
        </div>
        {history?.length === 0 && <Card className="text-sm text-slate-500">Nothing yet. Your results are saved here each time you run a tool.</Card>}
        {!!history?.length && (
          <Card className="!p-0">
            <ul className="divide-y divide-slate-800/70">
              {history.map(h => (
                <li key={h.id} className={`flex items-center gap-3 px-4 py-2.5 ${report?.id === h.id ? 'bg-slate-800/40' : ''}`}>
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setParams({ tool: TOOLS.find(t => t.kind === h.kind)?.id ?? tool.id, report: h.id })}
                  >
                    <div className="truncate text-sm text-slate-200 hover:text-white">{h.title || KIND_NAMES[h.kind]}</div>
                    <div className="text-xs text-slate-500">{historyAll ? `${KIND_NAMES[h.kind]} · ` : ''}{dateTime(h.createdAt)}</div>
                  </button>
                  {h.score !== null && <Badge tone="slate"><span className={scoreTone(h.score).text}>{h.score}</span></Badge>}
                  <Button size="sm" variant="ghost" onClick={() => remove(h.id)} aria-label="Delete report"><Trash2 className="h-3.5 w-3.5" /></Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {historyPage.page < historyPage.pages && (
          <div className="mt-3 text-center"><Button size="sm" onClick={() => loadHistory(historyPage.page + 1)}>Show more</Button></div>
        )}
      </section>
    </AccountPage>
  );
};
