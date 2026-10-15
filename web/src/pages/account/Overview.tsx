import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, CalendarClock, CheckCircle2, Clock, Download, FileText, Flame, Gift, ListChecks, MessageSquareText, Mic, Sparkles, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { api, date, hours, tokens, type Payment } from '../../api';
import { useAuth } from '../../auth';
import { AccountPage } from '../../components/AccountNav';
import { PaymentTable } from '../../components/PaymentTable';
import { ProgressCard } from '../../components/ProgressCard';
import { Badge, Card } from '../../components/ui';

const SOURCE_LABEL = { TRIAL: 'Free trial', RAZORPAY: 'Paid online', OFFLINE: 'Paid offline', ADMIN_GRANT: 'Given by Recallr', REFERRAL: 'Invite bonus', COUPON: 'With a code', ORGANIZATION: 'From your college' } as const;

// GET /api/me/dashboard (server/src/dashboard.ts)
type Suggestion =
  | { kind: 'resume' }
  | { kind: 'prep'; interviewTitle: string; startsAt: string }
  | { kind: 'topup'; minutesLeft: number; active: boolean }
  | { kind: 'mock' }
  | { kind: 'daily' };

interface Dashboard {
  nextInterview: { clientId: string; title: string; startsAt: string } | null;
  upcomingInterviews: number;
  plan: { active: boolean; onTrial: boolean; expiresAt: string | null; minutesLeft: number | null; tokensLeft: number | null; answersLeft: number | null; lowMinutesWarning: number };
  week: { sessions: number; previousSessions: number; averageScore: number | null; previousAverageScore: number | null; scoreChange: number | null };
  streak: { days: number; practisedToday: boolean; longest: number; recent: { day: string; practised: boolean }[] };
  totals: { sessions: number; averageScore: number | null; bestScore: number | null; dailyAnswers: number };
}

const whenLong = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayWord = (iso: string) => {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(iso)) - day(new Date())) / 86_400_000);
  const time = new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return days === 0 ? `today at ${time}` : days === 1 ? `tomorrow at ${time}` : `on ${whenLong(iso)}`;
};

// ---------- Cards ----------

