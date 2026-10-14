import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

// The OS key store in the main process, faked
let osStore: { groqKey: string; openaiKey: string } | null = null;
let available = true;
const invoke = vi.fn(async (channel: string, keys?: { groqKey: string; openaiKey: string }) => {
  if (channel === 'keys:get') return available ? { available: true, ...(osStore ?? { groqKey: '', openaiKey: '' }) } : { available: false };
  if (channel === 'keys:set') {
    if (!available) return false;
    osStore = keys!;
    return true;
  }
});

const load = async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('window', { ipcRenderer: { invoke } });
  const storage = await import('./storage');
  await storage.initKeyStore();
  return storage;
};

describe('API key store', () => {
  beforeEach(() => {
    store.clear();
    osStore = null;
    available = true;
    invoke.mockClear();
  });

  it('moves keys saved in plain text into the OS store and deletes the plain copies', async () => {
    store.set('secondBrain_groq', 'gsk_plain_key_123');
    const { loadSettings } = await load();
    expect(osStore).toEqual({ groqKey: 'gsk_plain_key_123', openaiKey: '' });
    expect(store.has('secondBrain_groq')).toBe(false);
    expect(loadSettings().groqKey).toBe('gsk_plain_key_123');
  });

  it('saves new keys to the OS store only', async () => {
    const { loadSettings, saveSettings } = await load();
    saveSettings({ ...loadSettings(), openaiKey: 'sk-new-key-456' });
    await Promise.resolve();
    expect(osStore?.openaiKey).toBe('sk-new-key-456');
    expect(store.has('secondBrain_openai')).toBe(false);
    expect(loadSettings().openaiKey).toBe('sk-new-key-456');
  });

  it('keeps keys in local storage when the OS cannot encrypt', async () => {
    available = false;
    store.set('secondBrain_groq', 'gsk_plain_key_123');
    const { loadSettings } = await load();
    expect(store.get('secondBrain_groq')).toBe('gsk_plain_key_123');
    expect(loadSettings().groqKey).toBe('gsk_plain_key_123');
  });
});
