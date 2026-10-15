import React, { useState } from 'react';
import { ArrowRight, Check, Copy, MessageCircleQuestionMark, Sparkles, ThumbsDown, ThumbsUp, Lightbulb, X } from 'lucide-react';
import { Badge, Button, Card } from './ui';

// How the career tools' results look: score rings and bars, good/bad lists with reasons, the ATS checklist,
// keyword chips, and copy buttons for anything meant to be pasted somewhere else.

// ---------- Result shapes (same as server/src/career.ts) ----------

export interface Point { point: string; why: string }
export interface Fixable extends Point { fix: string }
export interface Rewrite { before: string; after: string; why: string }
export interface ChecklistItem { id: string; label: string; ok: boolean; detail: string; ats: boolean }

export interface ResumeScoreResult {
  overall: number;
  ats: number;
  summary: string;
  detectedRole: string;
  targetRole: string;
  subScores: { key: string; label: string; score: number; note: string }[];
  good: Point[];
  bad: Fixable[];
  atsIssues: { issue: string; why: string; fix: string; severity: 'high' | 'medium' | 'low' }[];
  presentKeywords: string[];
  missingKeywords: string[];
  rewrites: Rewrite[];
  checks: { words: number; pagesEstimate: number; sections: string[]; bullets: number; bulletsWithNumbers: number; checklist: ChecklistItem[] };
  fileHints: { fileType: string; pages?: number } | null;
}

export interface ResumeRewriteResult {
  match: number;
  verdict: string;
  matchedSkills: string[];
  missingSkills: string[];
  experienceFit: string;
  reasons: { point: string; positive: boolean }[];
  rewrittenResume: string;
  changes: string[];
  placeholders: number;
}

export interface LinkedInResult {
  score: number;
  summary: string;
  headlines: string[];
  about: string;
  experience: Rewrite[];
  skillsToAdd: string[];
  good: Point[];
  bad: Fixable[];
}

export interface CoverLetterResult { letter: string; highlights: string[]; words: number; company: string; tone: string }

export interface InterviewerResult {
  who: { name: string; role: string; seniority: string; background: string };
  caresAbout: Point[];
  questions: { question: string; why: string }[];
  tips: string[];
  askThem: { question: string; why: string }[];
  commonGround: string[];
}

// ---------- Pieces ----------

export const scoreTone = (score: number) =>
  score >= 80 ? { text: 'text-emerald-300', stroke: '#34d399', bar: 'bg-emerald-400', word: 'Excellent' }
  : score >= 70 ? { text: 'text-blue-300', stroke: '#60a5fa', bar: 'bg-blue-400', word: 'Good' }
  : score >= 55 ? { text: 'text-amber-300', stroke: '#fbbf24', bar: 'bg-amber-400', word: 'Average' }
  : score >= 40 ? { text: 'text-orange-300', stroke: '#fb923c', bar: 'bg-orange-400', word: 'Weak' }
  : { text: 'text-red-300', stroke: '#f87171', bar: 'bg-red-400', word: 'Needs work' };

export const ScoreRing: React.FC<{ score: number; label: string; size?: number }> = ({ score, label, size = 128 }) => {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={`${label}: ${score} out of 100`}>
      <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={tone.stroke} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x="60" y="60" transform="rotate(90 60 60)" textAnchor="middle" dominantBaseline="central" className="fill-white text-[30px] font-bold">{score}</text>
      </svg>
      <div className="text-center">
        <div className="text-sm font-semibold text-slate-200">{label}</div>
        <div className={`text-xs ${tone.text}`}>{tone.word}</div>
      </div>
    </div>
  );
};

