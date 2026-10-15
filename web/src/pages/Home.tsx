import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BookMarked, BookOpen, Briefcase, Building2, CalendarClock, Check, ChevronDown, Clock, CloudUpload, Ear, GraduationCap, History, Keyboard,
  Languages, LayoutTemplate, ListChecks, MonitorSmartphone, Mic, ScanText, ShieldCheck, Smile, Sparkles,
  MailCheck, RefreshCw, Stethoscope, Target, Users, Zap,
} from 'lucide-react';
import { PlanCards } from '../components/PlanCards';
import { LogoMark } from '../components/Logo';
import { AppShot, NaturalAnswers, ProductDemo, ProductTour, Reveal, RotatingWord, SpeedRace, StyleGallery } from '../components/Showcase';
import { useAuth } from '../auth';

const QUESTION_KINDS = ['an interview question', 'a coding round', 'a system design question', 'an HR round', 'a follow-up question'];

const WORKS_WITH = ['Zoom', 'Google Meet', 'Microsoft Teams', 'Webex', 'Skype', 'Slack huddles', 'Phone calls on your computer', 'Any app with sound'];

const HIGHLIGHTS = [
  { icon: Zap, value: '≈ 1 s', label: 'to the first words: the fastest AI answers each time' },
  { icon: Smile, value: 'Sounds like you', label: 'short sentences and everyday words, scored on every answer' },
  { icon: Languages, value: 'Many languages', label: 'including Hindi with Hinglish answers' },
  { icon: MonitorSmartphone, value: 'Windows & macOS', label: 'one account, your computers' },
];

// Real screens of the app, each with what it shows
const SHOWCASE = [
  {
    eyebrow: 'Answers that sound like you',
    title: 'Built from your own story, not made up',
    text: 'Recallr writes every answer from your resume, the job description and your notes. Asked about a time you fixed something? It answers with your project, your numbers and your result.',
    points: ['Uses only facts you gave it', 'Prepared answers come first, word for word', 'One profile per job, each with its own resume'],
    image: '/media/app-light.webp',
    alt: 'Recallr in light mode answering “Tell me about a time you improved the performance of a system” with the candidate’s own project',
    glow: 'emerald' as const,
  },
  {
    eyebrow: 'Glance, don’t read',
    title: 'Key points first, full answer below',
    text: 'In the middle of a conversation you need cues, not paragraphs. Switch to key points and the latest answer opens with four short reminders, then the full text if you need it.',
    points: ['Three or four cues per answer', 'Older answers fold into their key points', 'Likely follow-up questions, with hints'],
    image: '/media/app-keypoints.webp',
    alt: 'Recallr showing four key points above the full answer to a system design question',
    glow: 'blue' as const,
  },
  {
    eyebrow: 'Technical rounds',
    title: 'Coding and system design, explained',
    text: 'Each question is tagged as coding, system design, experience or concept, and answered the way that kind of question needs: an approach you can say out loud, complexity, and clean, highlighted code.',
    points: ['Syntax-highlighted code with a copy button', 'Read the problem straight from your screen', 'Shorter, longer, simpler or more technical in one click'],
    image: '/media/app-coding.webp',
    alt: 'Recallr answering a coding question with an explanation and a highlighted Python function',
    glow: 'violet' as const,
  },
];

const FEATURES = [
  { icon: Ear, title: 'Listens to the call', text: 'Hears the interviewer through your computer’s audio and spots each question as it’s asked.' },
  { icon: Zap, title: 'Fastest AI, every time', text: 'Groq, OpenAI and Claude are timed on every answer, and the quickest one answers. A slow one is never left to keep you waiting.' },
  { icon: Smile, title: 'Answers that sound human', text: 'Short sentences, everyday words, nothing hard to say. Each answer shows a “Natural” score, and one click makes it simpler.' },
  { icon: BookMarked, title: 'Story bank', text: 'Your real stories (a hard problem, a conflict, a failure) ready for “Tell me about a time…”, found in your resume.' },
  { icon: Briefcase, title: 'Prep pack for each job', text: 'The questions this job will likely ask, each with why and a drafted answer. Keep the ones you like.' },
  { icon: CalendarClock, title: 'Interview calendar', text: 'Add your interviews. The day before, a prep pack is offered; just before it starts, the right profile is switched on.' },
  { icon: Building2, title: 'Company research in one click', text: 'Paste the company’s website and get short notes on what they do, so “Why us?” mentions real details.' },
  { icon: Mic, title: 'Speaking feedback', text: 'In mock interviews: your pace, your filler words and the length of each answer, with what to work on.' },
  { icon: LayoutTemplate, title: 'Four window styles', text: 'Classic, Compact, Prompter or Glass, in small, medium or large, or any size you drag it to.' },
  { icon: GraduationCap, title: 'For colleges', text: 'Seats for a whole class with one invite link, and a coach dashboard of everyone’s practice.' },
  { icon: BookOpen, title: 'Your prepared answers', text: 'Add the answers you practised. When the question comes, yours appears instantly.' },
  { icon: ListChecks, title: 'Likely follow-ups', text: 'See the next questions the interviewer is likely to ask, with a hint for each.' },
  { icon: ScanText, title: 'Reads your screen', text: 'Coding problem or question in the chat? One click reads it and answers it.' },
  { icon: Target, title: 'Mock interviews', text: 'Questions for your role, read out loud. Answer by voice and get a score for each.' },
  { icon: Stethoscope, title: 'Pre-interview check', text: 'Tests your microphone, call audio, screen reading and speed before it matters.' },
  { icon: History, title: 'History and review', text: 'Every interview is saved on your computer, with a review of weak spots and a thank-you email.' },
  { icon: Users, title: 'A profile per job', text: 'Keep a separate resume, job description and notes for each company you interview with.' },
  { icon: Languages, title: 'The app in Hindi', text: 'Menus and screens in English or हिन्दी. Answers can come in Hindi (as Hinglish) or English.' },
  { icon: MailCheck, title: 'Weekly progress email', text: 'Your practice for the week, how your speaking changed, and one tip for next week. Turn it off any time.' },
  { icon: RefreshCw, title: 'Updates install themselves', text: 'New versions download inside the app and install with one restart, never while you’re listening.' },
  { icon: CloudUpload, title: 'Cloud backup', text: 'Back up your profiles, answers and history, and restore them on a new computer.' },
  { icon: Keyboard, title: 'Shortcuts everywhere', text: 'Start listening, ask, regenerate or read the screen from any app with a shortcut.' },
  { icon: ShieldCheck, title: 'You stay in control', text: 'Your resume and conversations stay on your computer. Saved questions and answers are yours alone, and you can delete them.' },
];

