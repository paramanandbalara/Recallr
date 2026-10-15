import { ApiError, isSignedIn, request, SIGNED_IN_EVENT } from './account';
import { CALENDAR_EVENT, loadInterviews, type Interview } from './calendar';
import { debounceDelay, hashText, retryDelay } from './profileSync';

// The interview calendar is kept on the Recallr account too (see server/src/routes/interviews.ts), so reminders
// and the website's dashboard know when the next interview is. Like the profiles (profileSync.ts), it never gets
// in the way of answers: changes go a few seconds after they stop, only interviews that changed since the last
// send, one request at a time, when the app is idle; failures are only logged and tried again later. Nothing is
// sent while signed out. Unlike profiles it isn't optional: reminders need it.

const STATE_KEY = 'secondBrain_interviewSync';
const FIRST_SYNC_MS = 10_000;            // After the app starts, once it has settled (after the profiles)
const DAY_MS = 24 * 60 * 60 * 1000;
export const SYNC_PAST_DAYS = 30;        // Older interviews aren't sent (the account only shows the last month)
const ID = /^[A-Za-z0-9_-]{1,40}$/;

// ---------- Decisions (no side effects; tested) ----------

// What the server keeps of an interview (the app's own flags, like "prep pack offered", stay on this computer)
export const interviewPayload = (interview: Interview) => ({
  title: interview.title.trim().slice(0, 200) || 'Interview',
  startsAt: new Date(interview.startsAt).toISOString(),
  profileClientId: ID.test(interview.profileId) ? interview.profileId : '',
  notes: interview.notes.slice(0, 1000),
});

export interface InterviewUpload {
  id: string;
  body: string;
  hash: string;
}

// What to send and what to delete. `sent`: the hash of what the server has, per interview this computer sent;
// `skip`: hashes the server refused, not tried again until the interview changes; `busy`: requests in flight.
export const planInterviewSync = (
  interviews: Interview[], sent: Record<string, string>, now: number,
  skip: Record<string, string> = {}, busy: ReadonlySet<string> = new Set(),
) => {
  const upload: InterviewUpload[] = [];
  for (const interview of interviews) {
    if (busy.has(interview.id) || !ID.test(interview.id)) continue;
    if (interview.startsAt < now - SYNC_PAST_DAYS * DAY_MS) continue;
    const body = JSON.stringify(interviewPayload(interview));
    const hash = hashText(body);
    if (sent[interview.id] !== hash && skip[interview.id] !== hash) upload.push({ id: interview.id, body, hash });
  }
  // Only interviews this computer sent and then removed: another computer's interviews on the account stay
  const ids = new Set(interviews.map(i => i.id));
  const remove = Object.keys(sent).filter(id => !ids.has(id) && !busy.has(id));
  return { upload, remove };
};

// ---------- What was sent (kept between runs) ----------

interface SyncState {
  userId: string;               // The account the hashes belong to
  sent: Record<string, string>; // Interview id → hash of what the server has
}

const loadState = (): SyncState => {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    return {
      userId: typeof saved.userId === 'string' ? saved.userId : '',
      sent: saved.sent && typeof saved.sent === 'object' ? saved.sent : {},
    };
  } catch {
    return { userId: '', sent: {} };
  }
};

const saveState = (state: SyncState) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Then everything is sent again next time; harmless (sending is an update)
  }
};

// ---------- Sending ----------

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let firstChangeAt = 0;
let running = false;
let again = false;
let failures = 0;
let accountChecked = false;
const skip: Record<string, string> = {};
const busy = new Set<string>();

const isRefused = (error: unknown) => error instanceof ApiError && [400, 413].includes(error.status);

// Which account this is: hashes sent for another account mean nothing here
const checkAccount = async (state: SyncState) => {
  const res = await request('/interviews');
  const data = await res.json() as { userId?: string };
  const userId = data.userId ?? '';
  if (userId !== state.userId) Object.assign(state, { userId, sent: {} });
  accountChecked = true;
  saveState(state);
};

const sync = async () => {
  const state = loadState();
  if (!accountChecked) await checkAccount(state);
  const { upload, remove } = planInterviewSync(loadInterviews(), state.sent, Date.now(), skip, busy);
  for (const item of upload) {
    busy.add(item.id);
    try {
      await request(`/interviews/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: item.body });
      state.sent[item.id] = item.hash;
      saveState(state);
    } catch (error) {
      if (!isRefused(error)) throw error;
      skip[item.id] = item.hash;
      console.warn(`The server didn't keep interview ${item.id}:`, error);
    } finally {
      busy.delete(item.id);
    }
  }
  for (const id of remove) {
    busy.add(id);
    try {
      await request(`/interviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
      delete state.sent[id];
      saveState(state);
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
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      // Signed out or blocked: nothing to do until the next sign-in
    } else {
      failures += 1;
      console.warn('Could not keep interviews on the account; trying again later:', error);
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
export const startInterviewSync = () => {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener(CALENDAR_EVENT, () => schedule());
  window.addEventListener(SIGNED_IN_EVENT, () => {
    accountChecked = false;
    schedule(FIRST_SYNC_MS);
  });
  window.addEventListener('online', () => { if (failures) schedule(1000); });
  schedule(FIRST_SYNC_MS);
};
