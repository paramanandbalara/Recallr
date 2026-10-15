import { HI } from './i18n.hi';

// The app's own menus and screens in English or Hindi. Text is written in English in the code and looked up here,
// so anything not translated yet simply stays in English. (The language of the answers is set per profile.)

export type UiLanguage = 'en' | 'hi';
export const UI_LANGUAGES: { id: UiLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
];

const KEY = 'secondBrain_uiLanguage';
export const UI_LANGUAGE_EVENT = 'recallr:ui-language';

const readLanguage = (): UiLanguage => {
  try {
    return localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
};

let current: UiLanguage = readLanguage();
const apply = () => { if (typeof document !== 'undefined') document.documentElement.lang = current; };
apply();

export const uiLanguage = () => current;

export const setUiLanguage = (language: UiLanguage) => {
  if (language === current) return;
  current = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    // Only for this run
  }
  apply();
  window.dispatchEvent(new Event(UI_LANGUAGE_EVENT));
};

// Dates and times in the chosen language
export const uiLocale = () => (current === 'hi' ? 'hi-IN' : undefined);

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;

// Pass the English text; {name} placeholders are filled from the second argument
export const t = (text: string, vars?: Record<string, string | number>) => fill(current === 'hi' ? HI[text] ?? text : text, vars);
