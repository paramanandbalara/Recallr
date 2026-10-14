import { beforeEach, describe, expect, it } from 'vitest';
import { createProfile, deleteProfile, loadActiveProfile, loadProfiles, loadSettings, saveSettings, setActiveProfile } from './storage';

// A minimal localStorage for Node
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
});

describe('profiles', () => {
  beforeEach(() => store.clear());

  it('moves data saved before profiles existed into a "Default" profile', () => {
    store.set('secondBrain_cv', 'My resume');
    store.set('secondBrain_company', 'Acme');
    store.set('secondBrain_answers', JSON.stringify([{ id: 'a', question: 'Why Acme?', answer: 'Because.' }]));

    const [profile] = loadProfiles();
    expect(profile).toMatchObject({ name: 'Default', cv: 'My resume', company: 'Acme' });
    expect(profile.answers).toHaveLength(1);
    expect(loadActiveProfile().id).toBe(profile.id);
  });

  it('saves settings into the active profile only', () => {
    const first = loadActiveProfile();
    saveSettings({ ...loadSettings(), cv: 'Resume A', company: 'Acme' });
    const second = createProfile('Shopify – Tech Lead', loadActiveProfile());
    saveSettings({ ...loadSettings(), company: 'Shopify' });

    const profiles = loadProfiles();
    expect(profiles.find(p => p.id === first.id)?.company).toBe('Acme');
    // A new profile keeps the resume but not the job details
    expect(profiles.find(p => p.id === second.id)).toMatchObject({ cv: 'Resume A', company: 'Shopify' });
  });

  it('switches to the first remaining profile when the active one is deleted, and never deletes the last', () => {
    const first = loadActiveProfile();
    const second = createProfile('Second', first);
    setActiveProfile(second.id);
    deleteProfile(second.id);
    expect(loadActiveProfile().id).toBe(first.id);

    deleteProfile(first.id);
    expect(loadProfiles()).toHaveLength(1);
  });

  it('defaults to English and copies the language settings into a new profile', () => {
    expect(loadSettings()).toMatchObject({ language: 'en', answerLanguage: 'same' });
    saveSettings({ ...loadSettings(), language: 'hi', answerLanguage: 'english' });
    const copy = createProfile('Hindi role', loadActiveProfile());
    expect(copy).toMatchObject({ language: 'hi', answerLanguage: 'english' });
  });

  it('shares API keys across profiles', () => {
    saveSettings({ ...loadSettings(), groqKey: 'gsk_shared_key_123' });
    createProfile('Other', loadActiveProfile());
    expect(loadSettings().groqKey).toBe('gsk_shared_key_123');
  });
});
