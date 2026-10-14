// The user's Recallr account. Every AI request goes through the Recallr server, which holds the AI keys
// and counts usage against the user's plan. The sign-in token is kept encrypted by the OS (see
// "Sign-in token" in electron/main.ts), with localStorage as the fallback outside Electron.

const env = import.meta.env as Record<string, string | undefined>;
const trimSlash = (url: string) => url.replace(/\/+$/, '');

// Set both at build time for a release (see .env.example); the defaults are for development
export const API_URL = trimSlash(env.VITE_API_URL || 'http://localhost:4000');
export const WEB_URL = trimSlash(env.VITE_WEB_URL || 'http://localhost:5174');

export const PLAN_EVENT = 'recallr-plan-changed'; // Fired on window when the server says the plan ran out

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
}

export interface Pack {
  id: string;
  planName: string;
  source: 'RAZORPAY' | 'OFFLINE' | 'ADMIN_GRANT' | 'TRIAL' | 'REFERRAL' | 'COUPON';
  expiresAt: string;
  minutesLeft: number | null; // null = unlimited
  tokensLeft: number | null;
}

export interface Allowance {
  active: boolean;
  onTrial: boolean;
  expiresAt: string | null;
  minutesLeft: number | null;
  tokensLeft: number | null;
  packs: Pack[];
}

export interface SignedInDevice {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly data: Record<string, unknown>; // The rest of the server's answer, e.g. the devices signed in
  constructor(status: number, message: string, code?: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// ---------- This computer ----------

interface DeviceInfo {
  fingerprint: string;
  name: string;
  platform: string;
  appVersion: string;
}

let device: DeviceInfo | null = null;
// From the main process (a stable id for this computer); outside Electron, a random id kept in localStorage
const loadDevice = async (): Promise<DeviceInfo> => {
  try {
    const info = await ipc()?.invoke('device:info') as DeviceInfo | undefined;
    if (info?.fingerprint) return info;
  } catch {
    // Below
  }
  let id: string;
  try {
    id = localStorage.getItem('secondBrain_deviceId') || '';
    if (!id) localStorage.setItem('secondBrain_deviceId', (id = crypto.randomUUID()));
  } catch {
    id = crypto.randomUUID();
  }
  return { fingerprint: `browser-${id}`, name: 'Browser', platform: 'web', appVersion: '' };
};

export const appVersion = () => device?.appVersion ?? '';

// ---------- Token ----------

const TOKEN_KEY = 'secondBrain_token';
let token = '';
let secure = false; // Kept in the OS store rather than localStorage

const ipc = (): { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } | undefined =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  typeof window === 'undefined' ? undefined : window.ipcRenderer;

// Load the token before the app starts
export const initAccount = async () => {
  device = await loadDevice();
  try {
    const stored = await ipc()?.invoke('token:get') as { available: boolean; token?: string } | undefined;
    if (stored?.available) {
      secure = true;
      token = stored.token ?? '';
    }
  } catch (error) {
    console.error('Could not open the secure store; keeping the sign-in in local storage:', error);
  }
  if (!secure) {
    try {
      token = localStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      token = '';
    }
  }
  if (token && !tokenHasDevice(token)) {
    saveToken('');
    signedOutNotice = NEEDS_DEVICE_NOTICE;
  }
};

const saveToken = (value: string) => {
  token = value;
  if (secure) {
    ipc()?.invoke('token:set', value).catch(error => console.error('Could not save the sign-in:', error));
    return;
  }
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Signed in for this run only
  }
};

export const isSignedIn = () => !!token;

// AI requests need a sign-in tied to this computer ("did" in the token). A sign-in from before that, or from
// the website, can't use them, so it's dropped and the user signs in again once.
const NEEDS_DEVICE_NOTICE = 'Please sign in again. Recallr now links your sign-in to this computer, and this one was made before that.';
let signedOutNotice = '';

const tokenHasDevice = (value: string) => {
  try {
    const payload = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { did?: string };
    return !!payload.did;
  } catch {
    return true; // Not readable here: let the server decide
  }
};

// Why the user was signed out, shown once on the sign-in screen
export const takeSignedOutNotice = () => {
  const notice = signedOutNotice;
  signedOutNotice = '';
  return notice;
};

// ---------- Requests ----------

export const request = async (path: string, init: RequestInit = {}) => {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(device?.appVersion ? { 'X-App-Version': device.appVersion } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(0, "Can't reach Recallr. Check your internet connection.", 'OFFLINE');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const needsDevice = res.status === 403 && data.code === 'APP_ONLY';
    if (res.status === 401 || needsDevice) saveToken('');
    if (needsDevice) signedOutNotice = NEEDS_DEVICE_NOTICE;
    if ((res.status === 402 || res.status === 401 || needsDevice) && typeof window !== 'undefined') window.dispatchEvent(new Event(PLAN_EVENT));
    throw new ApiError(res.status, data.error ?? `Recallr's server had a problem (${res.status}).`, data.code, data);
  }
  return res;
};

const json = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await request(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
};

// What happened to the free trial when signing in: see the server's grantTrialIfNew
export type TrialResult = 'granted' | 'had_trial' | 'computer_used' | 'none';

export const signIn = async (email: string, password: string) => {
  device ??= await loadDevice();
  const result = await json<{ token: string; trial: TrialResult }>('/auth/login', { email: email.trim(), password, device });
  saveToken(result.token);
  return result.trial;
};

export const signOut = () => saveToken('');

export const fetchAccount = () => json<{ user: User; allowance: Allowance; lowMinutesWarning: number }>('/auth/me');

// ---------- Announcements and updates ----------

export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: 'INFO' | 'WARNING';
}

