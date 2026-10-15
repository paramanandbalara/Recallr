// All user data lives in localStorage on this machine. A copy of the profiles is kept on the account while that's
// on (services/profileSync.ts).
import type { KnowledgeFile } from './knowledge';

export interface PreparedAnswer {
  id: string;
  question: string;
  notes?: string;  // Coaching tip, e.g. "Keep it to 60–90 seconds"
  answer: string;
}

// A real story from the candidate's work, kept ready for "Tell me about a time..." questions
export interface Story {
  id: string;
  title: string;     // A few words to recognise it, e.g. "Checkout latency fix"
  situation: string; // The context and the problem
  action: string;    // What the candidate did
  result: string;    // What changed, with numbers if there are any
  themes: StoryTheme[]; // The kinds of questions it answers
}

// The kinds of behavioural questions interviewers ask, so gaps in the story bank show
export const STORY_THEMES = [
  'Leadership', 'Conflict', 'Failure', 'Tight deadline', 'Hard problem', 'Improvement', 'Teamwork', 'Ownership',
] as const;
export type StoryTheme = typeof STORY_THEMES[number];

export interface Settings {
  cv: string;
  cvFileName: string;
  job: string;
  company: string;
  companyNotes: string; // The user's research on the company: products, values, news
  interviewer: string;  // Who's interviewing (role, background), so answers fit who's asking
  knowledge: KnowledgeFile[]; // The user's own notes and documents
  language: string; // Interview language for speech-to-text: a code like 'en' or 'hi', or 'auto'
  answerLanguage: AnswerLanguage;
  answers: PreparedAnswer[];
  stories: Story[]; // The story bank, for behavioural questions
}

// Answer in the language the question was asked in, or always in English
export type AnswerLanguage = 'same' | 'english';

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'auto', label: 'Detect automatically' },
  { code: 'bn', label: 'Bengali' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mr', label: 'Marathi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'es', label: 'Spanish' },
];

const KEYS = {
  cv: 'secondBrain_cv',
  cvFileName: 'secondBrain_cvFile',
  job: 'secondBrain_job',
  company: 'secondBrain_company',
  companyNotes: 'secondBrain_companyNotes',
  answers: 'secondBrain_answers',
  overlay: 'secondBrain_overlay',
  audioSource: 'secondBrain_audioSource',
  conversation: 'secondBrain_conversation',
  display: 'secondBrain_display',
  english: 'secondBrain_english',
  preparedMode: 'secondBrain_preparedMode',
  profiles: 'secondBrain_profiles',
  activeProfile: 'secondBrain_activeProfile',
  session: 'secondBrain_session',
  onboarded: 'secondBrain_onboarded',
} as const;

const read = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const remove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Unavailable; nothing to remove
  }
};

// While a backup is restored, nothing else may write (the window reloads right after)
let restoring = false;
export const isRestoring = () => restoring;

const write = (key: string, value: string) => {
  if (restoring) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable; nothing more we can do
  }
};