const Tile: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode; className?: string; to?: string }> = ({ icon, label, children, className = '', to }) => {
  const body = (
    <div className={`group relative h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition-colors ${to ? 'hover:border-slate-700 hover:bg-slate-900/80' : ''} ${className}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/80 text-slate-300">{icon}</span>
        {label}
        {to && <ArrowRight className="ml-auto h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400" />}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
  return to ? <Link to={to} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">{body}</Link> : body;
};

// Days, hours, minutes (and seconds in the last hour) to the interview
const Countdown: React.FC<{ to: string }> = ({ to }) => {
  const [now, setNow] = useState(() => Date.now());
  const left = new Date(to).getTime() - now;
  const close = left < 60 * 60 * 1000;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), close ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [close]);
  if (left <= 0) return <div className="text-2xl font-bold text-emerald-300">Starting now. Good luck!</div>;
  const s = Math.floor(left / 1000);
  const parts = close
    ? [[Math.floor(s / 60), 'min'], [s % 60, 'sec']]
    : [[Math.floor(s / 86400), 'days'], [Math.floor((s % 86400) / 3600), 'hrs'], [Math.floor((s % 3600) / 60), 'min']];
  return (
    <div className="flex gap-2" role="timer" aria-label={`Starts in ${parts.map(([n, u]) => `${n} ${u}`).join(' ')}`}>
      {parts.map(([n, unit]) => (
        <div key={unit} className="min-w-[3.25rem] rounded-xl border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-center">
          <div className="text-xl font-bold tabular-nums text-white">{String(n).padStart(2, '0')}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{unit}</div>
        </div>
      ))}
    </div>
  );
};

const NextInterviewCard: React.FC<{ d: Dashboard }> = ({ d }) => {
  const next = d.nextInterview;
  if (!next) {
    return (
      <Tile icon={<CalendarClock className="h-4 w-4" />} label="Next interview">
        <p className="text-sm font-medium text-slate-200">Nothing scheduled</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Add your interviews in the app (Settings → Interviews) for a countdown here, reminders and a prep pack the day before.</p>
      </Tile>
    );
  }
  return (
    <Tile icon={<CalendarClock className="h-4 w-4" />} label="Next interview" className="border-blue-500/25 bg-gradient-to-br from-blue-600/10 via-slate-900/60 to-slate-900/40">
      <p className="truncate text-base font-semibold text-white" title={next.title}>{next.title}</p>
      <p className="mt-0.5 text-xs text-slate-400">{whenLong(next.startsAt)}{d.upcomingInterviews > 1 && ` · ${d.upcomingInterviews - 1} more coming up`}</p>
      <div className="mt-3"><Countdown to={next.startsAt} /></div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
        <ListChecks className="mt-px h-3.5 w-3.5 shrink-0 text-blue-400" />
        <span><strong className="font-medium text-slate-200">Prep pack in the app:</strong> Settings → Interviews → Prep pack predicts its questions, with an answer to each.</span>
      </p>
    </Tile>
  );
};

const AllowanceCard: React.FC<{ d: Dashboard }> = ({ d }) => {
  const { plan } = d;
  const low = !plan.active || (plan.minutesLeft !== null && plan.minutesLeft < plan.lowMinutesWarning);
  return (
    <Tile icon={<Wallet className="h-4 w-4" />} label="Left on your plan" to="/account/buy">
      {plan.active ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={`text-2xl font-bold tabular-nums ${low ? 'text-amber-300' : 'text-white'}`}>{hours(plan.minutesLeft)}</div>
            <div className="text-xs text-slate-500">of listening</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-white">{plan.answersLeft === null ? 'Unlimited' : `~${plan.answersLeft.toLocaleString('en-IN')}`}</div>
            <div className="text-xs text-slate-500">AI answers</div>
          </div>
        </div>
      ) : (
        <div className="text-2xl font-bold text-amber-300">No active plan</div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {plan.active ? `${plan.onTrial ? 'Free trial' : 'Valid'} until ${date(plan.expiresAt)}` : 'Your free trial starts when you first sign in to the app.'}
      </p>
    </Tile>
  );
};

const Change: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null) return null;
  const up = value > 0;
  const same = value === 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${same ? 'bg-slate-700/50 text-slate-300' : up ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
      {!same && (up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
      {same ? 'Same as last week' : `${up ? '+' : '−'}${Math.abs(value)} vs last week`}
    </span>
  );
};

const WeekCard: React.FC<{ d: Dashboard; saved: number | null }> = ({ d, saved }) => {
  const { week } = d;
  const sessionsDelta = week.sessions - week.previousSessions;
  return (
    <Tile icon={<Mic className="h-4 w-4" />} label="This week’s practice" to="/account/progress">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="text-2xl font-bold tabular-nums text-white">
          {week.averageScore ?? '–'}<span className="text-base font-semibold text-slate-500"> / 10</span>
        </div>
        <Change value={week.scoreChange} />
      </div>
      <div className="text-xs text-slate-500">average score</div>
      <p className="mt-3 text-xs text-slate-400">
        <strong className="font-semibold text-slate-200">{week.sessions}</strong> mock interview{week.sessions === 1 ? '' : 's'}
        <span className="text-slate-500">
          {' '}· {week.previousSessions} last week{sessionsDelta !== 0 && ` (${sessionsDelta > 0 ? '+' : '−'}${Math.abs(sessionsDelta)})`}
        </span>
        {saved !== null && saved > 0 && <span className="text-slate-500"> · {saved} questions saved</span>}
      </p>
    </Tile>
  );
};

const StreakCard: React.FC<{ d: Dashboard }> = ({ d }) => {
  const { streak } = d;
  const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'narrow' });
  return (
    <Tile icon={<Flame className="h-4 w-4" />} label="Streak" className={streak.days > 0 ? 'border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-slate-900/60 to-slate-900/40' : ''}>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-3xl font-bold tabular-nums ${streak.days > 0 ? 'text-orange-300' : 'text-white'}`}>{streak.days}</span>
        <span className="text-sm text-slate-400">day{streak.days === 1 ? '' : 's'} in a row</span>
      </div>
      <div className="mt-3 flex gap-1.5" aria-label="The last 7 days">
        {streak.recent.map(r => (
          <div key={r.day} className="flex flex-col items-center gap-1" title={`${r.day}: ${r.practised ? 'practised' : 'no practice'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${r.practised ? 'bg-gradient-to-br from-orange-400 to-amber-300' : 'bg-slate-800'}`} />
            <span className="text-[9px] text-slate-600">{label(r.day)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {streak.practisedToday ? 'Done for today. ' : streak.days > 0 ? 'Practise today to keep it going. ' : 'A mock interview or today’s question starts one. '}
        {streak.longest > 1 && `Best: ${streak.longest} days.`}
      </p>
    </Tile>
  );
};

// One thing to do next (the server picks it: resume, prep pack, top-up, mock interview, question of the day)
const SUGGESTIONS: Record<Suggestion['kind'], { icon: React.ReactNode; tone: string }> = {
  resume: { icon: <FileText className="h-5 w-5" />, tone: 'from-violet-600/25 border-violet-500/30' },
  prep: { icon: <ListChecks className="h-5 w-5" />, tone: 'from-blue-600/25 border-blue-500/30' },
  topup: { icon: <Wallet className="h-5 w-5" />, tone: 'from-amber-500/20 border-amber-500/30' },
  mock: { icon: <Mic className="h-5 w-5" />, tone: 'from-emerald-600/20 border-emerald-500/30' },
  daily: { icon: <MessageSquareText className="h-5 w-5" />, tone: 'from-sky-600/20 border-sky-500/30' },
};

const suggestionText = (s: Suggestion) => {
  switch (s.kind) {
    case 'resume': return { title: 'Add your resume in the app', text: 'Answers sound like you when Recallr knows your experience. In the app, open Settings → Profile and add your resume.', cta: 'How to set it up', to: '/guide' };
    case 'prep': return { title: `Build a prep pack for ${s.interviewTitle}`, text: `Your interview is ${dayWord(s.startsAt)}. In the app: Settings → Interviews → Prep pack predicts the questions, with an answer to each from your resume.`, cta: 'Open the guide', to: '/guide' };
    case 'topup': return s.active
      ? { title: 'Top up your listening time', text: `Only ${s.minutesLeft} min left. Add a top-up so you don’t run out during an interview.`, cta: 'Buy a top-up', to: '/account/buy' }
      : { title: 'Get a plan', text: 'You don’t have an active plan. Pick one to keep using Recallr in your interviews.', cta: 'See plans', to: '/account/buy' };
    case 'mock': return { title: 'Do a mock interview this week', text: 'Ten minutes out loud makes the real answers much easier. In the app: Display → Mock interview. You get a score and tips.', cta: 'See your progress', to: '/account/progress' };
    case 'daily': return { title: 'Answer today’s question', text: 'One question a day, scored with feedback. It keeps your streak going in two minutes.', cta: 'Today’s question', to: '/account/daily' };
  }
};

const SuggestionCard: React.FC<{ s: Suggestion }> = ({ s }) => {
  const { title, text, cta, to } = suggestionText(s);
  const look = SUGGESTIONS[s.kind];
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br via-slate-900 to-slate-900 p-5 sm:p-6 ${look.tone}`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/10 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">{look.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-300"><Sparkles className="h-3.5 w-3.5" /> Suggested next</div>
          <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{text}</p>
        </div>
        <Link to={to} className="group inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
          {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
};

const Skeleton: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading your dashboard">
    <div className="h-28 animate-pulse rounded-2xl bg-slate-900/70" />
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-900/70" />)}
    </div>
  </div>
);

// ---------- The page ----------

export const AccountOverview: React.FC = () => {
  const { user, allowance, refresh } = useAuth();
  const [params] = useSearchParams();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard & { suggestion: Suggestion } | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    refresh();
    api<{ payments: Payment[] }>('/billing/payments').then(r => setPayments(r.payments), () => setPayments([]));
    api<Dashboard & { suggestion: Suggestion }>('/me/dashboard').then(setDashboard, () => setFailed(true));
    api<{ byCategory: Record<string, number> }>('/questions/mine')
      .then(q => setSaved(Object.values(q.byCategory).reduce((a, b) => a + b, 0)), () => {});
  }, [refresh]);

  const pending = payments?.filter(p => p.status === 'PENDING') ?? [];
  const firstName = user!.name.split(' ')[0];

  return (
    <AccountPage title={`Hi, ${firstName}`}>
      {params.get('welcome') && (
        <div className="mb-6 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <strong>Your account is ready.</strong>{' '}
            Next: <Link to="/download" className="underline">download the app</Link> and sign in with {user!.email}: your free trial starts then.
            The <Link to="/guide" className="underline">guide</Link> walks you through the rest.
          </div>
        </div>
      )}
      {params.get('reset') && (
        <div className="mb-6 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div><strong>Password changed.</strong> Sign in to the app again with the new one.</div>
        </div>
      )}
      {params.get('paid') && (
        <div className="mb-6 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div><strong>Payment received, your plan is active.</strong> In the app, click “I’ve paid, check again” (or restart it).</div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <strong>{pending.length === 1 ? 'Your offline payment is' : `${pending.length} offline payments are`} waiting for confirmation.</strong>{' '}
            We check payments within a few hours; the plan starts as soon as it’s confirmed.
          </div>
        </div>
      )}

      {dashboard ? (
        <div className="space-y-4">
          <SuggestionCard s={dashboard.suggestion} />
          <div className="grid gap-4 sm:grid-cols-2">
            <NextInterviewCard d={dashboard} />
            <AllowanceCard d={dashboard} />
            <WeekCard d={dashboard} saved={saved} />
            <StreakCard d={dashboard} />
          </div>
        </div>
      ) : failed ? (
        <Card><p className="text-sm text-slate-400">Your dashboard couldn’t be loaded just now. Your plan and payments are below.</p></Card>
      ) : <Skeleton />}

      {dashboard && (dashboard.totals.sessions > 0 || dashboard.streak.days > 0) && (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Your progress card</h2>
              <p className="mt-1 text-sm text-slate-400">Made on this page from your practice. Download it, or share it with friends or on LinkedIn.</p>
            </div>
          </div>
          <div className="mt-4 max-w-2xl">
            <ProgressCard stats={{
              name: firstName,
              streakDays: dashboard.streak.days,
              recent: dashboard.streak.recent.map(r => r.practised),
              sessions: dashboard.totals.sessions,
              averageScore: dashboard.totals.averageScore,
              bestScore: dashboard.totals.bestScore,
            }} />
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Your plan</h2>
        {allowance?.active ? (allowance.onTrial ? <Badge tone="green">Free trial</Badge> : <Badge tone="blue">Active</Badge>) : <Badge tone="red">No active plan</Badge>}
      </div>

      {allowance?.active ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-900 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Pack</th>
                  <th className="px-3 py-2 font-medium">Listening left</th>
                  <th className="px-3 py-2 font-medium">Tokens left</th>
                  <th className="px-3 py-2 font-medium">Ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {allowance.packs.map(pack => (
                  <tr key={pack.id}>
                    <td className="px-3 py-2"><div className="text-slate-200">{pack.planName}</div><div className="text-xs text-slate-500">{SOURCE_LABEL[pack.source]}</div></td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{hours(pack.minutesLeft)}{pack.listeningMinutes !== null && <span className="text-slate-500"> of {hours(pack.listeningMinutes)}</span>}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{tokens(pack.tokensLeft)}</td>
                    <td className="px-3 py-2 text-slate-300">{date(pack.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">A typical answer uses 1,500–3,000 tokens.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/account/buy" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
              {allowance.onTrial ? 'Upgrade to a full plan' : 'Buy a top-up'}
            </Link>
            <Link to="/download" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
              <Download className="h-4 w-4" /> Download the app
            </Link>
          </div>
        </>
      ) : (
        <Card className="mt-4">
          <p className="text-sm text-slate-300">
            You don’t have an active plan. New here? Your free trial starts when you first sign in to the <Link to="/download" className="text-blue-400">app</Link> (one per computer).
            Otherwise, buy a plan to keep using Recallr.
          </p>
          <Link to="/account/buy" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">See plans</Link>
        </Card>
      )}

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Payments</h2>
        <Link to="/account/billing" className="text-sm text-blue-400 hover:text-blue-300">Invoices and billing details</Link>
      </div>
      <div className="mt-4">{payments && <PaymentTable payments={payments} />}</div>
    </AccountPage>
  );
};
