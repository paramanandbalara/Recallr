import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { HttpError } from './http.js';

// Razorpay: create orders, and check that payments and webhooks really come from Razorpay

export interface RazorpayGateway {
  keyId: string;
  createOrder: (amountPaise: number, receipt: string) => Promise<{ id: string; amount: number; currency: string }>;
  verifyPayment: (orderId: string, paymentId: string, signature: string) => boolean;
  verifyWebhook: (rawBody: Buffer, signature: string) => boolean;
}

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const hmac = (secret: string, payload: string | Buffer) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

export const createRazorpay = (keyId?: string, keySecret?: string, webhookSecret?: string): RazorpayGateway | null => {
  if (!keyId || !keySecret) return null;
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return {
    keyId,
    createOrder: async (amountPaise, receipt) => {
      const order = await client.orders.create({ amount: amountPaise, currency: 'INR', receipt });
      return { id: order.id, amount: Number(order.amount), currency: order.currency };
    },
    verifyPayment: (orderId, paymentId, signature) => safeEqual(hmac(keySecret, `${orderId}|${paymentId}`), signature),
    verifyWebhook: (rawBody, signature) => {
      if (!webhookSecret) throw new HttpError(500, 'Razorpay webhook secret is not set.');
      return safeEqual(hmac(webhookSecret, rawBody), signature);
    },
  };
};

export const razorpaySignature = hmac; // For tests

// The gateway for the keys saved in Admin → Settings (null until they're set), rebuilt when they change
export const razorpayFromSettings = (getSettings: () => Promise<{ razorpayKeyId: string; razorpayKeySecret: string; razorpayWebhookSecret: string }>) => {
  let current: { signature: string; gateway: RazorpayGateway | null } | null = null;
  return async () => {
    const s = await getSettings();
    const signature = `${s.razorpayKeyId}|${s.razorpayKeySecret}|${s.razorpayWebhookSecret}`;
    if (current?.signature !== signature) {
      current = { signature, gateway: createRazorpay(s.razorpayKeyId || undefined, s.razorpayKeySecret || undefined, s.razorpayWebhookSecret || undefined) };
    }
    return current.gateway;
  };
};

// Checks the keys work (for the admin panel). Returns an error message, or '' when they work.
export const testRazorpayKeys = async (keyId: string, keySecret: string) => {
  if (!keyId || !keySecret) return 'Save both the key ID and the key secret first.';
  try {
    await new Razorpay({ key_id: keyId, key_secret: keySecret }).orders.all({ count: 1 });
    return '';
  } catch (error) {
    const e = error as { statusCode?: number; error?: { description?: string } };
    return e.statusCode === 401 ? 'Razorpay rejected these keys.' : e.error?.description ?? 'The check failed.';
  }
};