const readAnswers = (): PreparedAnswer[] => {
  try {
    const parsed = JSON.parse(read(KEYS.answers) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ---------- Backup ----------
// Everything in localStorage except the sign-in (kept out of backups on purpose) and leftovers of older versions

const BACKUP_PREFIX = 'secondBrain_';
const NOT_BACKED_UP = /^secondBrain_(token|groq|openai|answerProvider|model_|effort_|usage|accessApprovedAt)/;

export const backupStorage = (): Record<string, string> => {
  const entries: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(BACKUP_PREFIX) && !NOT_BACKED_UP.test(key)) entries[key] = localStorage.getItem(key) ?? '';
  }
  return entries;
};

// Replaces the backed-up entries, then blocks further writes until the window reloads
export const restoreStorage = (entries: Record<string, string>) => {
  for (const key of Object.keys(backupStorage())) remove(key);
  for (const [key, value] of Object.entries(entries)) {
    if (key.startsWith(BACKUP_PREFIX) && !NOT_BACKED_UP.test(key) && typeof value === 'string') write(key, value);
  }
  restoring = true;
};

// ---------- Profiles ----------
// A profile is one application: its own resume, job, company and prepared answers.

export interface Profile {
  id: string;
  name: string;
  cv: string;
  cvFileName: string;
  job: string;
  company: string;
  companyNotes: string;
  interviewer: string;
  knowledge: KnowledgeFile[];
  language: string;
  answerLanguage: AnswerLanguage;
  answers: PreparedAnswer[];
  stories: Story[];
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const isStory = (value: unknown): value is Partial<Story> => !!value && typeof value === 'object' && typeof (value as Story).title === 'string';
export const toStory = (s: Partial<Story>): Story => ({
  id: str(s.id) || newId(),
  title: str(s.title).trim(),
  situation: str(s.situation),
  action: str(s.action),
  result: str(s.result),
  themes: Array.isArray(s.themes) ? s.themes.filter((t): t is StoryTheme => (STORY_THEMES as readonly string[]).includes(t)) : [],
});

const toProfile = (p: Partial<Profile>): Profile => ({
  id: str(p.id) || newId(),
  name: str(p.name) || 'Untitled',
  cv: str(p.cv),
  cvFileName: str(p.cvFileName),
  job: str(p.job),
  company: str(p.company),
  companyNotes: str(p.companyNotes),
  interviewer: str(p.interviewer),
  knowledge: Array.isArray(p.knowledge) ? p.knowledge.filter(f => f && typeof f.text === 'string') : [],
  language: LANGUAGES.some(l => l.code === p.language) ? p.language! : 'en',
  answerLanguage: p.answerLanguage === 'english' ? 'english' : 'same',
  answers: Array.isArray(p.answers) ? p.answers : [],
  stories: Array.isArray(p.stories) ? p.stories.filter(isStory).map(toStory) : [],
});

// Before profiles existed these were stored on their own; they become the first profile
const legacyProfile = (): Profile => toProfile({
  name: 'Default',
  cv: read(KEYS.cv),
  cvFileName: read(KEYS.cvFileName),
  job: read(KEYS.job),
  company: read(KEYS.company),
  companyNotes: read(KEYS.companyNotes),
  answers: readAnswers(),
});

// Fired on window after profiles are saved (created, edited, renamed, deleted); services/profileSync.ts listens
export const PROFILES_EVENT = 'recallr:profiles-changed';

const saveProfiles = (profiles: Profile[]) => {
  write(KEYS.profiles, JSON.stringify(profiles));
  if (typeof window !== 'undefined' && !restoring) window.dispatchEvent(new Event(PROFILES_EVENT));
};

export const loadProfiles = (): Profile[] => {
  try {
    const parsed = JSON.parse(read(KEYS.profiles) || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(toProfile);
  } catch {
    // Unreadable: start again from the stored data below
  }
  const first = legacyProfile();
  saveProfiles([first]);
  write(KEYS.activeProfile, first.id);
  return [first];
};

export const loadActiveProfile = (): Profile => {
  const profiles = loadProfiles();
  const id = read(KEYS.activeProfile);
  return profiles.find(p => p.id === id) ?? profiles[0];
};

export const setActiveProfile = (id: string) => write(KEYS.activeProfile, id);

// A new profile keeps the resume and prepared answers of `base`, with the job details left blank
export const createProfile = (name: string, base: Profile): Profile => {
  const profile = toProfile({
    name: name.trim(), cv: base.cv, cvFileName: base.cvFileName, answers: base.answers, knowledge: base.knowledge, stories: base.stories,
    language: base.language, answerLanguage: base.answerLanguage,
  });
  saveProfiles([...loadProfiles(), profile]);
  setActiveProfile(profile.id);
  return profile;
};

export const renameProfile = (id: string, name: string) =>
  saveProfiles(loadProfiles().map(p => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));

// The last profile can't be deleted. Deleting the active one switches to the first remaining.
export const deleteProfile = (id: string) => {
  const remaining = loadProfiles().filter(p => p.id !== id);
  if (remaining.length === 0) return;
  saveProfiles(remaining);
  if (read(KEYS.activeProfile) === id) setActiveProfile(remaining[0].id);
};

export const loadSettings = (): Settings => {
  const profile = loadActiveProfile();
  return {
    cv: profile.cv,
    cvFileName: profile.cvFileName,
    job: profile.job,
    company: profile.company,
    companyNotes: profile.companyNotes,
    interviewer: profile.interviewer,
    knowledge: profile.knowledge,
    language: profile.language,
    answerLanguage: profile.answerLanguage,
    answers: profile.answers,
    stories: profile.stories,
  };
};

// Settings as they'd be with another profile active (e.g. to review an older interview)
export const settingsForProfile = (profileId: string): Settings => {
  const settings = loadSettings();
  const profile = loadProfiles().find(p => p.id === profileId);
  if (!profile) return settings;
  const { cv, cvFileName, job, company, companyNotes, interviewer, knowledge, language, answerLanguage, answers } = profile;
  return { ...settings, cv, cvFileName, job, company, companyNotes, interviewer, knowledge, language, answerLanguage, answers };
};

// Saves into the active profile
export const saveSettings = (settings: Settings) => {
  const active = loadActiveProfile();
  saveProfiles(loadProfiles().map(p => (p.id !== active.id ? p : {
    ...p,
    cv: settings.cv.trim(),
    cvFileName: settings.cvFileName,
    job: settings.job.trim(),
    company: settings.company.trim(),
    companyNotes: settings.companyNotes.trim(),
    interviewer: settings.interviewer.trim(),
    knowledge: settings.knowledge,
    language: settings.language,
    answerLanguage: settings.answerLanguage,
    answers: settings.answers.filter(a => a.question.trim() || a.answer.trim()),
    stories: settings.stories.filter(st => st.title.trim() || st.situation.trim() || st.action.trim() || st.result.trim()),
  })));
};

// The first-run setup (resume, job, answers) is shown once. People who used an older version
// (they added AI keys or a resume) have done it already.
export const loadOnboarded = () =>
  read(KEYS.onboarded) === 'yes' || !!read('secondBrain_groq') || !!read('secondBrain_openai') || loadProfiles().some(p => p.cv.trim());
export const saveOnboarded = () => write(KEYS.onboarded, 'yes');

// Overlay (pinned above all apps) is on unless the user turned it off
export const loadOverlay = () => read(KEYS.overlay) !== 'off';
export const saveOverlay = (on: boolean) => write(KEYS.overlay, on ? 'on' : 'off');

// Listen to system audio (the other people in the call) unless the user picked the microphone
// 'both' hears the call and the user's microphone separately (interviewer and you)
export type AudioSource = 'system' | 'microphone' | 'both';
export const loadAudioSource = (): AudioSource => {
  const saved = read(KEYS.audioSource);
  return saved === 'microphone' || saved === 'both' ? saved : 'system';
};
export const saveAudioSource = (source: AudioSource) => write(KEYS.audioSource, source);

// The conversation is kept across restarts until the user starts a new one
export const loadConversation = <T>(): T[] => {
  try {
    const parsed = JSON.parse(read(KEYS.conversation) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
export const saveConversation = <T>(turns: T[]) => write(KEYS.conversation, JSON.stringify(turns));

// Which saved session the current conversation is (see services/sessions.ts)
export interface CurrentSession {
  id: string;
  startedAt: number;
}
export const newSession = (): CurrentSession => ({ id: newId(), startedAt: Date.now() });
export const saveCurrentSession = (session: CurrentSession) => write(KEYS.session, JSON.stringify(session));
export const loadCurrentSession = (): CurrentSession => {
  try {
    const saved = JSON.parse(read(KEYS.session) || '{}');
    if (typeof saved.id === 'string' && typeof saved.startedAt === 'number') return saved;
  } catch {
    // Start a new one below
  }
  const session = newSession();
  saveCurrentSession(session);
  return session;
};

// How the app looks; changes apply right away, no Save needed
export interface Display {
  bgOpacity: number;   // Window background, 0 (see-through) ..1
  textOpacity: number; // Text and controls, 0.3..1
  textSize: number;   // Answer text size in px (questions, key points and follow-ups scale with it)
  zoom: number;       // The whole app bigger or smaller, 1 = normal
  theme: 'dark' | 'light';
  keyPoints: boolean; // Show answers as a few key points instead of the full text
  layout: Layout;     // The window's style
}

// Window styles: Classic (everything), Compact (latest answer, less chrome), Teleprompter (large answer text,
// extras on hover), Glass (see-through with the system's blur)
export const LAYOUTS = ['classic', 'compact', 'teleprompter', 'glass'] as const;
export type Layout = typeof LAYOUTS[number];

// Window size presets (Display menu); the window can still be resized freely from its edges
export const WINDOW_SIZES = { small: { width: 320, height: 440 }, medium: { width: 400, height: 600 }, large: { width: 520, height: 780 } };

export const TEXT_SIZES = { min: 10, max: 28, default: 14 };
export const ZOOMS = { min: 0.7, max: 1.6, step: 0.1, default: 1 };
const DEFAULT_DISPLAY: Display = { bgOpacity: 0.97, textOpacity: 1, textSize: TEXT_SIZES.default, zoom: ZOOMS.default, theme: 'dark', keyPoints: false, layout: 'classic' };

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export const loadDisplay = (): Display => {
  try {
    const saved = JSON.parse(read(KEYS.display) || '{}');
    return {
      bgOpacity: clamp(saved.bgOpacity, 0, 1, DEFAULT_DISPLAY.bgOpacity),
      textOpacity: clamp(saved.textOpacity, 0.3, 1, DEFAULT_DISPLAY.textOpacity),
      textSize: clamp(saved.textSize, TEXT_SIZES.min, TEXT_SIZES.max, DEFAULT_DISPLAY.textSize),
      zoom: clamp(saved.zoom, ZOOMS.min, ZOOMS.max, DEFAULT_DISPLAY.zoom),
      theme: saved.theme === 'light' ? 'light' : 'dark',
      keyPoints: saved.keyPoints === true,
      layout: (LAYOUTS as readonly string[]).includes(saved.layout) ? saved.layout : 'classic',
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
};
export const saveDisplay = (display: Display) => write(KEYS.display, JSON.stringify(display));

// How the answers' English sounds: 'broken' adds the small slips of everyday non-native English
export type EnglishStyle = 'normal' | 'broken';
export const loadEnglishStyle = (): EnglishStyle => (read(KEYS.english) === 'broken' ? 'broken' : 'normal');
export const saveEnglishStyle = (style: EnglishStyle) => write(KEYS.english, style);

// When a question matches a prepared answer: show it instantly as written, or have the AI retell it
export type PreparedMode = 'instant' | 'retell';
export const loadPreparedMode = (): PreparedMode => (read(KEYS.preparedMode) === 'retell' ? 'retell' : 'instant');
export const savePreparedMode = (mode: PreparedMode) => write(KEYS.preparedMode, mode);

export const newId = () => Math.random().toString(36).slice(2, 10);

// Fill "[company name]" style placeholders in prepared answers
export const fillPlaceholders = (text: string, company: string) =>
  company ? text.replace(/\[(company|company name|the company)\]/gi, company) : text;
