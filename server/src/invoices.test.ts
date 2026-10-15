import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { financialYear, gstinCheckDigit, gstinError, numberInWords, rupeesInWords, splitGst } from './gst.js';
import { createInvoice, formatInvoiceNumber } from './invoices.js';
import { emailsSent, testOutbox } from './mailer.js';
import { razorpaySignature, type RazorpayGateway } from './razorpay.js';
import { clearSettingsCache } from './settings.js';

// ---------- Fakes ----------

const ai: AiGateway = {
  streamChat: async () => ({ text: '', provider: 'groq', model: 'test', inputTokens: 0, outputTokens: 0 }),
  transcribe: async () => ({ text: '', provider: 'groq', model: 'test' }),
};
const KEY_SECRET = 'rzp_secret';
const WEBHOOK_SECRET = 'rzp_webhook';
let orderCount = 0;
const razorpay: RazorpayGateway = {
  keyId: 'rzp_test_key',
  createOrder: async amount => ({ id: `order_inv_${++orderCount}_${Date.now()}`, amount, currency: 'INR' }),
  verifyPayment: (orderId, paymentId, signature) => razorpaySignature(KEY_SECRET, `${orderId}|${paymentId}`) === signature,
  verifyWebhook: (body, signature) => razorpaySignature(WEBHOOK_SECRET, body) === signature,
};
const app = createApp({ ai, razorpay });

// ---------- Helpers ----------

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: `${email.split('@')[0]} Kumar`, password: 'password123' });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, id: res.body.user.id as string };
};
const validGstin = (first14: string) => first14 + gstinCheckDigit(first14);
const SELLER_GSTIN = validGstin('08ABCDE1234F1Z'); // Rajasthan
const BUYER_GSTIN = validGstin('29AAACR5055K1Z'); // Karnataka

let admin: { token: string; id: string };
let user: { token: string; id: string };
let planId: string;

const settings = (values: Record<string, string>) => request(app).patch('/api/admin/settings').set(auth(admin.token)).send(values).expect(200);
const gstRegistered = () => settings({ sellerGstin: SELLER_GSTIN, sellerState: 'Rajasthan', sellerLegalName: 'Recallr Labs', sellerAddress: 'MI Road, Jaipur' });
const billingDetails = (token: string, details: object) => request(app).put('/api/invoices/billing-details').set(auth(token)).send(details);

// Buy online: order, then the browser's confirmation and/or Razorpay's webhook
const order = async (token: string, code?: string) => {
  const res = await request(app).post('/api/billing/orders').set(auth(token)).send({ planId, code });
  expect(res.status).toBe(201);
  return res.body.orderId as string;
};
const verify = (token: string, orderId: string, paymentId: string) => request(app).post('/api/billing/verify').set(auth(token)).send({
  razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: razorpaySignature(KEY_SECRET, `${orderId}|${paymentId}`),
});
const webhook = (orderId: string, paymentId: string) => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
  return request(app).post('/api/billing/webhook').set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', razorpaySignature(WEBHOOK_SECRET, Buffer.from(body))).send(body);
};
const buy = async (who = user, code?: string) => {
  const orderId = await order(who.token, code);
  await verify(who.token, orderId, `pay_${orderId}`).expect(200);
  return db.invoice.findFirstOrThrow({ where: { payment: { razorpayOrderId: orderId } } });
};
// The admin records a payment received outside the website
const recordOffline = (userId: string, amountPaise?: number) =>
  request(app).post('/api/admin/payments/offline').set(auth(admin.token)).send({ userId, planId, amountPaise, reference: 'UPI 1234' });

const year = financialYear(new Date());

beforeAll(async () => { await db.$connect(); });

beforeEach(async () => {
  await emailsSent(); // Emails still being sent from the last test mustn't land in this one's outbox
  testOutbox.length = 0;
  await db.emailLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.trialClaim.deleteMany();
  await db.device.deleteMany();
  await db.usageEvent.deleteMany();
  await db.invoice.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.coupon.deleteMany();
  await db.counter.deleteMany({ where: { key: { startsWith: 'invoice:' } } });
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  admin = await register('admin@example.com');
  user = await register('buyer@example.com');
  const plan = await request(app).post('/api/admin/plans').set(auth(admin.token))
    .send({ name: 'Pro', pricePaise: 79900, durationDays: 30, listeningMinutes: 600, tokenLimit: 2_000_000 });
  planId = plan.body.plan.id;
});

