import type { Invoice, Prisma, Purchase } from '@prisma/client';
import { db } from './db.js';
import { emails } from './emails.js';
import { financialYear, findState, splitGst, stateOfGstin } from './gst.js';
import { renderInvoicePdf, type InvoicePdfData } from './invoicePdf.js';
import { sendEmail, track } from './mailer.js';
import { getSettings, numberSetting } from './settings.js';

// One invoice per paid payment, made in the same transaction that marks the payment paid.
// Numbers are PREFIX/2026-27/0001, gap-free within each financial year: the counter row stays locked
// until the payment's transaction commits, and rolls back with it.
// With a GSTIN in Admin → Settings → Invoices it's a tax invoice (prices include GST); without, a bill without GST.

type Tx = Prisma.TransactionClient;

export const formatInvoiceNumber = (prefix: string, year: string, sequence: number) => `${prefix}/${year}/${String(sequence).padStart(4, '0')}`;

const cleanPrefix = (prefix: string) => prefix.trim().replace(/[^A-Za-z0-9-]/g, '').slice(0, 16) || 'RCL';

// The next number of a financial year. Must run inside the transaction that creates the invoice.
const nextSequence = async (tx: Tx, year: string) => {
  const key = `invoice:${year}`;
  await tx.$executeRaw`INSERT INTO counters (\`key\`, value) VALUES (${key}, 1) ON DUPLICATE KEY UPDATE value = value + 1, updated_at = CURRENT_TIMESTAMP(3)`;
  const [row] = await tx.$queryRaw<{ value: number | bigint }[]>`SELECT value FROM counters WHERE \`key\` = ${key} FOR UPDATE`;
  return Number(row.value);
};

// Called by fulfilPayment inside its transaction, after the pack is given. Free payments (a 100% code) get none.
export const createInvoice = async (tx: Tx, paymentId: string, purchase: Purchase, issuedAt = new Date()): Promise<Invoice | null> => {
  const existing = await tx.invoice.findUnique({ where: { paymentId } });
  if (existing) return existing;
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { user: true, plan: true } });
  if (!payment || payment.amountPaise <= 0) return null;

  const s = await getSettings();
  const sellerGstin = s.sellerGstin.trim().toUpperCase();
  const sellerState = findState(s.sellerState) ?? (sellerGstin ? stateOfGstin(sellerGstin) : null);
  const buyerState = findState(payment.user.billingState);
  const kind = sellerGstin ? 'TAX_INVOICE' as const : 'BILL' as const;
  const rate = kind === 'TAX_INVOICE' ? Math.max(0, numberSetting(s, 'gstRatePercent')) * 100 : 0;
  // Place of supply: the buyer's state, or the seller's when the buyer didn't give one
  const placeOfSupply = buyerState ?? sellerState;
  const intraState = !sellerState || !placeOfSupply || placeOfSupply.code === sellerState.code;
  const amounts = kind === 'TAX_INVOICE'
    ? splitGst(payment.amountPaise, rate, intraState)
    : { taxablePaise: payment.amountPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };

  const year = financialYear(issuedAt);
  const sequence = await nextSequence(tx, year);
  const days = Math.round((purchase.expiresAt.getTime() - purchase.startsAt.getTime()) / 86_400_000);
  return tx.invoice.create({
    data: {
      number: formatInvoiceNumber(cleanPrefix(s.invoicePrefix), year, sequence),
      financialYear: year, sequence, kind, paymentId, userId: payment.userId, issuedAt,
      sellerName: (s.sellerLegalName || s.businessName || 'Recallr').slice(0, 200),
      sellerAddress: s.sellerAddress.slice(0, 500),
      sellerState: sellerState?.name ?? s.sellerState.slice(0, 60),
      sellerGstin: sellerGstin.slice(0, 15),
      buyerName: (payment.user.billingName || payment.user.name).slice(0, 200),
      buyerEmail: payment.user.email,
      buyerAddress: payment.user.billingAddress.slice(0, 500),
      buyerState: buyerState?.name ?? '',
      buyerGstin: payment.user.gstin,
      description: `Recallr ${purchase.planName || payment.plan.name} plan: AI interview assistant, ${days} days`.slice(0, 300),
      sacCode: kind === 'TAX_INVOICE' ? s.sacCode.trim().slice(0, 10) : '',
      totalPaise: payment.amountPaise,
      ...amounts,
      gstRateBasisPoints: rate,
    },
  });
};

