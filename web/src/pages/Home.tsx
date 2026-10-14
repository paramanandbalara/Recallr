import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Ear, EyeOff, FileText, Gauge, Languages, MonitorSmartphone, ScanText, Sparkles, Target } from 'lucide-react';
import { PlanCards } from '../components/PlanCards';
import { useAuth } from '../auth';

const FEATURES = [
  { icon: Ear, title: 'Listens to the call', text: 'Hears the interviewer through your computer’s audio (Zoom, Meet, Teams, any app) and spots each question.' },
  { icon: Gauge, title: 'Answers in about a second', text: 'Answers start streaming almost instantly, so you never sit in silence while it thinks.' },
  { icon: FileText, title: 'Built from your resume', text: 'Every answer uses only facts from your resume, the job description and your notes. No made-up experience.' },
  { icon: BookOpen, title: 'Your prepared answers', text: 'Add the answers you practised. When the question comes, it shows yours, instantly.' },
  { icon: ScanText, title: 'Reads your screen', text: 'Coding problem or question in the chat? One click reads it from your screen and answers it.' },
  { icon: EyeOff, title: 'Stays out of the way', text: 'A small see-through window above your call. Adjust transparency, text size and key-points view.' },
  { icon: Target, title: 'Mock interviews', text: 'Practise with questions for your role, then get scored feedback on every answer.' },
  { icon: Languages, title: 'Many languages', text: 'English, Hindi (with Hinglish answers), and many more languages for the interview.' },
];

const STEPS = [
  { title: 'Create a free account', text: 'No card needed. Your free trial starts when you first sign in to the app.' },
  { title: 'Download the app', text: 'Install Recallr on Windows or macOS and sign in with the same account.' },
  { title: 'Add your resume and the job', text: 'Paste or upload them, and add any answers you’ve prepared.' },
  { title: 'Start listening in your interview', text: 'Click the microphone. Answers appear as the questions are asked.' },
];

const FAQ = [
  { q: 'Is there a free trial?', a: 'Yes. Your free trial starts the first time you sign in to the app on your computer, so none of it is wasted before you install. One trial per person and per computer. No card needed.' },
  { q: 'What does “listening time” mean?', a: 'The time Recallr spends turning speech into text. It only counts while someone is speaking, not silence, so an hour-long interview usually uses less than an hour.' },
  { q: 'What are “AI answers”?', a: 'Each suggested answer, key-point summary or feedback uses AI. Plans include plenty for their listening time; the number shown is a typical estimate.' },
  { q: 'Can I pay by UPI or bank transfer?', a: 'Yes. Pay online by card, UPI or netbanking with Razorpay, or pay us directly and enter the reference. Offline payments unlock once we confirm them, usually within a few hours.' },
  { q: 'What happens when my plan runs out?', a: 'The app asks you to buy a plan or top-up. Your resume, answers and history stay on your computer; nothing is lost.' },
  { q: 'Where is my data kept?', a: 'Your resume, answers and conversations stay on your own computer. Only the audio and text needed for each answer are sent for processing; Recallr doesn’t store them.' },
];

export const Home: React.FC = () => {
  const { user } = useAuth();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.18),transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:pt-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Free trial included with every account
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Never get stuck on an <span className="text-blue-400">interview question</span> again
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            Recallr listens to your interview and quietly suggests answers built from your own resume and the answers you prepared, in about a second.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={user ? '/download' : '/register'} className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-500">
              {user ? 'Download the app' : 'Start your free trial'}
            </Link>
            <Link to="/guide" className="rounded-xl border border-slate-700 px-6 py-3 font-medium text-slate-200 hover:bg-slate-800">See how it works</Link>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <MonitorSmartphone className="h-3.5 w-3.5" /> Windows and macOS
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-white">Everything you need in the interview</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <Icon className="h-5 w-5 text-blue-400" />
              <h3 className="mt-3 font-semibold text-slate-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-white">Ready in five minutes</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-slate-800 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-sm font-semibold text-blue-300">{i + 1}</span>
              <h3 className="mt-3 font-semibold text-slate-100">{step.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-center text-sm text-slate-400">
          Step-by-step instructions are in the <Link to="/guide" className="text-blue-400 hover:text-blue-300">guide</Link>.
        </p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-white">Simple prices, no subscription</h2>
        <p className="mt-2 text-center text-slate-400">Buy a pack when you need it. Top up any time.</p>
        <div className="mt-10">
          <PlanCards
            action={plan => (
              <Link to={user ? `/account/buy?plan=${plan.id}` : `/register?next=${encodeURIComponent(`/account/buy?plan=${plan.id}`)}`}
                className="block rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-500">
                Buy {plan.name}
              </Link>
            )}
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-white">Questions</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map(item => (
            <details key={item.q} className="group rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
              <summary className="cursor-pointer list-none font-medium text-slate-100">{item.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
};