// ---------- Pure helpers ----------

describe('GST maths', () => {
  it('takes GST out of a price that includes it, split CGST + SGST in the same state', () => {
    expect(splitGst(79900, 1800, true)).toEqual({ taxablePaise: 67712, cgstPaise: 6094, sgstPaise: 6094, igstPaise: 0 });
    expect(splitGst(79900, 1800, false)).toEqual({ taxablePaise: 67712, cgstPaise: 0, sgstPaise: 0, igstPaise: 12188 });
  });

  it('gives an odd paisa to SGST, and always adds up to the total', () => {
    expect(splitGst(100, 1800, true)).toEqual({ taxablePaise: 85, cgstPaise: 7, sgstPaise: 8, igstPaise: 0 });
    for (const total of [1, 99, 49900, 99999, 123457]) {
      const s = splitGst(total, 1800, true);
      expect(s.taxablePaise + s.cgstPaise + s.sgstPaise).toBe(total);
      expect(s.sgstPaise - s.cgstPaise).toBeGreaterThanOrEqual(0);
      expect(s.sgstPaise - s.cgstPaise).toBeLessThanOrEqual(1);
    }
  });

  it('knows the Indian financial year in India time', () => {
    expect(financialYear(new Date('2027-03-31T18:29:59Z'))).toBe('2026-27'); // 23:59:59 on 31 March in India
    expect(financialYear(new Date('2027-03-31T18:30:00Z'))).toBe('2027-28'); // Midnight, 1 April in India
    expect(financialYear(new Date('2099-12-31T00:00:00Z'))).toBe('2099-00');
    expect(formatInvoiceNumber('RCL', '2026-27', 7)).toBe('RCL/2026-27/0007');
  });

  it('writes amounts in words with lakh and crore', () => {
    expect(rupeesInWords(79900)).toBe('Rupees Seven Hundred Ninety Nine Only');
    expect(rupeesInWords(123456789)).toBe('Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only');
    expect(numberInWords(10_01_00_005)).toBe('Ten Crore One Lakh Five');
  });

  it('checks a GSTIN’s format, state code and check digit', () => {
    expect(gstinError(SELLER_GSTIN)).toBe('');
    expect(gstinError('27AAPFU0939F1ZV')).toBe(''); // A real published GSTIN
    expect(gstinError(SELLER_GSTIN.slice(0, 14) + (SELLER_GSTIN[14] === 'A' ? 'B' : 'A'))).toMatch(/typo/);
    expect(gstinError('99ABCDE1234F1Z5')).toMatch(/state code/);
    expect(gstinError('08ABCDE1234F1Z')).toMatch(/15 characters/);
  });
});

// ---------- Invoices from payments ----------

