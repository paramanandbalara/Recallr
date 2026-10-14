// All user data lives in localStorage on this machine only.

export interface PreparedAnswer {
  id: string;
  question: string;
  notes?: string;  // Coaching tip, e.g. "Keep it to 60–90 seconds"
  answer: string;
}

// Which AI writes the answers. 'auto' uses the fastest provider you have a key for,
// falling back to the next one if it fails.
export type AnswerProvider = 'auto' | 'groq' | 'openai';

export interface Settings {
  groqKey: string;
  openaiKey: string;
  answerProvider: AnswerProvider;
  cv: string;
  cvFileName: string;
  job: string;
  company: string;
  companyNotes: string; // The user's research on the company: products, values, news
  answers: PreparedAnswer[];
}

const KEYS = {
  groqKey: 'secondBrain_groq',
  openaiKey: 'secondBrain_openai',
  answerProvider: 'secondBrain_answerProvider',
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
  profiles: 'secondBrain_profiles',
  activeProfile: 'secondBrain_activeProfile',
  session: 'secondBrain_session',
} as const;

const read = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const write = (key: string, value: string) => {
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

// ---------- Profiles ----------
// A profile is one application: its own resume, job, company and prepared answers.
// API keys and the answer provider are shared by all profiles.

export interface Profile {
  id: string;
  name: string;
  cv: string;
  cvFileName: string;
  job: string;
  company: string;
  companyNotes: string;
  answers: PreparedAnswer[];
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const toProfile = (p: Partial<Profile>): Profile => ({
  id: str(p.id) || newId(),
  name: str(p.name) || 'Untitled',
  cv: str(p.cv),
  cvFileName: str(p.cvFileName),
  job: str(p.job),
  company: str(p.company),
  companyNotes: str(p.companyNotes),
  answers: Array.isArray(p.answers) ? p.answers : [],
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

const saveProfiles = (profiles: Profile[]) => write(KEYS.profiles, JSON.stringify(profiles));

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
  const profile = toProfile({ name: name.trim(), cv: base.cv, cvFileName: base.cvFileName, answers: base.answers });
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
    groqKey: read(KEYS.groqKey) || import.meta.env.VITE_GROQ_API_KEY || '',
    openaiKey: read(KEYS.openaiKey) || import.meta.env.VITE_OPENAI_API_KEY || '',
    answerProvider: (['groq', 'openai'].includes(read(KEYS.answerProvider)) ? read(KEYS.answerProvider) : 'auto') as AnswerProvider,
    cv: profile.cv,
    cvFileName: profile.cvFileName,
    job: profile.job,
    company: profile.company,
    companyNotes: profile.companyNotes,
    answers: profile.answers,
  };
};

// Settings as they'd be with another profile active (e.g. to review an older interview)
export const settingsForProfile = (profileId: string): Settings => {
  const settings = loadSettings();
  const profile = loadProfiles().find(p => p.id === profileId);
  if (!profile) return settings;
  const { cv, cvFileName, job, company, companyNotes, answers } = profile;
  return { ...settings, cv, cvFileName, job, company, companyNotes, answers };
};

// Saves the keys, and the rest into the active profile
export const saveSettings = (settings: Settings) => {
  write(KEYS.groqKey, settings.groqKey.trim());
  write(KEYS.openaiKey, settings.openaiKey.trim());
  write(KEYS.answerProvider, settings.answerProvider);
  const active = loadActiveProfile();
  saveProfiles(loadProfiles().map(p => (p.id !== active.id ? p : {
    ...p,
    cv: settings.cv.trim(),
    cvFileName: settings.cvFileName,
    job: settings.job.trim(),
    company: settings.company.trim(),
    companyNotes: settings.companyNotes.trim(),
    answers: settings.answers.filter(a => a.question.trim() || a.answer.trim()),
  })));
};

const looksLikeKey = (key: string) => key.trim().length > 10;

// At least one AI key (Groq or OpenAI) is needed; both do speech-to-text and answers
export const hasAnyKey = (s: Pick<Settings, 'groqKey' | 'openaiKey'>) =>
  looksLikeKey(s.groqKey) || looksLikeKey(s.openaiKey);

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
  textSize: number;   // Answer text size in px
  theme: 'dark' | 'light';
  keyPoints: boolean; // Show answers as a few key points instead of the full text
}

export const TEXT_SIZES = { min: 12, max: 20, default: 14 };
const DEFAULT_DISPLAY: Display = { bgOpacity: 0.97, textOpacity: 1, textSize: TEXT_SIZES.default, theme: 'dark', keyPoints: false };

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export const loadDisplay = (): Display => {
  try {
    const saved = JSON.parse(read(KEYS.display) || '{}');
    return {
      bgOpacity: clamp(saved.bgOpacity, 0, 1, DEFAULT_DISPLAY.bgOpacity),
      textOpacity: clamp(saved.textOpacity, 0.3, 1, DEFAULT_DISPLAY.textOpacity),
      textSize: clamp(saved.textSize, TEXT_SIZES.min, TEXT_SIZES.max, DEFAULT_DISPLAY.textSize),
      theme: saved.theme === 'light' ? 'light' : 'dark',
      keyPoints: saved.keyPoints === true,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
};
export const saveDisplay = (display: Display) => write(KEYS.display, JSON.stringify(display));

export const newId = () => Math.random().toString(36).slice(2, 10);

// Fill "[company name]" style placeholders in prepared answers
export const fillPlaceholders = (text: string, company: string) =>
  company ? text.replace(/\[(company|company name|the company)\]/gi, company) : text;
