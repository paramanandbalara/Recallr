import type { Coupon, Plan } from '@prisma/client';
import { db } from './db.js';
import { HttpError } from './http.js';

// Discount codes. Checked when the price is shown and again when the order is made; counted once the payment is paid.

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');

export const discountFor = (coupon: Pick<Coupon, 'kind' | 'amount'>, pricePaise: number) =>
  Math.min(pricePaise, coupon.kind === 'PERCENT' ? Math.round((pricePaise * Math.min(coupon.amount, 100)) / 100) : coupon.amount);

// The coupon if `code` can be used by this user for this plan, otherwise an error saying why
export const checkCoupon = async (code: string, plan: Plan, userId: string) => {
  const coupon = await db.coupon.findUnique({ where: { code: normalizeCode(code) } });
  const invalid = (message: string) => new HttpError(400, message, 'COUPON_INVALID');
  if (!coupon || !coupon.active) throw invalid('This code doesn’t exist.');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw invalid('This code has expired.');
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw invalid('This code has been used up.');
  const planIds = Array.isArray(coupon.planIds) ? (coupon.planIds as string[]) : null;
  if (planIds && !planIds.includes(plan.id)) throw invalid(`This code doesn’t work for ${plan.name}.`);
  if (coupon.onePerUser && (await db.payment.count({ where: { userId, couponId: coupon.id, status: 'PAID' } }))) {
    throw invalid('You’ve already used this code.');
  }
  return coupon;
};

// The price of a plan for this user, with an optional code
export const quote = async (plan: Plan, userId: string, code?: string) => {
  const coupon = code?.trim() ? await checkCoupon(code, plan, userId) : null;
  const discountPaise = coupon ? discountFor(coupon, plan.pricePaise) : 0;
  return { coupon, pricePaise: plan.pricePaise, discountPaise, amountPaise: plan.pricePaise - discountPaise };
};