describe('invoices', () => {
  it('makes a bill without GST when there is no GSTIN', async () => {
    const invoice = await buy();
    expect(invoice).toMatchObject({
      number: `RCL/${year}/0001`, financialYear: year, sequence: 1, kind: 'BILL', totalPaise: 79900, taxablePaise: 79900,
      cgstPaise: 0, sgstPaise: 0, igstPaise: 0, gstRateBasisPoints: 0, sacCode: '', sellerName: 'Recallr', buyerName: 'buyer Kumar', buyerEmail: 'buyer@example.com',
    });
  });

  it('numbers invoices without gaps, per financial year, with the prefix from settings', async () => {
    await settings({ invoicePrefix: 'RX' });
    expect((await buy()).number).toBe(`RX/${year}/0001`);
    await recordOffline(user.id).expect(201);
    expect(await db.invoice.count()).toBe(2);
    // Free with a 100% code: no invoice, and no number used up
    await db.coupon.create({ data: { code: 'FREE', kind: 'PERCENT', amount: 100 } });
    await request(app).post('/api/billing/free').set(auth(user.token)).send({ planId, code: 'FREE' }).expect(201);
    expect((await buy()).number).toBe(`RX/${year}/0003`);

    // A payment in the next financial year starts again at 0001
    const payment = await db.payment.create({ data: { userId: user.id, planId, amountPaise: 49900, method: 'OFFLINE', status: 'PAID' } });
    const purchase = await db.purchase.create({ data: { userId: user.id, planId, planName: 'Pro', source: 'OFFLINE', paymentId: payment.id, startsAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) } });
    const next = await db.$transaction(tx => createInvoice(tx, payment.id, purchase, new Date('2099-05-01T00:00:00Z')));
    expect(next).toMatchObject({ number: 'RX/2099-00/0001', financialYear: '2099-00', sequence: 1 });
    // Asking again gives the same invoice
    expect((await db.$transaction(tx => createInvoice(tx, payment.id, purchase)))!.id).toBe(next!.id);
  });

  it('gives each of many payments at the same time its own number, with no gaps', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => recordOffline(user.id)));
    expect(results.every(r => r.status === 201)).toBe(true);
    const invoices = await db.invoice.findMany({ orderBy: { sequence: 'asc' } });
    expect(invoices.map(i => i.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(invoices.map(i => i.number)).size).toBe(8);
  });

  it('makes one invoice when the browser and the webhook confirm the same payment together', async () => {
    const orderId = await order(user.token);
    const results = await Promise.all([1, 2, 3].flatMap(() => [verify(user.token, orderId, 'pay_both'), webhook(orderId, 'pay_both')]));
    expect(results.map(r => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    await webhook(orderId, 'pay_both').expect(200);
    expect(await db.invoice.count()).toBe(1);
    expect(await db.purchase.count({ where: { userId: user.id } })).toBe(1);
    await emailsSent();
    const invoice = await db.invoice.findFirstOrThrow();
    expect(testOutbox.filter(e => e.kind === 'payment_received').map(e => e.text.includes(invoice.number))).toEqual([true]);
  });

  it('charges GST with a GSTIN: CGST + SGST in the seller’s state, IGST to another state', async () => {
    await gstRegistered();
    // No state given: the seller's own state is the place of supply
    expect(await buy()).toMatchObject({
      kind: 'TAX_INVOICE', sellerGstin: SELLER_GSTIN, sellerState: 'Rajasthan', sellerName: 'Recallr Labs', sacCode: '998431', gstRateBasisPoints: 1800,
      totalPaise: 79900, taxablePaise: 67712, cgstPaise: 6094, sgstPaise: 6094, igstPaise: 0,
    });
    await billingDetails(user.token, { billingState: 'rajasthan' }).expect(200);
    expect(await buy()).toMatchObject({ buyerState: 'Rajasthan', cgstPaise: 6094, sgstPaise: 6094, igstPaise: 0 });
    await billingDetails(user.token, { billingName: 'Acme Pvt Ltd', billingAddress: 'Koramangala, Bengaluru', billingState: 'Karnataka', gstin: BUYER_GSTIN.toLowerCase() }).expect(200);
    expect(await buy()).toMatchObject({
      buyerName: 'Acme Pvt Ltd', buyerState: 'Karnataka', buyerGstin: BUYER_GSTIN, buyerAddress: 'Koramangala, Bengaluru',
      taxablePaise: 67712, cgstPaise: 0, sgstPaise: 0, igstPaise: 12188,
    });
  });

  it('invoices what was actually paid with a code, and shows the discount', async () => {
    await gstRegistered();
    await db.coupon.create({ data: { code: 'SAVE', kind: 'FIXED', amount: 10001 } });
    const invoice = await buy(user, 'SAVE');
    expect(invoice).toMatchObject({ totalPaise: 69899, taxablePaise: 59236, cgstPaise: 5331, sgstPaise: 5332 }); // Odd paisa to SGST
    const pdf = await request(app).get(`/api/invoices/${invoice.id}/pdf`).set(auth(user.token)).buffer(true).parse(binary);
    const text = await pdfText(pdf.body);
    expect(text).toContain('Discount (code SAVE)');
    expect(text).toContain('₹698.99');
  });

  it('keeps the seller and buyer details as they were when the invoice was made', async () => {
    const invoice = await buy();
    await gstRegistered();
    await billingDetails(user.token, { billingName: 'New Name' }).expect(200);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ kind: 'BILL', sellerGstin: '', buyerName: 'buyer Kumar' });
  });
});

