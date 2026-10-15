import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, CheckCircle2, GraduationCap, Link2, ShieldCheck, Target, Users } from 'lucide-react';
import { api } from '../api';
import { Reveal } from '../components/Showcase';
import { Button, Card, ErrorText, Field, Input, TextArea } from '../components/ui';
import { usePageMeta } from '../seo';
import { useBlock } from '../siteContent';

const POINTS = [
  { icon: Link2, title: 'One invite link', text: 'We set up seats for your group. Share one link: each student creates an account and gets their pack straight away.' },
  { icon: Target, title: 'Practice that’s measured', text: 'Mock interviews for each student’s target role, scored answer by answer, with feedback on pace and filler words.' },
  { icon: BarChart3, title: 'A coach’s view', text: 'See who is practising, their recent scores, how they’ve improved, and who needs a nudge before placements.' },
  { icon: ShieldCheck, title: 'Private for students', text: 'Coaches see practice scores, never students’ interview questions or answers.' },
];

const STEPS = ['Tell us about your group below', 'We agree seats, listening time and dates, and create your group', 'You share the invite link; students join in a minute', 'Track practice from your coach dashboard'];

// /colleges: plans for colleges, bootcamps and placement cells, with an enquiry form
export const Colleges: React.FC = () => {
  usePageMeta('Recallr for colleges and bootcamps', 'Interview practice for your students: mock interviews with scores and speaking feedback, one invite link, and a coach dashboard.');
  const intro = useBlock('colleges');
  const [form, setForm] = useState({ name: '', email: '', phone: '', organization: '', size: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/enquiries', { body: { ...form, size: form.size ? Number(form.size) : null } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="blob pointer-events-none -right-24 -top-24 h-96 w-96 bg-violet-600" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-20 text-center">
          <Reveal>
            {intro.badge && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
                <GraduationCap className="h-3.5 w-3.5 text-blue-300" /> {intro.badge}
              </span>
            )}
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl">{intro.headline}{intro.highlight && <> <span className="gradient-text">{intro.highlight}</span></>}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">{intro.subtitle}</p>
            <a href="#enquire" className="mt-8 inline-block rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-500">{intro.button}</a>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map(({ icon: Icon, title, text }, i) => (
          <Reveal key={title} delay={i * 80} className="card-lift rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <Icon className="h-5 w-5 text-blue-400" />
            <h2 className="mt-3 font-semibold text-slate-100">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
          </Reveal>
        ))}
      </section>

      <section className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-16 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-3xl font-bold text-white">How it works</h2>
          <ol className="mt-6 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-500/40 text-sm font-semibold text-blue-300">{i + 1}</span>
                <span className="pt-0.5 text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
            <Users className="mb-2 h-5 w-5 text-blue-400" />
            Pricing depends on the number of students and how long you need it. Seats can be added later.
          </div>
          <Link to="/ambassadors" className="group mt-4 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400 hover:border-slate-700">
            <GraduationCap className="h-5 w-5 shrink-0 text-violet-300" />
            <span className="flex-1"><span className="font-medium text-slate-200">A student?</span> Become a college ambassador: share Recallr with classmates and get bonus listening time for each friend who joins and pays.</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>

        <Reveal delay={120}>
          <div id="enquire" className="scroll-mt-24"><Card>
            {sent ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                <h2 className="mt-3 text-xl font-semibold text-white">Thank you</h2>
                <p className="mt-2 text-sm text-slate-400">We’ll get back to you at {form.email}.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Ask for a group plan</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Your name"><Input required value={form.name} onChange={set('name')} autoComplete="name" /></Field>
                  <Field label="Work email"><Input required type="email" value={form.email} onChange={set('email')} autoComplete="email" /></Field>
                  <Field label="College, bootcamp or company"><Input required value={form.organization} onChange={set('organization')} autoComplete="organization" /></Field>
                  <Field label="Number of students"><Input type="number" min={1} value={form.size} onChange={set('size')} /></Field>
                </div>
                <Field label="Phone (optional)"><Input value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
                <Field label="Anything we should know (optional)"><TextArea rows={3} value={form.message} onChange={set('message')} placeholder="Roles your students prepare for, placement dates…" /></Field>
                <ErrorText>{error}</ErrorText>
                <Button type="submit" variant="primary" className="w-full" loading={busy}>Send</Button>
              </form>
            )}
          </Card></div>
        </Reveal>
      </section>
    </>
  );
};
