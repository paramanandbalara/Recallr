import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const localStorageMock = {
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

const load = async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', localStorageMock);
  return { storage: await import('./storage'), backup: await import('./backup') };
};

describe('backup', () => {
  beforeEach(() => store.clear());

  it('backs up profiles and settings but never the API keys or caches', async () => {
    store.set('secondBrain_profiles', '[{"id":"p"}]');
    store.set('secondBrain_display', '{}');
    store.set('secondBrain_groq', 'gsk_secret');
    store.set('secondBrain_openai', 'sk-secret');
    store.set('secondBrain_model_groq_fast', 'openai/gpt-oss-20b');
    store.set('other_app_key', 'x');
    const { storage } = await load();
    expect(Object.keys(storage.backupStorage()).sort()).toEqual(['secondBrain_display', 'secondBrain_profiles']);
  });

  it('restores by replacing the backed-up data, keeps the keys, then blocks further writes', async () => {
    store.set('secondBrain_profiles', '[{"id":"old"}]');
    store.set('secondBrain_companyNotes', 'old notes');
    store.set('secondBrain_groq', 'gsk_secret');
    const { storage } = await load();
    storage.restoreStorage({ secondBrain_profiles: '[{"id":"new"}]', secondBrain_groq: 'gsk_from_file' });

    expect(store.get('secondBrain_profiles')).toBe('[{"id":"new"}]');
    expect(store.has('secondBrain_companyNotes')).toBe(false);
    expect(store.get('secondBrain_groq')).toBe('gsk_secret');
    expect(storage.isRestoring()).toBe(true);
    storage.saveConversation([{ id: 'late write' }]);
    expect(store.has('secondBrain_conversation')).toBe(false);
  });

  it('rejects files that are not Recallr backups', async () => {
    const { backup } = await load();
    expect(() => backup.parseBackup('not json')).toThrow("isn't a Recallr backup");
    expect(() => backup.parseBackup('{"app":"other"}')).toThrow("isn't a Recallr backup");
    expect(() => backup.parseBackup('{"app":"recallr","version":2,"storage":{},"sessions":[]}')).toThrow('newer version');
    expect(backup.parseBackup('{"app":"recallr","version":1,"exportedAt":"2026-10-14","storage":{},"sessions":[]}').version).toBe(1);
  });
});
