import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, Gift, GraduationCap, Link2, MessageCircle, Megaphone, ShieldCheck, Trophy, Users, XCircle } from 'lucide-react';
import { api, hours } from '../api';
import { useAuth } from '../auth';
import { Reveal } from '../components/Showcase';
import { Badge, Button, Card, ErrorText, Field, Input, TextArea } from '../components/ui';
import { usePageMeta } from '../seo';

// /ambassadors: the college ambassador programme, and the application form for signed-in users.
// It promises only what the system does: a bigger invite bonus for approved ambassadors and a place on the leaderboard.

interface Program {
  bonusMinutes: number;
  friendMinutes: number;
  days: number;
}

export interface AmbassadorApplication {
  status: 'APPLIED' | 'APPROVED' | 'REJECTED';
  college: string;
  city: string;
  course: string;
  why: string;
  note: string;
  createdAt: string;
  approvedAt: string | null;
}

const DO = [
  { icon: Link2, title: 'Share your invite link', text: 'Tell classmates, juniors and your placement groups about Recallr, with your own invite link.' },
  { icon: Users, title: 'Help friends get started', text: 'Show them how to add a resume and do a first mock interview before placement season.' },
  { icon: MessageCircle, title: 'Tell us what students need', text: 'Let us know which companies, roles and questions your campus is preparing for.' },
];

const RULES = [
  'Say that you’re a Recallr ambassador and get a bonus for invites whenever you share your link.',
  'Be honest about what Recallr does. No spam, no fake accounts, no paid ads with your link.',
  'Your college’s rules come first: don’t share where it isn’t allowed.',
  'We review every application, and may end an ambassador role that breaks these rules.',
];

// The application's status, also used on the account's Invite friends page
export const AmbassadorStatus: React.FC<{ application: AmbassadorApplication; bonusMinutes?: number }> = ({ application, bonusMinutes }) => {
  const { status, college, note } = application;
  const look = {
    APPLIED: { icon: Clock, tone: 'amber' as const, label: 'Application received', text: `Thanks for applying for ${college}. We’ll email you when we’ve looked at it.` },
    APPROVED: {
      icon: CheckCircle2, tone: 'green' as const, label: 'You’re an ambassador',
      text: `You’re Recallr’s ambassador for ${college}.${bonusMinutes ? ` You get ${hours(bonusMinutes)} of bonus listening time for each friend who joins with your link and makes their first payment.` : ''}`,
    },
    REJECTED: { icon: XCircle, tone: 'red' as const, label: 'Not approved', text: `We couldn’t take your application for ${college} forward. You can still invite friends with your link.` },
  }[status];
  const Icon = look.icon;
  return (
    <div className="flex gap-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${status === 'APPROVED' ? 'text-emerald-300' : status === 'APPLIED' ? 'text-amber-300' : 'text-red-300'}`} />
      <div>
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-100">College ambassador</span><Badge tone={look.tone}>{look.label}</Badge></div>
        <p className="mt-1 text-sm text-slate-400">{look.text}</p>
        {note && <p className="mt-2 rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">{note}</p>}
      </div>
    </div>
  );
};

