import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { db } from './db.js';
import { env, publicUrl } from './env.js';
import { getSettings } from './settings.js';

// WhatsApp messages through the Meta WhatsApp Cloud API: interview reminders, the question of the day, and the
// code that verifies a user's number. Only approved templates can be sent to people who didn't write first, so
// every message is a template. Every send is logged in WhatsAppLog (sent, failed or skipped). Until the token and
// phone number ID are set in Admin → Settings → WhatsApp, nothing is sent and each message is logged as skipped.
//
// Numbers are only ever messaged once verified: User.phone is set only after the user typed the code we sent
// there (see routes/whatsapp.ts). The one exception is that code itself, sent to the number being verified.

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const IST_MS = 5.5 * 60 * 60 * 1000;

// Tests replace fetch with a fake
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
let fetcher: Fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
export const setWhatsAppFetch = (fake: Fetch | null) => { fetcher = fake ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })); };

// ---------- Phone numbers ----------

// International form (+919876543210). India is the default: a 10-digit mobile number gets +91.
// Returns '' when it isn't a valid number.
export const normalizePhone = (input: string) => {
  const raw = input.trim();
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^0[6-9]\d{9}$/.test(digits)) digits = digits.slice(1); // 09876543210
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return /^[1-9]\d{9,14}$/.test(digits) && digits.length > 10 ? `+${digits}` : '';
};

// "+91 98••• ••210", for logs and the account page
export const maskPhone = (phone: string) => (phone.length > 6 ? `${phone.slice(0, 5)}•••••${phone.slice(-3)}` : phone);

// ---------- Sending ----------

export const whatsappReady = async () => {
  const s = await getSettings();
  return !!(s.whatsappToken && s.whatsappPhoneNumberId);
};

// Template text can't hold new lines, tabs or more than 4 spaces in a row, and is at most 1024 characters
export const templateText = (text: string, max = 900) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

export type WhatsAppStatus = 'sent' | 'failed' | 'skipped';

interface Message {
  to: string;              // +91...
  template: string;        // The approved template's name
  params: string[];        // {{1}}, {{2}}... of the body
  buttonParam?: string;    // The copy-code button of an authentication template
  userId?: string | null;
}

