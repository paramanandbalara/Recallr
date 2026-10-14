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