const ApplyForm: React.FC<{ onDone: (a: AmbassadorApplication) => void }> = ({ onDone }) => {
  const [form, setForm] = useState({ college: '', city: '', course: '', why: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone((await api<{ ambassador: AmbassadorApplication }>('/ambassadors/apply', { body: form })).ambassador);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="text-xl font-semibold text-white">Apply</h2>
      <Field label="College"><Input required minLength={2} maxLength={200} value={form.college} onChange={set('college')} placeholder="e.g. Government Engineering College, Ajmer" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City"><Input required minLength={2} maxLength={100} value={form.city} onChange={set('city')} /></Field>
        <Field label="Course and year"><Input required minLength={2} maxLength={200} value={form.course} onChange={set('course')} placeholder="e.g. B.Tech CSE, 3rd year" /></Field>
      </div>
      <Field label="Why would you like to be an ambassador?" hint="A few sentences: your clubs, groups, or how you help classmates prepare.">
        <TextArea required minLength={20} maxLength={1000} rows={4} value={form.why} onChange={set('why')} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>Send application</Button>
      <p className="text-xs text-slate-500">We keep your application as described in our <Link to="/privacy" className="text-blue-400">privacy policy</Link>.</p>
    </form>
  );
};

export const Ambassadors: React.FC = () => {
  usePageMeta('College ambassadors – Recallr', 'Share Recallr with your classmates and get bonus listening time for every friend who joins and pays.');
  const { user, loading } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [application, setApplication] = useState<AmbassadorApplication | null | undefined>(undefined);

  useEffect(() => {
    api<Program>('/ambassadors/program').then(setProgram, () => {});
  }, []);
  useEffect(() => {
    if (!user) return;
    api<{ ambassador: AmbassadorApplication | null }>('/ambassadors/me').then(r => setApplication(r.ambassador), () => setApplication(null));
  }, [user]);

  const bonus = program && program.bonusMinutes > 0 ? hours(program.bonusMinutes) : null;
  const GET = [
    { icon: Gift, title: bonus ? `${bonus} for each paying friend` : 'A bigger invite bonus', text: `When a friend signs up with your link and makes their first payment, you get ${bonus ?? 'the ambassador bonus'} of listening time instead of the usual ${program && program.friendMinutes > 0 ? hours(program.friendMinutes) : 'bonus'}${program ? `, valid for ${program.days} days` : ''}.` },
    { icon: Users, title: 'Your friends get a bonus too', text: program && program.friendMinutes > 0 ? `Each friend gets ${hours(program.friendMinutes)} of bonus listening time on their first payment.` : 'Friends who join with your link get the usual invite bonus on their first payment.' },
    { icon: Trophy, title: 'A place on the leaderboard', text: 'See how many friends you’ve brought this month and overall, next to other inviters (first names only).' },
  ];

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="blob pointer-events-none -left-24 -top-24 h-96 w-96 bg-blue-600" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-20 text-center">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
              <GraduationCap className="h-3.5 w-3.5 text-blue-300" /> College ambassadors
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl">Bring Recallr to <span className="gradient-text">your campus</span></h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
              Help your classmates get ready for placements, and get {bonus ? `${bonus} of` : ''} bonus listening time for every friend who joins with your link and pays.
            </p>
            <a href="#apply" className="mt-8 inline-block rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-500">Apply to be an ambassador</a>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <Reveal><h2 className="text-center text-2xl font-bold text-white">What ambassadors do</h2></Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {DO.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 80} className="card-lift rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <Icon className="h-5 w-5 text-blue-400" />
              <h3 className="mt-3 font-semibold text-slate-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <Reveal><h2 className="text-center text-2xl font-bold text-white">What you get</h2></Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {GET.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 80} className="card-lift rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-5">
              <Icon className="h-5 w-5 text-emerald-300" />
              <h3 className="mt-3 font-semibold text-slate-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Bonuses are listening time on your Recallr account. They aren’t cash and can’t be exchanged for money.</p>
      </section>

      <section className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-14 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-2xl font-bold text-white">The rules</h2>
          <ul className="mt-5 space-y-3">
            {RULES.map(rule => (
              <li key={rule} className="flex gap-3 text-slate-300"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" /> {rule}</li>
            ))}
          </ul>
          <div className="mt-8 flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
            <Megaphone className="h-5 w-5 shrink-0 text-violet-300" />
            <p>Is your whole college or bootcamp interested? See <Link to="/colleges" className="text-blue-400 hover:text-blue-300">group plans for colleges</Link>.</p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div id="apply" className="scroll-mt-24"><Card>
            {loading ? null : !user ? (
              <div className="py-6 text-center">
                <h2 className="text-xl font-semibold text-white">Apply</h2>
                <p className="mt-2 text-sm text-slate-400">Create a free account or sign in to apply. Your invite link comes with your account.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Link to={`/register?next=${encodeURIComponent('/ambassadors#apply')}`} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Create an account</Link>
                  <Link to={`/login?next=${encodeURIComponent('/ambassadors#apply')}`} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Sign in</Link>
                </div>
              </div>
            ) : application === undefined ? null : application ? (
              <div className="space-y-4">
                <AmbassadorStatus application={application} bonusMinutes={program?.bonusMinutes} />
                <Link to="/account/invite" className="inline-block text-sm text-blue-400 hover:text-blue-300">Your invite link and the leaderboard →</Link>
              </div>
            ) : (
              <ApplyForm onDone={setApplication} />
            )}
          </Card></div>
        </Reveal>
      </section>
    </>
  );
};
