import React, { useEffect, useRef, useState } from 'react';
import { BookOpenText, Building2, CalendarClock, Gauge, Languages, MailCheck, Mic, RefreshCw, Smile } from 'lucide-react';
import { AppFrame, LoopVideo, Reveal } from './Showcase';

// Newer, livelier pieces of the home page: a reading progress bar, floating stats around the hero demo, and a
// bento grid of the newest features (clips of the real app plus small animated demos).

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A thin gradient bar along the top that fills as the page scrolls
export const ScrollProgress: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => { frame ||= requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={ref} aria-hidden className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left scale-x-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-400" />;
};

// Small cards that float around the hero demo (large screens only)
export const HeroBadges: React.FC = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
    <div className="float-card absolute -left-14 top-16 flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur">
      <Gauge className="h-4 w-4 text-sky-300" />
      <div><div className="text-xs font-semibold text-white">0.6 s</div><div className="text-[10px] text-slate-400">to the first words</div></div>
    </div>
    <div className="float-card float-card-2 absolute -right-10 top-1/3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur">
      <Smile className="h-4 w-4 text-emerald-300" />
      <div><div className="text-xs font-semibold text-emerald-300">Natural 9/10</div><div className="text-[10px] text-slate-400">easy to say out loud</div></div>
    </div>
    <div className="float-card float-card-3 absolute -left-8 bottom-20 flex items-center gap-2 rounded-xl border border-violet-500/30 bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur">
      <Languages className="h-4 w-4 text-violet-300" />
      <div className="text-xs font-semibold text-white">English · हिन्दी</div>
    </div>
  </div>
);

