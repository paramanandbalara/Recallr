import express, { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { quote } from '../coupons.js';
import { emails } from '../emails.js';
import { fulfilPayment } from '../fulfil.js';
import { queueEmail } from '../mailer.js';
import { HttpError, route } from '../http.js';
import type { RazorpayGateway } from '../razorpay.js';
import { getSettings } from '../settings.js';

// Buying plans: online with Razorpay, or offline (the user pays directly and the admin confirms)
// `getRazorpay` gives the gateway for the current keys, or null when online payment isn't set up
export const billingRoutes = (getRazorpay: () => Promise<RazorpayGateway | null>) => {
  const router = Router();
  // JSON for everything except the webhook, which must see the raw body to check Razorpay's signature
  router.use((req, res, next) => (req.path === '/webhook' ? next() : express.json()(req, res, next)));

  const activePlan = async (planId: unknown) => {
    const plan = await db.plan.findFirst({ where: { id: z.string().parse(planId), active: true, isTrial: false } });
    if (!plan) throw new HttpError(404, 'This plan is no longer available.');
    return plan;
  };

  // What the website needs to show payment options
  router.get('/options', route(async (_req, res) => {
    const razorpay = await getRazorpay();
    res.json({ razorpayKeyId: razorpay?.keyId ?? null, offlineInfo: (await getSettings()).offlinePaymentInfo });
  }));

  const code = (body: { code?: unknown }) => z.string().max(40).optional().parse(body.code || undefined);
  const priced = async (req: { body: { planId?: unknown; code?: unknown }; user?: { id: string } }) => {
    const plan = await activePlan(req.body.planId);
    return { plan, ...(await quote(plan, req.user!.id, code(req.body))) };
  };

  // The price with a discount code, before paying
  router.post('/quote', requireUser, route(async (req, res) => {
    const { coupon, pricePaise, discountPaise, amountPaise } = await priced(req);
    res.json({ pricePaise, discountPaise, amountPaise, code: coupon?.code ?? null });
  }));

  // A code that makes the plan free: no payment needed
  router.post('/free', requireUser, route(async (req, res) => {
    const { plan, coupon, amountPaise, discountPaise } = await priced(req);
    if (!coupon || amountPaise > 0) throw new HttpError(400, 'This plan isn’t free with this code.');
    const payment = await db.payment.create({
      data: { userId: req.user!.id, planId: plan.id, amountPaise: 0, discountPaise, couponId: coupon.id, method: 'COUPON', status: 'CREATED', reference: coupon.code },
    });
    res.status(201).json({ purchase: await fulfilPayment(payment.id) });
  }));

  // 1. Create a Razorpay order for a plan
  router.post('/orders', requireUser, route(async (req, res) => {
    const razorpay = await getRazorpay();
    if (!razorpay) throw new HttpError(503, 'Online payment is not set up. Use offline payment.');
    const { plan, coupon, amountPaise, discountPaise } = await priced(req);
    if (amountPaise <= 0) throw new HttpError(400, 'This is free with your code: no payment needed.', 'FREE');
    const payment = await db.payment.create({
      data: { userId: req.user!.id, planId: plan.id, amountPaise, discountPaise, couponId: coupon?.id, method: 'RAZORPAY', status: 'CREATED' },
    });
    const order = await razorpay.createOrder(amountPaise, payment.id);
    await db.payment.update({ where: { id: payment.id }, data: { razorpayOrderId: order.id } });
    res.status(201).json({ keyId: razorpay.keyId, orderId: order.id, amount: order.amount, currency: order.currency, planName: plan.name });
  }));

  // 2. After Razorpay Checkout succeeds in the browser: check the signature and give the plan
  router.post('/verify', requireUser, route(async (req, res) => {
    const razorpay = await getRazorpay();
    if (!razorpay) throw new HttpError(503, 'Online payment is not set up.');
    const body = z.object({
      razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string(),
    }).parse(req.body);
    if (!razorpay.verifyPayment(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
      throw new HttpError(400, "We couldn't confirm this payment. If money was taken, contact us.");
    }
    const payment = await db.payment.findUnique({ where: { razorpayOrderId: body.razorpay_order_id } });
    if (!payment || payment.userId !== req.user!.id) throw new HttpError(404, 'Payment not found.');
    const purchase = await fulfilPayment(payment.id, { razorpayPaymentId: body.razorpay_payment_id });
    res.json({ purchase });
  }));

  // 3. Razorpay's own confirmation, in case the browser closed before step 2 (needs the raw body)
  router.post('/webhook', express.raw({ type: '*/*' }), route(async (req, res) => {
    const razorpay = await getRazorpay();
    if (!razorpay) return res.status(200).end();
    const signature = String(req.headers['x-razorpay-signature'] ?? '');
    if (!Buffer.isBuffer(req.body) || !razorpay.verifyWebhook(req.body, signature)) throw new HttpError(400, 'Invalid signature');
    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const entity = event.payload?.payment?.entity;
      const payment = entity?.order_id ? await db.payment.findUnique({ where: { razorpayOrderId: entity.order_id } }) : null;
      if (payment) await fulfilPayment(payment.id, { razorpayPaymentId: entity.id });
    }
    res.status(200).json({ ok: true });
  }));

  // The user paid offline (UPI, bank transfer...) and tells us; the admin confirms it
  router.post('/offline', requireUser, route(async (req, res) => {
    const reference = z.string().trim().min(3, 'Enter the UPI or bank reference.').max(200).parse(req.body.reference);
    const { plan, coupon, amountPaise, discountPaise } = await priced(req);
    if (amountPaise <= 0) throw new HttpError(400, 'This is free with your code: no payment needed.', 'FREE');
    const payment = await db.payment.create({
      data: {
        userId: req.user!.id, planId: plan.id, amountPaise, discountPaise, couponId: coupon?.id, method: 'OFFLINE', status: 'PENDING', reference,
        note: z.string().trim().max(1000).optional().parse(req.body.note),
      },
    });
    queueEmail(await emails.offlineSubmitted(req.user!, plan.name, amountPaise, reference), 'offline_submitted', req.user!.id);
    res.status(201).json({ payment });
  }));

  router.get('/payments', requireUser, route(async (req, res) => {
    const payments = await db.payment.findMany({
      where: { userId: req.user!.id, status: { not: 'CREATED' } },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true } } },
    });
    res.json({ payments });
  }));

  return router;
};
