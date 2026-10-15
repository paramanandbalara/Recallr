import type { Purchase, UsageKind } from '@prisma/client';
import { db } from './db.js';
import { emails } from './emails.js';
import { HttpError } from './http.js';
import { queueEmail } from './mailer.js';
import { getSettings, numberSetting } from './settings.js';

// What a user may still use. Usage is taken from the active pack that expires first and still has room.

export const minutesLeft = (p: Purchase) => (p.listeningMinutes === null ? null : Math.max(0, p.listeningMinutes - p.usedSeconds / 60));
export const tokensLeft = (p: Purchase) => (p.tokenLimit === null ? null : Math.max(0, p.tokenLimit - p.usedTokens));

const hasRoom = (p: Purchase, kind: UsageKind) => {
  const left = kind === 'CHAT' ? tokensLeft(p) : minutesLeft(p);
  return left === null || left > 0;
};

export const activePurchases = (userId: string, now = new Date()) =>
  db.purchase.findMany({
    where: { userId, startsAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'asc' },
  });

// The pack this request counts against, or an error that tells the user why they can't continue
export const purchaseFor = async (userId: string, kind: UsageKind) => {
  const active = await activePurchases(userId);
  if (active.length === 0) throw new HttpError(402, 'You have no active plan. Buy a plan to continue.', 'NO_PLAN');
  const usable = active.find(p => hasRoom(p, kind));
  if (!usable) {
    throw kind === 'CHAT'
      ? new HttpError(402, "You've used all the AI answers in your plan. Buy a top-up to continue.", 'TOKENS_USED_UP')
      : new HttpError(402, "You've used all the listening time in your plan. Buy a top-up to continue.", 'MINUTES_USED_UP');
  }
  return usable;
};

export const recordUsage = async (usage: {
  userId: string; purchaseId: string; kind: UsageKind; provider: string; model: string;
  inputTokens?: number; outputTokens?: number; audioSeconds?: number; latencyMs?: number;
}) => {
  const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const [, purchase] = await db.$transaction([
    db.usageEvent.create({ data: { ...usage, purchaseId: usage.purchaseId } }),
    db.purchase.update({
      where: { id: usage.purchaseId },
      data: { usedTokens: { increment: tokens }, usedSeconds: { increment: usage.audioSeconds ?? 0 } },
    }),
  ]);
  if (usage.kind === 'TRANSCRIBE' && purchase.listeningMinutes !== null && !purchase.notifiedLow) await warnIfLow(usage.userId);
};

// Listening time is billed on the audio's length as the transcription provider measured it. The app's own
// figure is used only within a second above that (rounding), never below it. When the provider gives no length,
// the app's figure is used, capped by how long the upload could possibly be (even very quiet Opus audio is
// over 500 bytes a second) and by 10 minutes.
const MIN_AUDIO_BYTES_PER_SECOND = 500;
const MAX_CHUNK_SECONDS = 600;
export const listeningSecondsToBill = ({ appSeconds, providerSeconds, audioBytes }: { appSeconds: number; providerSeconds?: number; audioBytes: number }) => {
  const app = Number.isFinite(appSeconds) ? Math.max(0, appSeconds) : 0;
  const seconds = providerSeconds !== undefined
    ? Math.max(Math.min(app, providerSeconds + 1), providerSeconds)
    : Math.min(app, audioBytes / MIN_AUDIO_BYTES_PER_SECOND + 1, MAX_CHUNK_SECONDS);
  return Math.round(seconds * 10) / 10;
};

// Usage is written after the answer has been sent, so saving never slows an answer down. Tests wait with usageSaved().
const pendingUsage = new Set<Promise<void>>();
export const recordUsageAfter = (usage: Parameters<typeof recordUsage>[0]) => {
  const write = recordUsage(usage).catch(error => console.error('Could not record usage:', error));
  pendingUsage.add(write);
  void write.finally(() => pendingUsage.delete(write));
};
export const usageSaved = async () => { await Promise.all([...pendingUsage]); };

// One email when the listening time left (all packs together) drops below the warning level
const warnIfLow = async (userId: string) => {
  const threshold = numberSetting(await getSettings(), 'lowMinutesWarning');
  const { minutesLeft: left } = await allowance(userId);
  if (threshold <= 0 || left === null || left >= threshold) return;
  // Claim the warning first, so two requests at once send one email
  const { count } = await db.purchase.updateMany({
    where: { userId, notifiedLow: false, expiresAt: { gt: new Date() }, listeningMinutes: { not: null } },
    data: { notifiedLow: true },
  });
  const user = count ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (user) queueEmail(await emails.lowMinutes(user, left), 'low_minutes', user.id);
};

// Summary for the app and the account page
export const allowance = async (userId: string) => {
  const active = await activePurchases(userId);
  const sum = (values: (number | null)[]) => (values.some(v => v === null) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0));
  return {
    active: active.length > 0,
    onTrial: active.length > 0 && active.every(p => p.source === 'TRIAL'),
    expiresAt: active.length ? active[active.length - 1].expiresAt : null,
    minutesLeft: active.length ? sum(active.map(minutesLeft)) : 0,
    tokensLeft: active.length ? sum(active.map(tokensLeft)) : 0,
    packs: active.map(p => ({
      id: p.id, planName: p.planName, source: p.source, startsAt: p.startsAt, expiresAt: p.expiresAt,
      minutesLeft: minutesLeft(p), tokensLeft: tokensLeft(p), listeningMinutes: p.listeningMinutes, tokenLimit: p.tokenLimit,
    })),
  };
};
