import React, { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';

// Building blocks for the landing page: scroll-in animation, the product clip and framed screenshots.
// The clip and screenshots are the real desktop app (web/public/media).

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Fades and slides its children in the first time they scroll into view
export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string; as?: 'div' | 'li' }> = ({
  children, delay = 0, className = '', as: Tag = 'div',
}) => {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(prefersReducedMotion);
  useEffect(() => {
    if (shown || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setShown(true);
        observer.disconnect();
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [shown]);
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`reveal ${shown ? 'reveal-in' : ''} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
};

// The app's window, at the size it has on screen, with a soft glow behind it
export const AppFrame: React.FC<{ children: React.ReactNode; className?: string; glow?: 'blue' | 'violet' | 'emerald' }> = ({
  children, className = '', glow = 'blue',
}) => (
  <div className={`${/\babsolute\b/.test(className) ? '' : 'relative'} ${className}`}>
    <div className={`app-glow app-glow-${glow}`} aria-hidden />
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60">
      {children}
    </div>
  </div>
);

export const AppShot: React.FC<{ src: string; alt: string; className?: string; glow?: 'blue' | 'violet' | 'emerald' }> = ({
  src, alt, className = '', glow,
}) => (
  <AppFrame className={className} glow={glow}>
    <img src={src} alt={alt} width={400} height={600} loading="lazy" decoding="async" className="block h-auto w-full" />
  </AppFrame>
);

// The hero: a video call, with Recallr's window next to it answering the interviewer's question
export const ProductDemo: React.FC = () => {
  const video = useRef<HTMLVideoElement>(null);
  // Plays only while on screen (and never by itself for people who turned motion off)
  useEffect(() => {
    const el = video.current;
    if (!el || prefersReducedMotion()) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.play().catch(() => {});
      else el.pause();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[560px] pb-40 sm:pb-28 lg:max-w-none">
      {/* The call */}
      <div className="call-window relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-2xl shadow-black/50 sm:mr-10">
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-2 text-[11px] text-slate-500">Interview · Senior Backend Engineer</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="speaking relative aspect-[4/3] rounded-xl bg-gradient-to-br from-indigo-500/30 via-slate-800 to-slate-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-400/30 text-lg font-semibold text-indigo-100">JD</span>
            </div>
            <span className="absolute bottom-2 left-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-slate-200">Interviewer</span>
            <span className="absolute bottom-2 right-2 flex items-end gap-0.5" aria-hidden>
              <i className="eq-bar" /><i className="eq-bar" /><i className="eq-bar" />
            </span>
          </div>
          <div className="relative aspect-[4/3] rounded-xl bg-gradient-to-br from-emerald-500/25 via-slate-800 to-slate-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/25 text-lg font-semibold text-emerald-100">PS</span>
            </div>
            <span className="absolute bottom-2 left-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-slate-200">You</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 pb-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400"><Mic className="h-4 w-4" /></span>
          <span className="h-8 w-16 rounded-full bg-red-500/80" />
        </div>
      </div>

      {/* Recallr, beside the call */}
      <AppFrame className="float-slow absolute bottom-0 right-0 w-[60%] max-w-[260px] sm:w-[44%]">
        <video
          ref={video}
          muted
          loop
          playsInline
          preload="metadata"
          poster="/media/demo-listen-poster.webp"
          width={400}
          height={600}
          className="block h-auto w-full"
          aria-label="Recallr hears the interviewer's question and writes an answer from the candidate's resume"
        >
          <source src="/media/demo-listen.webm" type="video/webm" />
          <source src="/media/demo-listen.mp4" type="video/mp4" />
        </video>
      </AppFrame>
    </div>
  );
};

// Cycles through words with a fade, e.g. the kinds of interview questions
export const RotatingWord: React.FC<{ words: string[]; className?: string }> = ({ words, className = '' }) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % words.length), 2600);
    return () => clearInterval(timer);
  }, [words.length]);
  return (
    <span className="rotating-word" aria-live="off">
      <span key={index} className={`rotating-word-in ${className}`}>{words[index]}</span>
    </span>
  );
};

// A looping clip of the app, playing only while it's on screen (and `active`)
export const LoopVideo: React.FC<{ name: string; label: string; active?: boolean; className?: string }> = ({ name, label, active = true, className = '' }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (active && visible) {
      el.currentTime = 0;
      el.play().catch(() => {});
    } else el.pause();
  }, [active, visible]);
  return (
    <video ref={ref} muted loop playsInline preload="none" poster={`/media/demo-${name}-poster.webp`} width={400} height={600}
      className={`block h-auto w-full ${className}`} aria-label={label}>
      <source src={`/media/demo-${name}.mp4`} type="video/mp4" />
      <source src={`/media/demo-${name}.webm`} type="video/webm" />
    </video>
  );
};

const TOUR = [
  {
    id: 'listen', tab: 'Live answers', title: 'Hears the question, answers in about a second',
    text: 'Start listening and forget about it. When the interviewer asks something, the question appears, gets tagged (experience, coding, design…) and the answer streams in, built from your resume.',
    points: ['Answers start in about a second', 'Uses the earlier conversation for follow-ups', 'Key points and likely follow-ups after each answer'],
  },
  {
    id: 'screen', tab: 'Read your screen', title: 'A question on screen? One click',
    text: 'Coding problem in an editor, a question in the meeting chat, a slide that’s being shared: click the screen button and Recallr reads the question from your screen and answers it, with code when it’s needed.',
    points: ['Reads coding problems with their examples', 'Highlighted code with a copy button', 'Works with any app on your screen'],
  },
  {
    id: 'prep', tab: 'Prep pack', title: 'Know the questions before they’re asked',
    text: 'Recallr reads the job description, your resume and your stories, adds the questions asked most in real interviews, and predicts what this interview will ask, each with why and a drafted answer.',
    points: ['Choose which answers to keep', 'They show instantly when the question comes', 'Practise them in a mock interview'],
  },
  {
    id: 'mock', tab: 'Mock interviews', title: 'Practise out loud, get scored',
    text: 'Questions for your role are read out loud and you answer by voice. Each answer gets a score, what worked, what to improve and a stronger version, plus how you spoke.',
    points: ['Pace in words per minute', 'Filler words: which ones and how many', 'Your progress over time on the website'],
  },
  {
    id: 'styles', tab: 'Window styles', title: 'Make it look the way you like',
    text: 'Classic shows everything. Compact keeps just the latest answer in a small window. Prompter puts the answer in large text. Glass lets your screen show through.',
    points: ['Small, medium or large in one click', 'Resize from any edge, drag anywhere', 'Text size, app size, transparency, dark or light'],
  },
];

// Tabs of short clips of the real app, one feature each
export const ProductTour: React.FC = () => {
  const [active, setActive] = useState(0);
  const item = TOUR[active];
  return (
    <div>
      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-1" role="tablist">
        {TOUR.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${i === active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200'}`}>
            {t.tab}
          </button>
        ))}
      </div>
      <div className="mt-12 grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <div className="relative mx-auto w-full max-w-[340px]">
          {TOUR.map((t, i) => (
            <div key={t.id} className={i === active ? 'tour-in' : 'hidden'}>
              <AppFrame glow={i % 2 ? 'violet' : 'blue'}>
                <LoopVideo name={t.id} label={t.title} active={i === active} />
              </AppFrame>
            </div>
          ))}
        </div>
        <div key={item.id} className="tour-in">
          <span className="text-sm font-semibold text-blue-400">{item.tab}</span>
          <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{item.title}</h3>
          <p className="mt-3 leading-relaxed text-slate-400">{item.text}</p>
          <ul className="mt-5 space-y-2.5">
            {item.points.map(point => (
              <li key={point} className="flex gap-2.5 text-sm text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> {point}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-1.5" aria-hidden>
            {TOUR.map((t, i) => <span key={t.id} className={`h-1 rounded-full transition-all ${i === active ? 'w-8 bg-blue-500' : 'w-3 bg-slate-700'}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

const STYLES = [
  { id: 'classic', name: 'Classic', text: 'Everything: key points, follow-ups and the whole conversation.' },
  { id: 'compact', name: 'Compact', text: 'Just the latest answer, for a small window in a corner.' },
  { id: 'teleprompter', name: 'Prompter', text: 'The answer in large text, easy to read at a glance.' },
  { id: 'glass', name: 'Glass', text: 'See-through, with your screen softly blurred behind.' },
];

// The four window styles, then the three sizes side by side at their real proportions
export const StyleGallery: React.FC = () => (
  <div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {STYLES.map((s, i) => (
        <Reveal key={s.id} delay={i * 90} className="group">
          <div className="card-lift overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 group-hover:border-slate-600">
            <img src={`/media/style-${s.id}.webp`} alt={`Recallr in the ${s.name} style`} loading="lazy" className="block h-auto w-full" />
          </div>
          <div className="mt-3 font-semibold text-slate-100">{s.name}</div>
          <p className="mt-0.5 text-sm text-slate-400">{s.text}</p>
        </Reveal>
      ))}
    </div>
    <Reveal className="mt-14">
      <div className="flex items-end justify-center gap-4 sm:gap-8">
        {[['small', 320, 'Small'], ['medium', 400, 'Medium'], ['large', 520, 'Large']].map(([id, width, name]) => (
          <div key={id as string} className="text-center" style={{ width: `${(width as number) / 5.2}%`, maxWidth: (width as number) * 0.55 }}>
            <img src={`/media/size-${id}.webp`} alt={`Recallr at the ${name} size`} loading="lazy" className="block h-auto w-full rounded-xl border border-slate-800 shadow-2xl shadow-black/50" />
            <div className="mt-2 text-sm font-medium text-slate-300">{name as string}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">One click for small, medium or large, or drag any edge to the size you want.</p>
    </Reveal>
  </div>
);

const ROBOTIC = 'Certainly! Implementing a comprehensive caching strategy facilitated a substantial enhancement in performance, thereby ensuring optimal scalability and seamless user experiences across the platform.';
const NATURAL = 'Our checkout page got really slow at busy times. I found we were loading the same prices on every request, so I cached them for five minutes. Pages went from about a second to under 200 milliseconds.';

// The same answer, AI-sounding and the way Recallr writes it
export const NaturalAnswers: React.FC = () => (
  <div className="grid gap-4 md:grid-cols-2">
    <Reveal className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-red-300">Sounds like AI</span>
        <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-300">Simplify 5/10</span>
      </div>
      <p className="mt-3 leading-relaxed text-slate-400 line-through decoration-red-400/40">{ROBOTIC}</p>
      <p className="mt-3 text-xs text-slate-500">Long words, one huge sentence, phrases nobody says out loud.</p>
    </Reveal>
    <Reveal delay={150} className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-300">Sounds like you</span>
        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-300">Natural 10/10</span>
      </div>
      <p className="mt-3 leading-relaxed text-slate-200">{NATURAL}</p>
      <p className="mt-3 text-xs text-slate-500">Short sentences, everyday words, your own project. Easy to say without stumbling.</p>
    </Reveal>
  </div>
);

// Speed first, drawn: three AIs start, the first to answer wins and the others stop
export const SpeedRace: React.FC = () => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
    <div className="text-sm font-semibold text-slate-200">Every answer goes to the fastest AI right now</div>
    <p className="mt-1 text-xs text-slate-500">Recallr times each one on every answer. If the quickest is slow to start, the next is asked too, and the first to answer wins.</p>
    <div className="mt-5 space-y-3">
      {[['Groq', 'race-a', 'bg-blue-500'], ['Claude', 'race-b', 'bg-violet-500'], ['OpenAI', 'race-c', 'bg-emerald-500']].map(([name, cls, color]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="w-14 text-xs font-medium text-slate-400">{name}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className={`race-bar ${cls} h-full rounded-full ${color}`} />
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 text-xs text-slate-500">Illustration: which AI is fastest changes with the time of day and the question.</div>
  </div>
);