const STEPS = [
  { title: 'Create a free account', text: 'No card needed. Your free trial starts when you first sign in to the app.' },
  { title: 'Download the app', text: 'Install Recallr on Windows or macOS and sign in with the same account.' },
  { title: 'Add your resume and the job', text: 'Paste or upload them, and add any answers you’ve prepared.' },
  { title: 'Start listening', text: 'Click the microphone. Answers appear as the questions are asked.' },
];

const FAQ = [
  { q: 'Is there a free trial?', a: 'Yes. Your free trial starts the first time you sign in to the app on your computer, so none of it is wasted before you install. One trial per person and per computer. No card needed.' },
  { q: 'What does “listening time” mean?', a: 'The time Recallr spends turning speech into text. It only counts while someone is speaking, not silence, so an hour-long interview usually uses less than an hour.' },
  { q: 'What are “AI answers”?', a: 'Each suggested answer, key-point summary or feedback uses AI. Plans include plenty for their listening time; the number shown is a typical estimate.' },
  { q: 'Which call apps does it work with?', a: 'Any app that plays sound on your computer: Zoom, Google Meet, Microsoft Teams, Webex, Skype and others. Recallr listens to your computer’s audio, so there’s nothing to install in the call app.' },
  { q: 'Can I pay by UPI or bank transfer?', a: 'Yes. Pay online by card, UPI or netbanking with Razorpay, or pay us directly and enter the reference. Offline payments unlock once we confirm them, usually within a few hours.' },
  { q: 'What happens when my plan runs out?', a: 'The app asks you to buy a plan or top-up. Your resume, answers and history stay on your computer; nothing is lost.' },
  { q: 'Where is my data kept?', a: 'Your resume, prepared answers and conversations stay on your own computer. The questions you’re asked, with Recallr’s answers, are saved to your account so you can review them under My questions; only you can see them, and you can turn this off or delete them at any time.' },
];

