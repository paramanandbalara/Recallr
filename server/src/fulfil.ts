import type { Prisma, PurchaseSource } from '@prisma/client';
import { db } from './db.js';
import { emails } from './emails.js';
import { HttpError } from './http.js';
import { queueEmail } from './mailer.js';
import { getSettings, numberSetting } from './settings.js';

const DAY_MS = 24 * 60 * 60 * 1000;
type Tx = Prisma.TransactionClient;

// Give a user a pack of a plan (limits copied from the plan as it is now)
const grant = async (tx: Tx, userId: string, planId: string, source: PurchaseSource, paymentId?: string) => {
  const plan = await tx.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, 'Plan not found.');
  const now = new Date();
  return tx.purchase.create({
    data: {
      userId, planId, planName: plan.name, source, paymentId,
      startsAt: now, expiresAt: new Date(now.getTime() + plan.durationDays * DAY_MS),
      listeningMinutes: plan.listeningMinutes, tokenLimit: plan.tokenLimit,
    },
  });
};

// Both people get a bonus when someone who was invited makes their first real payment
const rewardReferral = async (tx: Tx, userId: string) => {
  const user = await tx.user.findUnique({ where: { id: userId }, include: { referredBy: true } });
  if (!user?.referredBy || user.referralRewardedAt || user.referredBy.status === 'BLOCKED') return null;
  const s = await getSettings();
  const minutes = numberSetting(s, 'referralBonusMinutes');
  if (minutes <= 0) return null;
  await tx.user.update({ where: { id: user.id }, data: { referralRewardedAt: new Date() } });
  const now = new Date();
  const pack = {
    planName: 'Referral bonus', source: 'REFERRAL' as const, startsAt: now,
    expiresAt: new Date(now.getTime() + numberSetting(s, 'referralBonusDays') * DAY_MS),
    listeningMinutes: minutes, tokenLimit: numberSetting(s, 'referralBonusTokens') || null,
  };
  await tx.purchase.createMany({ data: [{ ...pack, userId: user.id }, { ...pack, userId: user.referredBy.id }] });
  return { user, referrer: user.referredBy, minutes };
};

// Mark a payment paid and give the pack. Safe to call more than once (e.g. both the browser and the webhook).
export const fulfilPayment = async (paymentId: string, extra: { razorpayPaymentId?: string; recordedById?: string } = {}) => {
  let newlyPaid = false;
  let referral: Awaited<ReturnType<typeof rewardReferral>> = null;
  const purchase = await db.$transaction(async tx => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { purchase: true } });
    if (!payment) throw new HttpError(404, 'Payment not found.');
    if (payment.purchase) return payment.purchase;
    newlyPaid = true;
    await tx.payment.update({ where: { id: paymentId }, data: { status: 'PAID', paidAt: new Date(), ...extra } });
    if (payment.couponId) await tx.coupon.update({ where: { id: payment.couponId }, data: { usedCount: { increment: 1 } } });
    const source: PurchaseSource = payment.method === 'RAZORPAY' ? 'RAZORPAY' : payment.method === 'COUPON' ? 'COUPON' : 'OFFLINE';
    const created = await grant(tx, payment.userId, payment.planId, source, payment.id);
    if (payment.amountPaise > 0) referral = await rewardReferral(tx, payment.userId);
    return created;
  });

  if (newlyPaid) {
    const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { user: true } });
    if (payment) queueEmail(await emails.paymentReceived(payment.user, purchase.planName, payment.amountPaise, purchase.expiresAt), 'payment_received', payment.userId);
    const r = referral as Awaited<ReturnType<typeof rewardReferral>>;
    if (r) {
      queueEmail(await emails.referralReward(r.referrer, r.user.name, r.minutes), 'referral_reward', r.referrer.id);
      queueEmail(await emails.referralReward(r.user, r.referrer.name, r.minutes), 'referral_reward', r.user.id);
    }
  }
  return purchase;
};

// A pack given by the admin without a payment (extra trial, compensation...)
export const grantPlan = (userId: string, planId: string) => db.$transaction(tx => grant(tx, userId, planId, 'ADMIN_GRANT'));

// The free trial: once per account and once per computer, on the first sign-in in the app.
// Returns what happened, so the app can explain it.
export const grantTrialIfNew = (userId: string, fingerprint: string) =>
  db.$transaction(async (tx): Promise<'granted' | 'had_trial' | 'computer_used' | 'none'> => {
    const trial = await tx.plan.findFirst({ where: { isTrial: true, active: true } });
    if (!trial) return 'none';
    if (await tx.purchase.count({ where: { userId, source: 'TRIAL' } })) return 'had_trial';
    if (await tx.trialClaim.findUnique({ where: { fingerprint } })) return 'computer_used';
    await tx.trialClaim.create({ data: { fingerprint, userId } });
    await grant(tx, userId, trial.id, 'TRIAL');
    return 'granted';
  });