export const fetchAnnouncements = async () => (await json<{ announcements: Announcement[] }>('/announcements?for=desktop')).announcements;

export interface VersionInfo {
  latest: string | null;
  minimum: string | null;
  notes: string;
  downloads: { windows: string; mac: string };
}

export const fetchVersionInfo = () => json<VersionInfo>('/app/version');

// 1.10.0 is newer than 1.9.3
export const isOlder = (version: string, than: string | null) => {
  if (!version || !than) return false;
  const a = version.split('.').map(n => Number.parseInt(n, 10) || 0);
  const b = than.split('.').map(n => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
};

// "Remind me later" on the optional update: hidden for this version until `until`
export interface UpdateSnooze {
  version: string;
  until: number;
}

export const REMIND_LATER_MS = 24 * 60 * 60 * 1000;

// The optional update to offer, if any: a newer version than this one that wasn't put off for later.
// (An app older than the minimum version is stopped by AccessGate instead.)
export const updateToOffer = (current: string, info: VersionInfo | null, snooze: UpdateSnooze | null, now: number) => {
  const latest = info?.latest;
  if (!latest || !isOlder(current, latest)) return null;
  if (snooze && snooze.version === latest && snooze.until > now) return null;
  return latest;
};

export const downloadUrl = (info: VersionInfo) =>
  (device?.platform === 'darwin' ? info.downloads.mac : info.downloads.windows) || `${WEB_URL}/download`;

// ---------- Cloud backup ----------

export interface CloudBackup {
  sizeBytes: number;
  updatedAt: string;
  deviceName: string;
}

export const fetchCloudBackup = async () => (await json<{ backup: CloudBackup | null }>('/backup')).backup;

// Sent as text so the server stores exactly what the app made
export const uploadCloudBackup = async (text: string) => {
  const res = await request('/backup', { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: text });
  return (await res.json() as { backup: CloudBackup }).backup;
};

export const downloadCloudBackup = async () => (await request('/backup/data')).text();

// Pages on the website, opened in the browser
export const openUrl = (url: string) => {
  // @ts-expect-error ipcRenderer is injected by the preload script
  if (window.ipcRenderer) window.ipcRenderer.send('open-external', url);
  else window.open(url, '_blank');
};

export const openWebsite = (path: string) => {
  const url = `${WEB_URL}${path}`;
  // @ts-expect-error ipcRenderer is injected by the preload script
  if (window.ipcRenderer) window.ipcRenderer.send('open-external', url);
  else window.open(url, '_blank');
};

// ---------- Formatting ----------

export const formatMinutes = (minutes: number | null) =>
  minutes === null ? 'Unlimited' : minutes >= 60 ? `${+(minutes / 60).toFixed(1)} h` : `${Math.floor(minutes)} min`;

export const formatTokens = (n: number | null) =>
  n === null ? 'Unlimited' : n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
