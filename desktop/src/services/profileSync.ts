import { ApiError, isSignedIn, request, SIGNED_IN_EVENT } from './account';
import { loadActiveProfile, loadProfiles, PROFILES_EVENT, type Profile } from './storage';

// A copy of each profile (resume, job, company, notes, prepared answers, stories) is kept on the Recallr account,
// with the original resume file (see server/src/routes/profiles.ts). It never gets in the way of answers: changes
// are sent in the background a few seconds after they stop, only profiles that changed since the last send, one
// request at a time, and failures are only logged and tried again later. Nothing is sent while signed out, or
// once the user turned it off.

const STATE_KEY = 'secondBrain_profileSync';
const DEBOUNCE_MS = 5000;
const MAX_WAIT_MS = 30_000;       // Changes that keep coming don't put the send off for longer than this
const FIRST_SYNC_MS = 8000;       // After the app starts, once it has settled
const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ---------- Decisions (no side effects; tested) ----------

// A quick hash of the text (cyrb53), to tell whether a profile changed since it was last sent
export const hashText = (text: string) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

export interface Upload {
  id: string;
  body: string;
  hash: string;
}

// What to send and what to delete. `sent`: the hash of what the server has, per profile; `skip`: hashes the server
// refused (too big...), not tried again until the profile changes; `busy`: profiles with a request in flight.
export const planSync = (profiles: Profile[], sent: Record<string, string>, skip: Record<string, string> = {}, busy: ReadonlySet<string> = new Set()) => {
  const upload: Upload[] = [];
  for (const profile of profiles) {
    if (busy.has(profile.id)) continue;
    const body = JSON.stringify(profile);
    const hash = hashText(body);
    if (sent[profile.id] !== hash && skip[profile.id] !== hash) upload.push({ id: profile.id, body, hash });
  }
  // Only profiles this computer sent: another computer's profiles on the same account are left alone
  const ids = new Set(profiles.map(p => p.id));
  const remove = Object.keys(sent).filter(id => !ids.has(id) && !busy.has(id));
  return { upload, remove };
};

// When to try again after failures in a row: 30 s, 1 min, 2 min... up to 15 min
export const retryDelay = (failures: number) => Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, failures - 1));

// How long to wait before sending: DEBOUNCE_MS after the last change, but no later than MAX_WAIT_MS after the first
export const debounceDelay = (now: number, firstChangeAt: number) => Math.max(0, Math.min(DEBOUNCE_MS, firstChangeAt + MAX_WAIT_MS - now));

// ---------- What was sent (kept between runs) ----------

interface SyncState {
  userId: string;               // The account the hashes belong to
  off: boolean;                 // Turned off on the account
  sent: Record<string, string>; // Profile id → hash of what the server has
}

const loadState = (): SyncState => {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    return {
      userId: typeof saved.userId === 'string' ? saved.userId : '',
      off: saved.off === true,
      sent: saved.sent && typeof saved.sent === 'object' ? saved.sent : {},
    };
  } catch {
    return { userId: '', off: false, sent: {} };
  }
};

const saveState = (state: SyncState) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Then everything is sent again next time; harmless
  }
};

// ---------- Sending ----------

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let firstChangeAt = 0;
let running = false;
let again = false;          // A change came in while sending: run once more after
let failures = 0;
let accountChecked = false; // The account's setting and copies were read since start / sign-in
let filesKept = false;      // The server keeps resume files (S3 is set up)
const skip: Record<string, string> = {};
const busy = new Set<string>();
const pendingFiles = new Map<string, File>(); // Profile id → its original resume file, sent after the profile

const json = (body: string) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });

const isOff = (error: unknown) => error instanceof ApiError && error.code === 'PROFILE_SYNC_OFF';
const isRefused = (error: unknown) => error instanceof ApiError && [400, 413, 415].includes(error.status);

// The account's setting, and which copies the server really has (one may have been deleted from the website)
const checkAccount = async (state: SyncState) => {
  const res = await request('/profiles');
  const data = await res.json() as { userId: string; profileSync: boolean; files: boolean; profiles: { clientId: string }[] };
  if (data.userId !== state.userId) Object.assign(state, { userId: data.userId, sent: {} });
  state.off = !data.profileSync;
  const onServer = new Set(data.profiles.map(p => p.clientId));
  state.sent = state.off ? {} : Object.fromEntries(Object.entries(state.sent).filter(([id]) => onServer.has(id)));
  filesKept = data.files;
  accountChecked = true;
  saveState(state);
};