export const Home: React.FC = () => {
  const { user } = useAuth();
  const startLink = user ? '/download' : '/register';
  const startLabel = user ? 'Download the app' : 'Start your free trial';
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="blob pointer-events-none -left-32 -top-24 h-96 w-96 bg-blue-600" aria-hidden />
        <div className="blob blob-2 pointer-events-none right-0 top-40 h-80 w-80 bg-violet-600" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr]">
          <div className="text-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Free trial included with every account
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
                Never get stuck on<br className="hidden sm:block" />{' '}
                <RotatingWord words={QUESTION_KINDS} className="gradient-text" /> again
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400 lg:mx-0">
                Recallr listens to your interview and quietly suggests answers built from your own resume and the answers you
                prepared, in about a second.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link to={startLink} className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500">
                  {startLabel} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#see-it" className="rounded-xl border border-slate-700 px-6 py-3 font-medium text-slate-200 hover:bg-slate-800">See it in action</a>
              </div>
              <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-400 lg:justify-start">
                {['No card needed', 'Windows and macOS', 'Set up in five minutes'].map(item => (
                  <li key={item} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> {item}</li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={200}>
            <ProductDemo />
          </Reveal>
        </div>
      </section>

      {/* Works with */}
      <section className="border-y border-slate-800/80 bg-slate-900/30 py-5" aria-label="Works with">
        <div className="relative mx-auto max-w-6xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="marquee-track gap-10 pr-10">
            {[...WORKS_WITH, ...WORKS_WITH].map((name, i) => (
              <span key={i} aria-hidden={i >= WORKS_WITH.length} className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400/70" /> {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map(({ icon: Icon, value, label }, i) => (
            <Reveal key={value} delay={i * 80} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <Icon className="h-5 w-5 text-blue-400" />
              <div className="mt-3 text-2xl font-bold text-white">{value}</div>
              <div className="mt-1 text-sm text-slate-400">{label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Product tour: clips of the real app */}
      <section id="see-it" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-blue-400">See it in action</span>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">A quiet helper beside your call</h2>
          <p className="mt-3 text-slate-400">Short clips of the real app. The interview in them is an example.</p>
        </Reveal>
        <Reveal delay={100} className="mt-10"><ProductTour /></Reveal>
      </section>

      {/* Human answers and speed */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-blue-400">Answers you can actually say</span>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Sounds like a person, not like AI</h2>
          <p className="mt-3 text-slate-400">
            Recallr answers the way people talk: short sentences, everyday words, no mouthfuls. Every answer gets a Natural score, and
            one click turns a stiff one into a simpler one.
          </p>
        </Reveal>
        <div className="mt-10"><NaturalAnswers /></div>
        <Reveal delay={100} className="mx-auto mt-6 max-w-3xl"><SpeedRace /></Reveal>
      </section>

      {/* Window styles and sizes */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-blue-400">Your window, your way</span>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Four styles, any size</h2>
          <p className="mt-3 text-slate-400">Pick the look that suits your screen and how you like to read.</p>
        </Reveal>
        <div className="mt-10"><StyleGallery /></div>
      </section>

      {/* Real screens, explained */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mt-16 space-y-24">
          {SHOWCASE.map((item, i) => (
            <div key={item.title} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
              <Reveal className={i % 2 ? 'md:order-2' : ''}>
                <AppShot src={item.image} alt={item.alt} glow={item.glow} className="mx-auto w-full max-w-[340px]" />
              </Reveal>
              <Reveal delay={120}>
                <span className="text-sm font-semibold text-blue-400">{item.eyebrow}</span>
                <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-400">{item.text}</p>
                <ul className="mt-5 space-y-2.5">
                  {item.points.map(point => (
                    <li key={point} className="flex gap-2.5 text-sm text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {point}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          ))}
        </div>
      </section>

      {/* Everything else */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Everything you need, before, during and after</h2>
          <p className="mt-3 text-slate-400">Prepare with mock interviews, get help in the interview, and review it afterwards.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={(i % 3) * 70} className="card-lift rounded-2xl border border-slate-800 bg-slate-900/60 p-5 hover:border-slate-700 hover:bg-slate-900">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Icon className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="mt-3 font-semibold text-slate-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready in five minutes</h2>
        </Reveal>
        <ol className="relative mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="step-line pointer-events-none absolute left-[12%] right-[12%] top-5 hidden h-px bg-gradient-to-r from-blue-500/0 via-blue-500/60 to-blue-500/0 lg:block" aria-hidden />
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 120} className="relative text-center">
              <span className="relative mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-blue-500/40 bg-slate-950 text-sm font-semibold text-blue-300">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold text-slate-100">{step.title}</h3>
              <p className="mx-auto mt-1.5 max-w-[16rem] text-sm text-slate-400">{step.text}</p>
            </Reveal>
          ))}
        </ol>
        <p className="mt-8 text-center text-sm text-slate-400">
          Step-by-step instructions are in the <Link to="/guide" className="text-blue-400 hover:text-blue-300">guide</Link>.
        </p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Simple prices, no subscription</h2>
          <p className="mt-2 text-slate-400">Buy a pack when you need it. Top up any time.</p>
        </Reveal>
        <Reveal delay={100} className="mt-10">
          <PlanCards
            action={plan => (
              <Link to={user ? `/account/buy?plan=${plan.id}` : `/register?next=${encodeURIComponent(`/account/buy?plan=${plan.id}`)}`}
                className="block rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-500">
                Buy {plan.name}
              </Link>
            )}
          />
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Questions</h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 40}>
              <details className="group rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 open:border-slate-700">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-slate-100">
                  {item.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Last call to action */}
      <section className="px-4 pb-20 pt-8">
        <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-600/25 via-slate-900 to-violet-600/20 px-6 py-14 text-center">
          <div className="blob pointer-events-none -right-20 -top-20 h-72 w-72 bg-blue-500" aria-hidden />
          <div className="relative">
            <LogoMark className="mx-auto h-12 w-12 drop-shadow-[0_6px_24px_rgba(124,58,237,0.5)]" />
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Walk into your next interview prepared</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-300">
              Practise with mock interviews today, and have Recallr beside you when it counts.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={startLink} className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-medium text-slate-900 hover:bg-slate-100">
                {startLabel} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/pricing" className="rounded-xl border border-white/20 px-6 py-3 font-medium text-white hover:bg-white/10">See prices</Link>
            </div>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" /> Your free trial starts when you first sign in to the app
            </p>
          </div>
        </Reveal>
      </section>
    </>
  );
};
