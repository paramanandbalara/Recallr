import { useSyncExternalStore } from 'react';
import {
  BarChart3, BookOpen, Briefcase, Clock, CodeXml, Compass, GraduationCap, Heart, Languages, Mic, MonitorSmartphone, Rocket,
  Server, ShieldCheck, Smile, Sparkles, Star, Target, Users, Zap, type LucideIcon,
} from 'lucide-react';
import { api } from './api';

// The website's editable text (Admin → Website content), loaded with the site settings before the first page shows.
// Until then, or if the server can't be reached, the defaults below are used: the same text as the server's
// defaults in server/src/siteBlocks.ts (keep the two in step).

export const ICONS: Record<string, LucideIcon> = {
  zap: Zap, smile: Smile, languages: Languages, monitor: MonitorSmartphone, sparkles: Sparkles, shield: ShieldCheck, clock: Clock,
  target: Target, graduation: GraduationCap, briefcase: Briefcase, server: Server, chart: BarChart3, users: Users, mic: Mic,
  book: BookOpen, rocket: Rocket, heart: Heart, star: Star, code: CodeXml, compass: Compass,
};
export const ICON_NAMES = Object.keys(ICONS);
export const iconFor = (name: string) => ICONS[name] ?? Sparkles;

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  photoUrl: string;
  published?: boolean;  // Admin only
  permission?: boolean; // Admin only
}

export interface Blocks {
  hero: {
    badge: string; headlineStart: string; rotating: string[]; headlineEnd: string; subtitle: string;
    primaryLabel: string; primaryLabelSignedIn: string; secondaryLabel: string; points: string[]; seoTitle: string; seoDescription: string;
  };
  highlights: { items: { icon: string; value: string; label: string }[] };
  faq: { items: { q: string; a: string }[] };
  useCases: { title: string; subtitle: string; items: { icon: string; title: string; story: string; points: string[] }[] };
  testimonials: { title: string; items: Testimonial[] };
  announcement: { enabled: boolean; text: string; linkLabel: string; linkUrl: string };
  footer: { tagline: string };
  colleges: { badge: string; headline: string; highlight: string; subtitle: string; button: string };
}
export type BlockKey = keyof Blocks;

