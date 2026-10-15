// Talks to the Recallr server. The sign-in token is kept in localStorage.

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_KEY = 'recallr_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

export const api = async <T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> => {
  const token = getToken();
  const res = await fetch(`${BASE}/api${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data.error ?? 'Something went wrong.', data.code);
  }
  return data as T;
};

// Saves a file the server sends (signed in), e.g. the users spreadsheet or "Download my data"
export const downloadFile = async (path: string, filename: string) => {
  const token = getToken();
  const res = await fetch(`${BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? 'The download failed.');
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---------- Types shared with the server ----------

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'BLOCKED';
  createdAt: string;
  lastSeenAt?: string | null;
  saveAnswers?: boolean; // Interview questions and answers kept on the account
  weeklyEmail?: boolean; // The Monday practice email
  profileSync?: boolean; // A copy of the app's profiles kept on the account
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  pricePaise: number;
  durationDays: number;
  listeningMinutes: number | null;
  tokenLimit: number | null;
  active: boolean;
  isTrial: boolean;
  sortOrder: number;
  _count?: { purchases: number };
}

export type PurchaseSource = 'RAZORPAY' | 'OFFLINE' | 'ADMIN_GRANT' | 'TRIAL' | 'REFERRAL' | 'COUPON' | 'ORGANIZATION';

export interface Pack {
  id: string;
  planName: string;
  source: PurchaseSource;
  startsAt: string;
  expiresAt: string;
  minutesLeft: number | null;
  tokensLeft: number | null;
  listeningMinutes: number | null;
  tokenLimit: number | null;
}

export interface Allowance {
  active: boolean;
  onTrial: boolean;
  expiresAt: string | null;
  minutesLeft: number | null;
  tokensLeft: number | null;
  packs: Pack[];
}

export interface Payment {
  id: string;
  amountPaise: number;
  method: 'RAZORPAY' | 'OFFLINE' | 'COUPON';
  discountPaise?: number;
  status: 'CREATED' | 'PENDING' | 'PAID' | 'FAILED' | 'REJECTED';
  reference: string | null;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  plan: { name: string };
  user?: { email: string; name: string };
}

// ---------- Site settings (Admin → Settings), loaded once before the first page shows ----------

export const SITE = {
  businessName: 'Recallr',
  supportEmail: '',
  downloadUrlWindows: '',
  downloadUrlMac: '',
  offlinePaymentInfo: '',
};

export const loadSite = async () => {
  try {
    const site = await api<Partial<typeof SITE>>('/site');
    for (const key of Object.keys(SITE) as (keyof typeof SITE)[]) {
      if (typeof site[key] === 'string' && site[key]) SITE[key] = site[key]!;
    }
  } catch {
    // The defaults are fine; pages that need the server show their own errors
  }
};

export interface Device {
  id: string;
  name: string;
  platform: string;
  appVersion: string;
  createdAt: string;
  lastSeenAt: string;
  current?: boolean;
}

export type TicketStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export interface TicketMessage {
  id: string;
  fromAdmin: boolean;
  body: string;
  createdAt: string;
  author?: { name: string; email: string } | null;
}

export interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
  user?: { id: string; email: string; name: string };
  _count?: { messages: number };
}

export const platformName = (p: string) => ({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[p] ?? p;
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

// ---------- Formatting ----------

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const hours = (minutes: number | null) =>
  minutes === null ? 'Unlimited' : minutes >= 60 ? `${+(minutes / 60).toFixed(1)} hours` : `${Math.round(minutes)} min`;
export const tokens = (n: number | null) =>
  n === null ? 'Unlimited' : n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
// A typical live answer uses about 2,500 tokens (question, context and answer)
export const answers = (tokenLimit: number | null) =>
  tokenLimit === null ? 'Unlimited AI answers' : `About ${Math.max(1, Math.round(tokenLimit / 2500)).toLocaleString('en-IN')} AI answers`;
export const days = (n: number) => (n === 1 ? '1 day' : n % 30 === 0 && n >= 30 ? (n === 30 ? '1 month' : `${n / 30} months`) : `${n} days`);
export const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

// ---------- Question bank ----------

export type QuestionCategory = 'ABOUT_YOU' | 'EXPERIENCE' | 'CODING' | 'SYSTEM_DESIGN' | 'CONCEPT' | 'OTHER';

// Same names and addresses as the server's CATEGORY_PAGES
export const CATEGORIES: Record<QuestionCategory, { slug: string; label: string }> = {
  ABOUT_YOU: { slug: 'hr', label: 'HR / about you' },
  EXPERIENCE: { slug: 'behavioral', label: 'Behavioral' },
  CODING: { slug: 'coding', label: 'Coding' },
  SYSTEM_DESIGN: { slug: 'system-design', label: 'System design' },
  CONCEPT: { slug: 'technical', label: 'Technical' },
  OTHER: { slug: 'general', label: 'General' },
};
export const CATEGORY_IDS = Object.keys(CATEGORIES) as QuestionCategory[];

export interface SavedAnswer {
  id: string;
  question: string;
  category: QuestionCategory;
  answer: string;
  source: 'AI' | 'PREPARED';
  provider: string;
  createdAt: string;
}

export interface PublicQuestion {
  slug: string;
  text: string;
  category: QuestionCategory;
  categorySlug: string;
  timesAsked: number;
}

export interface CategoryPage {
  category: QuestionCategory;
  slug: string;
  title: string;
  text: string;
  count: number;
}

// ---------- Practice ----------

export interface PracticeAnswer {
  question: string;
  score: number | null;
  wordsPerMinute: number | null;
  fillers: number;
  seconds: number;
}

export interface PracticeSession {
  id: string;
  role: string;
  questionCount: number;
  averageScore: number | null;
  wordsPerMinute: number | null;
  fillersPerMinute: number | null;
  details: PracticeAnswer[] | null;
  createdAt: string;
}

// ---------- Colleges and bootcamps ----------

export type OrganizationKind = 'COLLEGE' | 'BOOTCAMP' | 'COMPANY' | 'OTHER';
export const ORGANIZATION_KINDS: Record<OrganizationKind, string> = { COLLEGE: 'College', BOOTCAMP: 'Bootcamp', COMPANY: 'Company', OTHER: 'Other' };

export interface Organization {
  id: string;
  name: string;
  kind: OrganizationKind;
  seats: number;
  seatsUsed: number;
  inviteCode: string;
  memberMinutes: number | null;
  memberTokens: number | null;
  memberDays: number;
  active: boolean;
  open: boolean;
  expiresAt: string | null;
  contactEmail: string;
  notes: string;
  createdAt: string;
  coaches?: number;
}

export interface OrganizationStudent {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
  lastSeenAt: string | null;
  listeningMinutesUsed: number;
  packEndsAt: string | null;
  mockInterviews: number;
  recentScore: number | null;
  firstScore: number | null;
  wordsPerMinute: number | null;
  fillersPerMinute: number | null;
  lastPracticeAt: string | null;
}

export interface OrganizationDetail {
  organization: Organization;
  coaches: { userId: string; name: string; email: string }[];
  students: OrganizationStudent[];
}

export const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;