// Sends one template message and logs it. Never throws: a failed message must not fail anything else.
export const sendTemplate = async (message: Message): Promise<{ status: WhatsAppStatus; error: string }> => {
  const s = await getSettings();
  let status: WhatsAppStatus = 'skipped';
  let error = '';
  if (!s.whatsappToken || !s.whatsappPhoneNumberId) error = 'WhatsApp is not set up (Admin → Settings → WhatsApp).';
  else if (!message.template) error = 'No template name is set.';
  else if (!/^\+[1-9]\d{7,14}$/.test(message.to)) error = 'Not a valid number.';
  else {
    const components: object[] = [];
    if (message.params.length) components.push({ type: 'body', parameters: message.params.map(text => ({ type: 'text', text: templateText(text) })) });
    if (message.buttonParam) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: message.buttonParam }] });
    try {
      const res = await fetcher(`${GRAPH_URL}/${encodeURIComponent(s.whatsappPhoneNumberId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.whatsappToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.to.slice(1), // Without the +
          type: 'template',
          template: { name: message.template, language: { code: s.whatsappTemplateLanguage || 'en' }, ...(components.length ? { components } : {}) },
        }),
      });
      if (res.ok) status = 'sent';
      else {
        status = 'failed';
        const data = await res.json().catch(() => ({})) as { error?: { message?: string; error_data?: { details?: string } } };
        error = [data.error?.message, data.error?.error_data?.details].filter(Boolean).join(': ') || `WhatsApp answered ${res.status}.`;
      }
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : 'Sending failed.';
    }
  }
  if (status === 'failed') console.error(`WhatsApp ${message.template} to ${maskPhone(message.to)} failed: ${error}`);
  await db.whatsAppLog.create({
    data: { userId: message.userId ?? null, to: message.to.slice(0, 20), template: message.template.slice(0, 100), status, error: error.slice(0, 1000) },
  }).catch(err => console.error('Could not log the WhatsApp message:', err));
  return { status, error };
};

// ---------- Verification codes ----------

// The code goes out in an authentication template ({{1}} the code, with a "Copy code" button). Instead of storing
// it, the app gets a signed token for the number; the code is only in WhatsApp. Valid for 10 minutes.
const CODE_MS = 10 * 60 * 1000;
const sign = (payload: string, code: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`whatsapp-verify:${payload}:${code}`).digest('base64url');

export const newVerification = (userId: string, phone: string, now = Date.now()) => {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const payload = Buffer.from(JSON.stringify({ u: userId, p: phone, e: now + CODE_MS })).toString('base64url');
  return { code, token: `${payload}.${sign(payload, code)}` };
};

// The verified number, or null when the code is wrong or too old
export const checkVerification = (userId: string, token: string, code: string, now = Date.now()) => {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !/^\d{6}$/.test(code)) return null;
  const expected = Buffer.from(sign(payload, code));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: string; p?: string; e?: number };
    return data.u === userId && typeof data.p === 'string' && typeof data.e === 'number' && data.e > now ? data.p : null;
  } catch {
    return null;
  }
};

export const sendVerificationCode = async (userId: string, phone: string) => {
  const s = await getSettings();
  const { code, token } = newVerification(userId, phone);
  const result = await sendTemplate({ to: phone, template: s.whatsappTemplateCode, params: [code], buttonParam: code, userId });
  return { ...result, token };
};

// ---------- Messages ----------

// "10:30 am" and "Thu, 16 Oct, 10:30 am" in India time
const indiaClock = (date: Date) =>
  new Date(date.getTime() + IST_MS).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).toLowerCase();
export const formatIndiaTime = (date: Date) =>
  `${new Date(date.getTime() + IST_MS).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${indiaClock(date)}`;

const istDate = (date: Date) => new Date(date.getTime() + IST_MS).toISOString().slice(0, 10);

type Recipient = Pick<User, 'id' | 'phone' | 'status' | 'whatsappReminders' | 'whatsappDaily'>;

// The reminder template: {{1}} the interview, {{2}} when
export const sendInterviewReminder = async (user: Recipient, interview: { title: string; startsAt: Date }, kind: 'day' | 'soon', now = new Date()) => {
  if (!user.phone || !user.whatsappReminders || user.status !== 'ACTIVE') return null;
  const minutes = Math.max(1, Math.round((interview.startsAt.getTime() - now.getTime()) / 60_000));
  const when = kind === 'day'
    ? `tomorrow (${formatIndiaTime(interview.startsAt)})`
    : `today at ${indiaClock(interview.startsAt)} (in about ${minutes >= 60 ? '1 hour' : `${minutes} minutes`})`;
  const s = await getSettings();
  return sendTemplate({ to: user.phone, template: s.whatsappTemplateReminder, params: [interview.title || 'Interview', when], userId: user.id });
};

// The question-of-the-day template: {{1}} the question, {{2}} the link to answer it
export const sendDailyQuestion = async (user: Recipient, question: string) => {
  if (!user.phone || !user.whatsappDaily || user.status !== 'ACTIVE') return null;
  const s = await getSettings();
  return sendTemplate({ to: user.phone, template: s.whatsappTemplateDaily, params: [question, `${publicUrl}/account/daily`], userId: user.id });
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Interview reminders, from the interviews the app syncs (UserInterview): the evening before (from 18:00 in India)
// and about an hour before. Each is claimed first (remindedDayAt / remindedSoonAt), so it goes out once, from one
// server. Only for users who turned reminders on and verified their number.
export const sendInterviewReminders = async (now = new Date()) => {
  if (!await whatsappReady()) return 0;
  const optedIn = { phone: { not: '' }, whatsappReminders: true, status: 'ACTIVE' as const };
  let sent = 0;

  // About an hour before: starting in 10 to 65 minutes
  const soon = await db.userInterview.findMany({
    where: { remindedSoonAt: null, startsAt: { gt: new Date(now.getTime() + 10 * 60_000), lte: new Date(now.getTime() + 65 * 60_000) }, user: optedIn },
    include: { user: true },
    take: 500,
  });
  for (const interview of soon) {
    const { count } = await db.userInterview.updateMany({ where: { id: interview.id, remindedSoonAt: null }, data: { remindedSoonAt: now } });
    if (!count) continue;
    if ((await sendInterviewReminder(interview.user, interview, 'soon', now))?.status === 'sent') sent++;
  }

  // The evening before: from 18:00 in India, for interviews tomorrow (India date) that are more than 3 hours away
  const ist = new Date(now.getTime() + IST_MS);
  if (ist.getUTCHours() >= 18) {
    const tomorrow = istDate(new Date(now.getTime() + DAY_MS));
    const start = new Date(Date.parse(`${tomorrow}T00:00:00Z`) - IST_MS);
    const day = await db.userInterview.findMany({
      where: { remindedDayAt: null, startsAt: { gte: start, lt: new Date(start.getTime() + DAY_MS), gt: new Date(now.getTime() + 3 * 60 * 60_000) }, user: optedIn },
      include: { user: true },
      take: 1000,
    });
    for (const interview of day) {
      const { count } = await db.userInterview.updateMany({ where: { id: interview.id, remindedDayAt: null }, data: { remindedDayAt: now } });
      if (!count) continue;
      if ((await sendInterviewReminder(interview.user, interview, 'day', now))?.status === 'sent') sent++;
    }
  }
  return sent;
};

// The question of the day to everyone who asked for it, from 09:00 in India. DailyQuestion.sentAt is the claim.
export const sendDailyQuestionMessages = async (now = new Date()) => {
  const ist = new Date(now.getTime() + IST_MS);
  if (ist.getUTCHours() < 9 || !await whatsappReady()) return 0;
  const question = await db.dailyQuestion.findUnique({ where: { date: istDate(now) } });
  if (!question || question.sentAt) return 0;
  const { count } = await db.dailyQuestion.updateMany({ where: { id: question.id, sentAt: null }, data: { sentAt: now } });
  if (!count) return 0;
  let sent = 0;
  let cursor: string | undefined;
  for (;;) {
    const users = await db.user.findMany({
      where: { phone: { not: '' }, whatsappDaily: true, status: 'ACTIVE' },
      orderBy: { id: 'asc' }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const user of users) if ((await sendDailyQuestion(user, question.text))?.status === 'sent') sent++;
    if (users.length < 500) break;
    cursor = users[users.length - 1].id;
  }
  return sent;
};