export const ScoreBar: React.FC<{ label: string; score: number; note?: string }> = ({ label, score, note }) => (
  <div>
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-slate-200">{label}</span>
      <span className={`tabular-nums font-semibold ${scoreTone(score).text}`}>{score}</span>
    </div>
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${scoreTone(score).bar}`} style={{ width: `${score}%` }} />
    </div>
    {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
  </div>
);

export const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button size="sm" variant="secondary" onClick={async () => {
      await navigator.clipboard.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : label}
    </Button>
  );
};

const Section: React.FC<{ title: string; icon?: React.ElementType; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, icon: Icon, action, children, className = '' }) => (
  <Card className={className}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">{Icon && <Icon className="h-4 w-4 text-blue-400" />}{title}</h3>
      {action}
    </div>
    {children}
  </Card>
);

const GoodList: React.FC<{ items: Point[] }> = ({ items }) => (
  <ul className="space-y-2.5">
    {items.map((g, i) => (
      <li key={i} className="flex gap-2.5 text-sm">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div><div className="text-slate-200">{g.point}</div>{g.why && <div className="text-xs text-slate-500">{g.why}</div>}</div>
      </li>
    ))}
  </ul>
);

const BadList: React.FC<{ items: Fixable[] }> = ({ items }) => (
  <ul className="space-y-3">
    {items.map((b, i) => (
      <li key={i} className="flex gap-2.5 text-sm">
        <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div>
          <div className="text-slate-200">{b.point}</div>
          {b.why && <div className="text-xs text-slate-500">{b.why}</div>}
          {b.fix && <div className="mt-1 text-xs text-blue-300"><span className="font-semibold">Fix:</span> {b.fix}</div>}
        </div>
      </li>
    ))}
  </ul>
);

const GoodBad: React.FC<{ good: Point[]; bad: Fixable[] }> = ({ good, bad }) => (
  <div className="grid gap-4 md:grid-cols-2">
    <Section title="What's good" icon={ThumbsUp}>{good.length ? <GoodList items={good} /> : <p className="text-sm text-slate-500">Nothing stood out yet.</p>}</Section>
    <Section title="What's hurting it" icon={ThumbsDown}>{bad.length ? <BadList items={bad} /> : <p className="text-sm text-slate-500">No big problems found.</p>}</Section>
  </div>
);

const Chips: React.FC<{ items: string[]; tone: 'green' | 'red' | 'blue' | 'amber' }> = ({ items, tone }) => (
  <div className="flex flex-wrap gap-1.5">{items.map(k => <Badge key={k} tone={tone}>{k}</Badge>)}</div>
);

// Shows "[add number: …]" placeholders highlighted so they're easy to spot and fill in
const WithPlaceholders: React.FC<{ text: string }> = ({ text }) => (
  <>{text.split(/(\[[^\]]+\])/g).map((part, i) => (/^\[.*\]$/.test(part) ? <mark key={i} className="rounded bg-amber-500/20 px-0.5 text-amber-200">{part}</mark> : part))}</>
);

const Rewrites: React.FC<{ items: Rewrite[] }> = ({ items }) => (
  <ul className="space-y-3">
    {items.map((r, i) => (
      <li key={i} className="rounded-xl border border-slate-800 p-3 text-sm">
        {r.before && <div className="text-slate-500 line-through decoration-slate-600">{r.before}</div>}
        <div className="mt-1 flex items-start gap-2">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div className="flex-1 text-slate-100"><WithPlaceholders text={r.after} /></div>
          <CopyButton text={r.after} />
        </div>
        {r.why && <div className="mt-1.5 text-xs text-slate-500">{r.why}</div>}
      </li>
    ))}
  </ul>
);

const Summary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="max-w-xl text-sm leading-relaxed text-slate-300">{children}</p>
);

// ---------- Each tool ----------

const SEVERITY_TONE = { high: 'red', medium: 'amber', low: 'slate' } as const;

export const ResumeScoreView: React.FC<{ r: ResumeScoreResult }> = ({ r }) => (
  <div className="space-y-4">
    <Card>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="flex gap-6">
          <ScoreRing score={r.overall} label="Overall" />
          <ScoreRing score={r.ats} label="ATS-friendly" />
        </div>
        <div className="space-y-2">
          <Summary>{r.summary}</Summary>
          <p className="text-xs text-slate-500">
            {r.targetRole || r.detectedRole ? <>Checked for <span className="text-slate-300">{r.targetRole || r.detectedRole}</span> · </> : null}
            {r.checks.words} words · {r.checks.bullets} bullets · about {r.checks.pagesEstimate} page{r.checks.pagesEstimate > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-slate-500">Most resumes score 55–70. 80+ is excellent.</p>
        </div>
      </div>
    </Card>

    <Section title="Score breakdown">
      <div className="grid gap-4 sm:grid-cols-2">{r.subScores.map(s => <ScoreBar key={s.key} label={s.label} score={s.score} note={s.note} />)}</div>
    </Section>

    <GoodBad good={r.good} bad={r.bad} />

    <div className="grid gap-4 md:grid-cols-2">
      <Section title="ATS checklist">
        <ul className="space-y-2">
          {r.checks.checklist.map(c => (
            <li key={c.id} className="flex gap-2.5 text-sm">
              {c.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
              <div><div className={c.ok ? 'text-slate-300' : 'text-slate-100'}>{c.label}</div><div className="text-xs text-slate-500">{c.detail}</div></div>
            </li>
          ))}
        </ul>
      </Section>
      <div className="space-y-4">
        {r.atsIssues.length > 0 && (
          <Section title="ATS problems found">
            <ul className="space-y-3">
              {r.atsIssues.map((a, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-center gap-2 text-slate-100"><Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>{a.issue}</div>
                  {a.why && <div className="mt-0.5 text-xs text-slate-500">{a.why}</div>}
                  {a.fix && <div className="mt-0.5 text-xs text-blue-300"><span className="font-semibold">Fix:</span> {a.fix}</div>}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {(r.missingKeywords.length > 0 || r.presentKeywords.length > 0) && (
          <Section title="Keywords">
            {r.missingKeywords.length > 0 && (
              <div className="mb-3"><div className="mb-1.5 text-xs text-slate-400">Missing: add the ones you really have</div><Chips items={r.missingKeywords} tone="red" /></div>
            )}
            {r.presentKeywords.length > 0 && <div><div className="mb-1.5 text-xs text-slate-400">Already there</div><Chips items={r.presentKeywords} tone="green" /></div>}
          </Section>
        )}
      </div>
    </div>

    {r.rewrites.length > 0 && (
      <Section title="Rewrite suggestions" icon={Sparkles}>
        <p className="-mt-1 mb-3 text-xs text-slate-500">Built only from what your resume says. Fill in the highlighted <mark className="rounded bg-amber-500/20 px-0.5 text-amber-200">[placeholders]</mark> with real numbers, or drop them.</p>
        <Rewrites items={r.rewrites} />
      </Section>
    )}
  </div>
);

export const ResumeRewriteView: React.FC<{ r: ResumeRewriteResult }> = ({ r }) => (
  <div className="space-y-4">
    <Card>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <ScoreRing score={r.match} label="Job match" />
        <div className="space-y-2">
          <Summary>{r.verdict}</Summary>
          {r.experienceFit && <p className="text-xs text-slate-400"><span className="text-slate-300">Experience:</span> {r.experienceFit}</p>}
        </div>
      </div>
    </Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Skills">
        {r.matchedSkills.length > 0 && <div className="mb-3"><div className="mb-1.5 text-xs text-slate-400">You have</div><Chips items={r.matchedSkills} tone="green" /></div>}
        {r.missingSkills.length > 0 && <div><div className="mb-1.5 text-xs text-slate-400">The job wants, not on your resume</div><Chips items={r.missingSkills} tone="red" /></div>}
      </Section>
      <Section title="Why this score">
        <ul className="space-y-2">
          {r.reasons.map((x, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-200">
              {x.positive ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}{x.point}
            </li>
          ))}
        </ul>
      </Section>
    </div>
    <Section title="Your resume, tailored to this job" icon={Sparkles} action={<CopyButton text={r.rewrittenResume} label="Copy resume" />}>
      {r.placeholders > 0 && <p className="-mt-1 mb-3 text-xs text-amber-300">{r.placeholders} highlighted placeholder{r.placeholders === 1 ? '' : 's'} to fill in with real facts before you send it.</p>}
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950/60 p-4 font-sans text-sm leading-relaxed text-slate-200"><WithPlaceholders text={r.rewrittenResume} /></pre>
    </Section>
    {r.changes.length > 0 && (
      <Section title="What changed">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">{r.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </Section>
    )}
  </div>
);

export const LinkedInView: React.FC<{ r: LinkedInResult }> = ({ r }) => (
  <div className="space-y-4">
    <Card>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <ScoreRing score={r.score} label="Profile score" />
        <Summary>{r.summary}</Summary>
      </div>
    </Card>
    <Section title="Headline options">
      <ul className="space-y-2">
        {r.headlines.map((h, i) => (
          <li key={i} className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 p-3 text-sm text-slate-100">
            <span><WithPlaceholders text={h} /></span><CopyButton text={h} />
          </li>
        ))}
      </ul>
    </Section>
    {r.about && (
      <Section title="About section" action={<CopyButton text={r.about} />}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200"><WithPlaceholders text={r.about} /></p>
      </Section>
    )}
    {r.experience.length > 0 && <Section title="Stronger experience lines" icon={Sparkles}><Rewrites items={r.experience} /></Section>}
    {r.skillsToAdd.length > 0 && <Section title="Skills to add"><Chips items={r.skillsToAdd} tone="blue" /></Section>}
    <GoodBad good={r.good} bad={r.bad} />
  </div>
);

export const CoverLetterView: React.FC<{ r: CoverLetterResult }> = ({ r }) => (
  <div className="space-y-4">
    <Section title={r.company ? `Cover letter for ${r.company}` : 'Cover letter'} action={<CopyButton text={r.letter} label="Copy letter" />}>
      <p className="mb-3 text-xs text-slate-500">{r.words} words · {r.tone} tone</p>
      <div className="whitespace-pre-wrap rounded-xl bg-slate-950/60 p-5 text-sm leading-relaxed text-slate-200"><WithPlaceholders text={r.letter} /></div>
    </Section>
    {r.highlights.length > 0 && (
      <Section title="Facts from your resume it uses">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">{r.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
      </Section>
    )}
  </div>
);

export const InterviewerView: React.FC<{ r: InterviewerResult }> = ({ r }) => (
  <div className="space-y-4">
    <Card>
      <div className="text-lg font-semibold text-white">{r.who.name || 'Your interviewer'}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-300">{r.who.role}{r.who.seniority && <Badge tone="blue">{r.who.seniority}</Badge>}</div>
      {r.who.background && <p className="mt-2 text-sm leading-relaxed text-slate-400">{r.who.background}</p>}
      {r.commonGround.length > 0 && <div className="mt-3"><div className="mb-1.5 text-xs text-slate-400">Common ground</div><Chips items={r.commonGround} tone="green" /></div>}
    </Card>
    <Section title="What they'll likely care about"><GoodList items={r.caresAbout} /></Section>
    <Section title="Questions they'll likely ask" icon={MessageCircleQuestionMark} action={<CopyButton text={r.questions.map(q => q.question).join('\n')} label="Copy questions" />}>
      <ol className="space-y-3">
        {r.questions.map((q, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">{i + 1}</span>
            <div><div className="text-slate-100">{q.question}</div>{q.why && <div className="text-xs text-slate-500">{q.why}</div>}</div>
          </li>
        ))}
      </ol>
    </Section>
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Tips for talking to them" icon={Lightbulb}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">{r.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </Section>
      <Section title="Smart questions to ask them">
        <ul className="space-y-2.5">
          {r.askThem.map((q, i) => (
            <li key={i} className="text-sm"><div className="text-slate-100">“{q.question}”</div>{q.why && <div className="text-xs text-slate-500">{q.why}</div>}</li>
          ))}
        </ul>
      </Section>
    </div>
  </div>
);