// ---------- PDF ----------

const METHOD: Record<string, string> = { RAZORPAY: 'Online (Razorpay)', OFFLINE: 'UPI / bank transfer', COUPON: 'Discount code' };

const withDetails = { payment: { include: { coupon: { select: { code: true } }, purchase: true } } } as const;
type InvoiceWithDetails = Prisma.InvoiceGetPayload<{ include: typeof withDetails }>;

export const pdfData = async (invoice: InvoiceWithDetails): Promise<InvoicePdfData> => {
  const { payment } = invoice;
  return {
    ...invoice,
    discountPaise: payment.discountPaise,
    couponCode: payment.coupon?.code ?? null,
    validFrom: payment.purchase?.startsAt ?? null,
    validUntil: payment.purchase?.expiresAt ?? null,
    paymentMethod: METHOD[payment.method] ?? payment.method,
    paymentReference: payment.razorpayPaymentId ?? payment.reference ?? '',
    paidAt: payment.paidAt,
    supportEmail: (await getSettings()).supportEmail,
  };
};

export const invoicePdf = async (invoiceId: string) => {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: withDetails });
  if (!invoice) throw new Error('Invoice not found.');
  return renderInvoicePdf(await pdfData(invoice));
};

export const invoiceFilename = (number: string) => `invoice-${number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;

// ---------- Email ----------

// `payment`: the "Payment received" email with the invoice attached (one email, not two). `copy`: "Resend invoice".
// The PDF is made when the email is sent. Returns how sending went; emailedAt is set when it went out.
export const sendInvoiceEmail = async (invoiceId: string, which: 'payment' | 'copy') => {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { user: true, payment: { include: { purchase: true } } } });
  if (!invoice) return 'FAILED' as const;
  const to = { email: invoice.user.email, name: invoice.user.name };
  const email = which === 'payment' && invoice.payment.purchase
    ? await emails.paymentReceived(to, invoice.payment.purchase.planName, invoice.totalPaise, invoice.payment.purchase.expiresAt, invoice.number)
    : await emails.invoiceCopy(to, invoice.number, invoice.totalPaise, invoice.issuedAt);
  email.attachments = [{ filename: invoiceFilename(invoice.number), contentType: 'application/pdf', render: () => invoicePdf(invoice.id) }];
  const status = await sendEmail(email, which === 'payment' ? 'payment_received' : 'invoice_copy', invoice.userId);
  if (status === 'SENT') await db.invoice.update({ where: { id: invoice.id }, data: { emailedAt: new Date() } });
  return status;
};

export const queueInvoiceEmail = (invoiceId: string, which: 'payment' | 'copy') => {
  void track(sendInvoiceEmail(invoiceId, which).catch(error => console.error('Invoice email failed:', error)));
};

// ---------- Lists ----------

export const invoiceSummary = (i: Invoice) => ({
  id: i.id, number: i.number, kind: i.kind, financialYear: i.financialYear, issuedAt: i.issuedAt, emailedAt: i.emailedAt,
  description: i.description, buyerName: i.buyerName, buyerEmail: i.buyerEmail, buyerState: i.buyerState, buyerGstin: i.buyerGstin,
  totalPaise: i.totalPaise, taxablePaise: i.taxablePaise, cgstPaise: i.cgstPaise, sgstPaise: i.sgstPaise, igstPaise: i.igstPaise,
  paymentId: i.paymentId, userId: i.userId,
});

// For the accountant: one row per invoice
export const invoicesCsv = (invoices: Invoice[]) => {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const amount = (paise: number) => (paise / 100).toFixed(2);
  const rows = [['invoice_number', 'date', 'type', 'buyer', 'buyer_email', 'gstin', 'state', 'taxable', 'cgst', 'sgst', 'igst', 'total']];
  for (const i of invoices) {
    const date = new Date(i.issuedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10); // India date
    rows.push([i.number, date, i.kind === 'TAX_INVOICE' ? 'Tax invoice' : 'Bill', i.buyerName, i.buyerEmail, i.buyerGstin, i.buyerState || i.sellerState,
      amount(i.taxablePaise), amount(i.cgstPaise), amount(i.sgstPaise), amount(i.igstPaise), amount(i.totalPaise)]);
  }
  return `${rows.map(r => r.map(cell).join(',')).join('\n')}\n`;
};