export const DEFAULT_BLOCKS: Blocks = {
  hero: {
    badge: 'Free trial included with every account',
    headlineStart: 'Never get stuck on',
    rotating: ['a coding round', 'system design', 'an HR round', 'a follow-up', 'a hard question'],
    headlineEnd: 'again',
    subtitle: 'Recallr listens to your interview and quietly suggests answers built from your own resume and the answers you prepared, in about a second.',
    primaryLabel: 'Start your free trial',
    primaryLabelSignedIn: 'Download the app',
    secondaryLabel: 'See it in action',
    points: ['No card needed', 'Windows and macOS', 'Set up in five minutes'],
    seoTitle: 'Recallr – AI interview assistant',
    seoDescription: 'Recallr listens to your interview and suggests simple, natural answers from your own resume in about a second. Mock interviews, prep packs and more.',
  },
  highlights: {
    items: [
      { icon: 'zap', value: '≈ 1 s', label: 'to the first words: the fastest AI answers each time' },
      { icon: 'smile', value: 'Sounds like you', label: 'short sentences and everyday words, scored on every answer' },
      { icon: 'languages', value: 'Many languages', label: 'including Hindi with Hinglish answers' },
      { icon: 'monitor', value: 'Windows & macOS', label: 'one account, your computers' },
    ],
  },
  faq: {
    items: [
      { q: 'Is there a free trial?', a: 'Yes. Your free trial starts the first time you sign in to the app on your computer, so none of it is wasted before you install. One trial per person and per computer. No card needed.' },
      { q: 'What uses “listening time”?', a: 'Speech that Recallr turns into text: listening live during an interview, and your spoken answers in mock interviews. It’s measured from the audio itself and only counts while someone is speaking, not silence, so an hour-long interview usually uses less than an hour.' },
      { q: 'What uses “AI answers”?', a: 'Everything the AI writes or reads for you: answers to questions it hears, questions you type, questions read from your screen (the screenshots count too), regenerating an answer or making it shorter or simpler, key points and follow-ups, prep packs and prepared answers, mock interview questions and scores, interview reviews, company research and resume tools. It’s counted in tokens; the number of answers a plan shows is a typical estimate: long technical answers use more, short ones less.' },
      { q: 'Which call apps does it work with?', a: 'Any app that plays sound on your computer: Zoom, Google Meet, Microsoft Teams, Webex, Skype and others. Recallr listens to your computer’s audio, so there’s nothing to install in the call app.' },
      { q: 'Can I pay by UPI or bank transfer?', a: 'Yes. Pay online by card, UPI or netbanking with Razorpay, or pay us directly and enter the reference. Offline payments unlock once we confirm them, usually within a few hours.' },
      { q: 'What happens when my plan runs out?', a: 'The app asks you to buy a plan or top-up. Your profiles, answers and history are kept; nothing is lost.' },
      { q: 'Where is my data kept?', a: 'Your profiles (resume, job details, notes, prepared answers and stories) are in the app on your computer, and an encrypted copy is kept on your Recallr account so they can be restored and we can improve Recallr. You can turn that off in settings, which deletes the copy. Conversation history stays on your computer. The questions you’re asked, with Recallr’s answers, are saved to your account so you can review them under My questions; only you can see them, and you can turn this off or delete them at any time.' },
    ],
  },
  useCases: {
    title: 'Who it’s for',
    subtitle: 'A few examples of how Recallr can help at different stages. They describe typical situations; they aren’t reviews from real customers.',
    items: [
      {
        icon: 'graduation',
        title: 'A fresher preparing for campus placements',
        story: 'You know your subjects but freeze on “Tell me about yourself” or a question about your final-year project. Add your resume and the company’s job post, do a few mock interviews in the weeks before placements, and watch your scores and filler words improve.',
        points: ['Mock interviews for the role', 'Answers built from your own projects', 'Feedback on pace and filler words'],
      },
      {
        icon: 'server',
        title: 'A backend engineer switching jobs',
        story: 'You’re interviewing while working full time, with coding and system design rounds at several companies. Keep one profile per company, go through each job’s prep pack in the evenings, and glance at key points in the call to recall the numbers from past projects.',
        points: ['A profile per company', 'Prep pack of likely questions', 'Key points for system design'],
      },
      {
        icon: 'chart',
        title: 'A career-changer moving into data analytics',
        story: 'The hard part is linking your past work to the new role. Write your stories once (a process you improved, a report that changed a decision) and Recallr helps turn them into clear answers for SQL, Excel and case questions.',
        points: ['Story bank for “Tell me about a time…”', 'Answers that connect your past work', 'Simple, natural wording'],
      },
      {
        icon: 'target',
        title: 'A bootcamp student doing mock interviews',
        story: 'Practice time is short between modules. Do a mock interview after each one, look at your scores with your coach on the group dashboard, and keep improving a set of prepared answers you’ll use on the day.',
        points: ['Scores after every mock interview', 'Coach sees scores, not your answers', 'Prepared answers come first'],
      },
    ],
  },
  testimonials: { title: 'What users say', items: [] },
  announcement: { enabled: false, text: '', linkLabel: '', linkUrl: '' },
  footer: { tagline: 'Your AI interview assistant, from preparation to the last question.' },
  colleges: {
    badge: 'For colleges, bootcamps and placement cells',
    headline: 'Get every student',
    highlight: 'interview-ready',
    subtitle: 'Give your students Recallr for placement season: realistic mock interviews with scores and speaking feedback, and a dashboard for coaches to see who is ready.',
    button: 'Ask for a group plan',
  },
};

// ---------- The current text, shared by every page ----------

let current: Blocks = DEFAULT_BLOCKS;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// Loaded once at start (main.tsx). Never fails: the defaults stay if the server can't be reached.
export const loadBlocks = async () => {
  try {
    const { blocks } = await api<{ blocks: Partial<Blocks> }>('/site/blocks');
    current = { ...DEFAULT_BLOCKS, ...blocks };
    listeners.forEach(l => l());
  } catch {
    // The defaults are the website's normal text
  }
};

// After the admin saves, the website shows the new text without a reload
export const setBlock = <K extends BlockKey>(key: K, data: Blocks[K]) => {
  const shown = key === 'testimonials'
    ? { ...(data as Blocks['testimonials']), items: (data as Blocks['testimonials']).items.filter(t => t.published && t.permission) }
    : data;
  current = { ...current, [key]: shown };
  listeners.forEach(l => l());
};

export const useBlock = <K extends BlockKey>(key: K): Blocks[K] => useSyncExternalStore(subscribe, () => current[key]);
