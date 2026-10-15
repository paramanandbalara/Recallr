import { access } from './locales/hi/access';
import { conversation } from './locales/hi/conversation';
import { main } from './locales/hi/main';
import { settings } from './locales/hi/settings';

// Hindi, from one file per group of screens
export const HI: Record<string, string> = { ...main, ...settings, ...conversation, ...access };