const sendFile = async (id: string, file: File) => {
  await request(`/profiles/${encodeURIComponent(id)}/resume-file`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
};

const sync = async () => {
  const state = loadState();
  if (!accountChecked) await checkAccount(state);
  if (state.off) {
    pendingFiles.clear();
    return;
  }
  const profiles = loadProfiles();
  const { upload, remove } = planSync(profiles, state.sent, skip, busy);
  for (const item of upload) {
    if (item.body.length > MAX_PROFILE_BYTES) {
      skip[item.id] = item.hash;
      console.warn(`Profile ${item.id} is too big to keep on the account.`);
      continue;
    }
    busy.add(item.id);
    try {
      await request(`/profiles/${encodeURIComponent(item.id)}`, json(item.body));
      state.sent[item.id] = item.hash;
      saveState(state);
    } catch (error) {
      if (!isRefused(error)) throw error;
      skip[item.id] = item.hash;
      console.warn(`The server didn't keep profile ${item.id}:`, error);
    } finally {
      busy.delete(item.id);
    }
  }
  for (const id of remove) {
    busy.add(id);
    try {
      await request(`/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      delete state.sent[id];
      saveState(state);
    } finally {
      busy.delete(id);
    }
  }
  // Resume files, once their profile (with that file's name) is on the server
  for (const [id, file] of [...pendingFiles]) {
    const profile = profiles.find(p => p.id === id);
    if (!profile || !filesKept || file.size > MAX_FILE_BYTES) {
      pendingFiles.delete(id);
      continue;
    }
    if (profile.cvFileName !== file.name || !state.sent[id]) continue; // Not saved yet: wait for the next change
    busy.add(id);
    try {
      await sendFile(id, file);
      if (pendingFiles.get(id) === file) pendingFiles.delete(id);
    } catch (error) {
      if (!isRefused(error)) throw error;
      pendingFiles.delete(id);
      console.warn('The server didn\'t keep the resume file:', error);
    } finally {
      busy.delete(id);
    }
  }
};

const run = async () => {
  timer = null;
  firstChangeAt = 0;
  if (running) {
    again = true;
    return;
  }
  if (!isSignedIn()) return;
  running = true;
  try {
    await sync();
    failures = 0;
  } catch (error) {
    if (isOff(error)) {
      const state = loadState();
      saveState({ ...state, off: true, sent: {} });
      pendingFiles.clear();
    } else if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      // Signed out or blocked: nothing to do until the next sign-in
    } else {
      failures += 1;
      console.warn('Could not keep profiles on the account; trying again later:', error);
      schedule(retryDelay(failures));
    }
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule();
    }
  }
};

// Runs when the app is idle, so it never competes with showing an answer
const runWhenIdle = () => {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(() => void run(), { timeout: 5000 });
  else void run();
};

const schedule = (delay?: number) => {
  if (!started) return;
  const now = Date.now();
  if (delay === undefined) {
    firstChangeAt ||= now;
    delay = debounceDelay(now, firstChangeAt);
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(runWhenIdle, delay);
};

// Started once from main.tsx
export const startProfileSync = () => {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener(PROFILES_EVENT, () => schedule());
  window.addEventListener(SIGNED_IN_EVENT, () => {
    accountChecked = false;
    schedule(FIRST_SYNC_MS);
  });
  window.addEventListener('online', () => { if (failures) schedule(1000); });
  schedule(FIRST_SYNC_MS);
};

// ResumeInput hands over the file it just read; it's sent after the profile is saved with it
export const queueResumeFile = (file: File) => {
  if (!started || !isSignedIn() || loadState().off || file.size > MAX_FILE_BYTES) return;
  pendingFiles.set(loadActiveProfile().id, file);
  schedule();
};

// The switch in Settings → Data. Off deletes the copies on the account.
export const setProfileSync = async (on: boolean) => {
  await request('/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileSync: on }) });
  const state = loadState();
  saveState({ ...state, off: !on, sent: {} });
  pendingFiles.clear();
  accountChecked = false;
  if (on) schedule(1000);
};