// A card whose border and background light up under the pointer
const Spotlight: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - box.left}px`);
    el.style.setProperty('--y', `${e.clientY - box.top}px`);
  };
  return (
    <div ref={ref} onPointerMove={move} className={`spotlight relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 ${className}`}>
      {children}
    </div>
  );
};

// Starts a short animation again every `ms` while on screen (so it reads like a looping GIF)
const useLoop = (ms: number) => {
  const ref = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (entry.isIntersecting) timer = setInterval(() => setRound(r => r + 1), ms);
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); clearInterval(timer); };
  }, [ms]);
  return { ref, round };
};

// Company research: a website address is typed, then short notes appear
const ResearchDemo: React.FC = () => {
  const { ref, round } = useLoop(7000);
  return (
    <div ref={ref} className="rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4 font-mono text-[12px]" aria-hidden>
      <div key={round}>
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span className="type-in overflow-hidden whitespace-nowrap">northwind.com</span>
          <span className="caret h-3.5 w-px bg-sky-300" />
        </div>
        <ul className="mt-3 space-y-2 font-sans text-[12px] text-slate-300">
          {['Freight and logistics software for mid-size shippers', 'Moving its tracking platform to event-driven services', 'Values: ownership, customers first, write things down'].map((note, i) => (
            <li key={note} className="note-in flex gap-2" style={{ animationDelay: `${1.6 + i * 0.6}s` }}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" /> {note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// The weekly email: practice minutes as growing bars, and one tip
const WeeklyDemo: React.FC = () => {
  const { ref, round } = useLoop(7000);
  const days = [30, 55, 20, 70, 45, 85, 60];
  return (
    <div ref={ref} className="rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4" aria-hidden>
      <div key={round}>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><MailCheck className="h-3.5 w-3.5 text-emerald-300" /> Your week with Recallr</span>
          <span>Mon 9:00</span>
        </div>
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {days.map((h, i) => (
            <span key={i} className="bar-up flex-1 origin-bottom rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[['5', 'mock answers'], ['148', 'words / min'], ['7.6', 'average score']].map(([value, label], i) => (
            <div key={label} className="note-in rounded-lg bg-slate-900 py-1.5" style={{ animationDelay: `${1 + i * 0.2}s` }}>
              <div className="text-sm font-semibold text-white">{value}</div>
              <div className="text-[10px] text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        <p className="note-in mt-3 text-[11px] text-slate-300" style={{ animationDelay: '1.9s' }}>
          <span className="font-semibold text-emerald-300">Tip:</span> you said “basically” 9 times. Pause instead; it sounds more sure.
        </p>
      </div>
    </div>
  );
};

const CLIPS = [
  { name: 'resume', icon: Mic, title: 'Test interview from your resume', text: 'One click: questions on your own projects and skills, at your level, read out loud. Answer by voice and get scored.', glow: 'violet' as const },
  { name: 'calendar', icon: CalendarClock, title: 'Interview calendar', text: 'The day before, a prep pack is offered. Just before it starts, the right profile switches on.', glow: 'blue' as const },
  { name: 'hindi', icon: Languages, title: 'The app in Hindi', text: 'Menus and screens in English or हिन्दी, switched in one click.', glow: 'emerald' as const },
  { name: 'update', icon: RefreshCw, title: 'Updates install themselves', text: 'New versions download inside the app and install with one restart. Never while you’re listening.', glow: 'blue' as const },
];

// Each clip plays while it's on screen, like a GIF (LoopVideo pauses it when scrolled away)
const ClipCard: React.FC<(typeof CLIPS)[number] & { delay: number }> = ({ name, icon: Icon, title, text, glow, delay }) => (
  <Reveal delay={delay}>
    <Spotlight className="h-full p-4">
      <AppFrame glow={glow} className="mx-auto max-w-[260px]">
        <LoopVideo name={name} label={title} />
      </AppFrame>
      <div className="mt-5 flex items-center gap-2">
        <span className="rounded-lg bg-slate-800 p-1.5"><Icon className="h-4 w-4 text-sky-300" /></span>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
    </Spotlight>
  </Reveal>
);

export const NewFeatures: React.FC = () => (
  <div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CLIPS.map((clip, i) => <ClipCard key={clip.name} {...clip} delay={i * 90} />)}
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Reveal className="lg:col-span-1">
        <Spotlight className="h-full p-6">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-sky-300" /><h3 className="font-semibold text-white">Company research in one click</h3></div>
          <p className="mt-2 text-sm text-slate-400">Paste their website; get short notes, so “Why us?” mentions real details.</p>
          <div className="mt-5"><ResearchDemo /></div>
        </Spotlight>
      </Reveal>
      <Reveal delay={90} className="lg:col-span-1">
        <Spotlight className="h-full p-6">
          <div className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-emerald-300" /><h3 className="font-semibold text-white">Weekly progress email</h3></div>
          <p className="mt-2 text-sm text-slate-400">Every Monday: your practice, how your speaking changed, and one tip.</p>
          <div className="mt-5"><WeeklyDemo /></div>
        </Spotlight>
      </Reveal>
      <Reveal delay={180} className="lg:col-span-1">
        <Spotlight className="flex h-full flex-col p-6">
          <div className="flex items-center gap-2"><BookOpenText className="h-5 w-5 text-violet-300" /><h3 className="font-semibold text-white">Free interview guides</h3></div>
          <p className="mt-2 text-sm text-slate-400">The blog and question library: how to answer real interview questions, in plain words.</p>
          <ul className="mt-5 space-y-2 text-sm">
            {['How to answer “Tell me about yourself”', 'The STAR method, with one real story', 'System design questions freshers get'].map((title, i) => (
              <li key={title} className="note-in rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-slate-200" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>{title}</li>
            ))}
          </ul>
          <div className="mt-auto flex gap-4 pt-5 text-sm font-medium">
            <a href="/blog" className="text-sky-300 hover:text-sky-200">Read the blog →</a>
            <a href="/interview-questions" className="text-sky-300 hover:text-sky-200">Question library →</a>
          </div>
        </Spotlight>
      </Reveal>
    </div>
  </div>
);
