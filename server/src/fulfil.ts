import type { Prisma, PurchaseSource } from '@prisma/client';
import { db } from './db.js';
import { emails } from './emails.js';
import { HttpError } from './http.js';
import { queueEmail } from './mailer.js';
import { createInvoice, queueInvoiceEmail } from './invoices.js';
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

// Both people get a bonus when someone who was invited makes their first real payment. An approved college
// ambassador gets the ambassador bonus instead of the usual one; the friend gets the usual one.
const rewardReferral = async (tx: Tx, userId: string) => {
  const user = await tx.user.findUnique({ where: { id: userId }, include: { referredBy: { include: { ambassador: true } } } });
  if (!user?.referredBy || user.referralRewardedAt || user.referredBy.status === 'BLOCKED') return null;
  const s = await getSettings();
  const minutes = Math.max(0, numberSetting(s, 'referralBonusMinutes'));
  const ambassador = user.referredBy.ambassador?.status === 'APPROVED';
  const referrerMinutes = ambassador ? Math.max(0, numberSetting(s, 'ambassadorBonusMinutes')) : minutes;
  if (minutes <= 0 && referrerMinutes <= 0) return null;
  await tx.user.update({ where: { id: user.id }, data: { referralRewardedAt: new Date() } });
  const now = new Date();
  const pack = (userId: string, planName: string, listeningMinutes: number) => ({
    userId, planName, source: 'REFERRAL' as const, startsAt: now,
    expiresAt: new Date(now.getTime() + numberSetting(s, 'referralBonusDays') * DAY_MS),
    listeningMinutes, tokenLimit: numberSetting(s, 'referralBonusTokens') || null,
  });
  const packs = [
    ...(minutes > 0 ? [pack(user.id, 'Referral bonus', minutes)] : []),
    ...(referrerMinutes > 0 ? [pack(user.referredBy.id, ambassador ? 'Ambassador bonus' : 'Referral bonus', referrerMinutes)] : []),
  ];
  await tx.purchase.createMany({ data: packs });
  return { user, referrer: user.referredBy, minutes, referrerMinutes, ambassador };
};

// Mark a payment paid and give the pack. Safe to call more than once (e.g. both the browser and the webhook).
export const fulfilPayment = async (paymentId: string, extra: { razorpayPaymentId?: string; recordedById?: string } = {}) => {
  let newlyPaid = false;
  let referral: Awaited<ReturnType<typeof rewardReferral>> = null;
  let invoiceId: string | null = null;
  const purchase = await db.$transaction(async tx => {
    // Lock the payment first, so the browser and the webhook arriving together fulfil it once (one pack, one invoice)
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { purchase: true } });
    if (!payment) throw new HttpError(404, 'Payment not found.');
    if (payment.purchase) return payment.purchase;
    newlyPaid = true;
    const paidAt = new Date();
    await tx.payment.update({ where: { id: paymentId }, data: { status: 'PAID', paidAt, ...extra } });
    if (payment.couponId) await tx.coupon.update({ where: { id: payment.couponId }, data: { usedCount: { increment: 1 } } });
    const source: PurchaseSource = payment.method === 'RAZORPAY' ? 'RAZORPAY' : payment.method === 'COUPON' ? 'COUPON' : 'OFFLINE';
    const created = await grant(tx, payment.userId, payment.planId, source, payment.id);
    invoiceId = (await createInvoice(tx, payment.id, created, paidAt))?.id ?? null;
    if (payment.amountPaise > 0) referral = await rewardReferral(tx, payment.userId);
    return created;
  });

  if (newlyPaid) {
    const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { user: true } });
    // With an invoice: the same "Payment received" email, with the invoice attached
    const invoice = invoiceId as string | null; // Set inside the transaction
    if (invoice) queueInvoiceEmail(invoice, 'payment');
    else if (payment) queueEmail(await emails.paymentReceived(payment.user, purchase.planName, payment.amountPaise, purchase.expiresAt), 'payment_received', payment.userId);
    const r = referral as Awaited<ReturnType<typeof rewardReferral>>;
    if (r) {
      if (r.ambassador && r.referrerMinutes > 0) queueEmail(await emails.ambassadorReward(r.referrer, r.user.name, r.referrerMinutes), 'ambassador_reward', r.referrer.id);
      else if (r.referrerMinutes > 0) queueEmail(await emails.referralReward(r.referrer, r.user.name, r.referrerMinutes), 'referral_reward', r.referrer.id);
      if (r.minutes > 0) queueEmail(await emails.referralReward(r.user, r.referrer.name, r.minutes), 'referral_reward', r.user.id);
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