// ---------- PDF and email ----------

const binary = (res: NodeJS.ReadableStream & { setEncoding: (e: string) => void }, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
const pdfText = async (pdf: Buffer) => {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
  return text;
};

describe('invoice PDF and email', () => {
  it('renders a PDF with the invoice number and GST lines', async () => {
    await gstRegistered();
    await billingDetails(user.token, { billingState: 'Karnataka', gstin: BUYER_GSTIN }).expect(200);
    const invoice = await buy();
    const res = await request(app).get(`/api/invoices/${invoice.id}/pdf`).set(auth(user.token)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(`invoice-RCL-${year}-0001.pdf`);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
    const text = await pdfText(pdf);
    for (const expected of ['TAX INVOICE', invoice.number, SELLER_GSTIN, BUYER_GSTIN, 'IGST @ 18%', '₹799.00', 'Seven Hundred Ninety Nine', 'Place of supply: Karnataka (29)', 'computer-generated', 'Online (Razorpay)']) {
      expect(text).toContain(expected);
    }
  });

  it('prints a bill without GST as an invoice that says GST doesn’t apply', async () => {
    const invoice = await buy();
    const res = await request(app).get(`/api/invoices/${invoice.id}/pdf`).set(auth(user.token)).buffer(true).parse(binary);
    const text = await pdfText(res.body);
    expect(text).toContain('INVOICE');
    expect(text).not.toContain('TAX INVOICE');
    expect(text).toContain('GST not applicable: supplier not registered under GST');
    expect(text).not.toContain('CGST');
  });

  it('attaches the invoice to the payment email (one email) and remembers it was sent', async () => {
    const invoice = await buy();
    await emailsSent();
    const mails = testOutbox.filter(e => e.to === 'buyer@example.com' && e.kind !== 'welcome');
    expect(mails.map(m => m.kind)).toEqual(['payment_received']);
    expect(mails[0].text).toContain(invoice.number);
    expect(mails[0].files).toHaveLength(1);
    expect(mails[0].files[0]).toMatchObject({ filename: `invoice-RCL-${year}-0001.pdf`, contentType: 'application/pdf' });
    expect(mails[0].files[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(mails[0].attachments?.[0].content).toBeUndefined(); // Made when sending, not kept with the email
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).emailedAt).not.toBeNull();
  });

  it('also invoices offline payments the admin confirms', async () => {
    const reported = await request(app).post('/api/billing/offline').set(auth(user.token)).send({ planId, reference: 'UPI 98765' });
    expect(reported.status).toBe(201);
    expect(await db.invoice.count()).toBe(0);
    await request(app).post(`/api/admin/payments/${reported.body.payment.id}/approve`).set(auth(admin.token)).send({}).expect(200);
    await request(app).post(`/api/admin/payments/${reported.body.payment.id}/approve`).set(auth(admin.token)).send({}).expect(200);
    const invoices = await db.invoice.findMany();
    expect(invoices).toHaveLength(1);
    const payments = await request(app).get('/api/admin/payments?status=PAID').set(auth(admin.token)).expect(200);
    expect(payments.body.payments[0].invoice).toEqual({ id: invoices[0].id, number: invoices[0].number });
    const pdf = await request(app).get(`/api/admin/invoices/${invoices[0].id}/pdf`).set(auth(admin.token)).buffer(true).parse(binary);
    expect(await pdfText(pdf.body)).toContain('UPI 98765');
  });

  it('resends the invoice, but not twice in a minute', async () => {
    const invoice = await buy();
    await emailsSent();
    await request(app).post(`/api/invoices/${invoice.id}/email`).set(auth(user.token)).expect(429);
    await db.invoice.update({ where: { id: invoice.id }, data: { emailedAt: new Date(Date.now() - 120_000) } });
    await request(app).post(`/api/invoices/${invoice.id}/email`).set(auth(user.token)).expect(200);
    const copy = testOutbox.filter(e => e.kind === 'invoice_copy');
    expect(copy).toHaveLength(1);
    expect(copy[0].subject).toContain(invoice.number);
    expect(copy[0].files[0].content.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

// ---------- Who sees what ----------

describe('invoice access', () => {
  it('lets users list and download only their own invoices', async () => {
    const other = await register('other@example.com');
    const mine = await buy();
    const theirs = await buy(other);
    const list = await request(app).get('/api/invoices').set(auth(user.token)).expect(200);
    expect(list.body.invoices.map((i: { id: string }) => i.id)).toEqual([mine.id]);
    await request(app).get(`/api/invoices/${theirs.id}/pdf`).set(auth(user.token)).expect(404);
    await request(app).post(`/api/invoices/${theirs.id}/email`).set(auth(user.token)).expect(404);
    await request(app).get(`/api/invoices/${mine.id}/pdf`).expect(401);
    await request(app).get('/api/admin/invoices').set(auth(user.token)).expect(403);
    const payments = await request(app).get('/api/billing/payments').set(auth(user.token)).expect(200);
    expect(payments.body.payments[0].invoice.number).toBe(mine.number);
  });

  it('checks the billing details', async () => {
    const bad = await billingDetails(user.token, { gstin: SELLER_GSTIN.slice(0, 14) + (SELLER_GSTIN[14] === 'A' ? 'B' : 'A') });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/typo/);
    expect((await billingDetails(user.token, { billingState: 'Atlantis' })).status).toBe(400);
    const mismatch = await billingDetails(user.token, { billingState: 'Kerala', gstin: BUYER_GSTIN });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toContain('Karnataka');
    // A GSTIN alone fills in its state
    const ok = await billingDetails(user.token, { billingName: 'Acme', gstin: BUYER_GSTIN });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ billingName: 'Acme', billingState: 'Karnataka', gstin: BUYER_GSTIN });
    expect((await request(app).get('/api/invoices/billing-details').set(auth(user.token))).body).toMatchObject({ billingState: 'Karnataka' });
  });

  it('lists, filters and exports invoices for the admin', async () => {
    await gstRegistered();
    await billingDetails(user.token, { billingName: 'Acme, "Pvt" Ltd', billingState: 'Karnataka', gstin: BUYER_GSTIN }).expect(200);
    const first = await buy();
    const other = await register('second@example.com');
    const second = await buy(other);

    const all = await request(app).get('/api/admin/invoices').set(auth(admin.token)).expect(200);
    expect(all.body.invoices.map((i: { number: string }) => i.number)).toEqual([second.number, first.number]);
    expect(all.body.financialYears).toEqual([year]);
    expect(all.body.totals.totalPaise).toBe(159800);
    const found = await request(app).get('/api/admin/invoices?search=second@').set(auth(admin.token)).expect(200);
    expect(found.body.invoices.map((i: { id: string }) => i.id)).toEqual([second.id]);
    expect((await request(app).get('/api/admin/invoices?fy=2001-02').set(auth(admin.token))).body.invoices).toEqual([]);

    const csv = await request(app).get(`/api/admin/invoices.csv?fy=${year}`).set(auth(admin.token)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.trim().split('\n');
    expect(lines[0]).toBe('invoice_number,date,type,buyer,buyer_email,gstin,state,taxable,cgst,sgst,igst,total');
    expect(lines[1]).toContain(`${first.number},`);
    expect(lines[1]).toContain(`,Tax invoice,"Acme, ""Pvt"" Ltd",buyer@example.com,${BUYER_GSTIN},Karnataka,677.12,0.00,0.00,121.88,799.00`);
    expect(lines[2]).toContain(',second Kumar,second@example.com,,Rajasthan,677.12,60.94,60.94,0.00,799.00');
    await request(app).get('/api/admin/invoices.csv').set(auth(user.token)).expect(403);
  });
});
