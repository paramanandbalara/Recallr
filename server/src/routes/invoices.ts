import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireUser } from '../auth.js';
import { audit } from '../audit.js';
import { db } from '../db.js';
import { findState, gstinError, stateOfGstin } from '../gst.js';
import { HttpError, route } from '../http.js';
import { invoiceFilename, invoicePdf, invoicesCsv, invoiceSummary, sendInvoiceEmail } from '../invoices.js';

// Invoices: users see and download their own, and set the details printed on future ones;
// admins see all of them, resend them and export them for the accountant.

const RESEND_EVERY_MS = 60_000;

const sendPdf = async (res: Response, invoice: { id: string; number: string }, download: boolean) => {
  const pdf = await invoicePdf(invoice.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${invoiceFilename(invoice.number)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
};

const billingDetails = z.object({
  billingName: z.string().trim().max(200).default(''),
  billingAddress: z.string().trim().max(500).default(''),
  billingState: z.string().trim().max(60).default(''),
  gstin: z.string().trim().toUpperCase().max(15).default(''),
});

// ---------- The user's own ----------

export const invoiceRoutes = Router();
invoiceRoutes.use(requireUser);

invoiceRoutes.get('/', route(async (req, res) => {
  const invoices = await db.invoice.findMany({ where: { userId: req.user!.id }, orderBy: { issuedAt: 'desc' } });
  res.json({ invoices: invoices.map(invoiceSummary) });
}));

// Name, address, state and GSTIN printed on future invoices (invoices already made don't change)
invoiceRoutes.get('/billing-details', route(async (req, res) => {
  const { billingName, billingAddress, billingState, gstin } = req.user!;
  res.json({ billingName, billingAddress, billingState, gstin, defaultName: req.user!.name });
}));

invoiceRoutes.put('/billing-details', route(async (req, res) => {
  const input = billingDetails.parse(req.body);
  const state = input.billingState ? findState(input.billingState) : null;
  if (input.billingState && !state) throw new HttpError(400, 'Choose your state from the list.');
  if (input.gstin) {
    const error = gstinError(input.gstin);
    if (error) throw new HttpError(400, error);
    const registered = stateOfGstin(input.gstin)!;
    if (state && state.code !== registered.code) throw new HttpError(400, `This GSTIN is registered in ${registered.name}. Choose ${registered.name} as the state.`);
  }
  const user = await db.user.update({
    where: { id: req.user!.id },
    data: { ...input, billingState: state?.name ?? (input.gstin ? stateOfGstin(input.gstin)!.name : '') },
  });
  res.json({ billingName: user.billingName, billingAddress: user.billingAddress, billingState: user.billingState, gstin: user.gstin, defaultName: user.name });
}));

const ownInvoice = async (userId: string, id: string) => {
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice || invoice.userId !== userId) throw new HttpError(404, 'Invoice not found.');
  return invoice;
};

invoiceRoutes.get('/:id/pdf', route(async (req, res) => {
  await sendPdf(res, await ownInvoice(req.user!.id, req.params.id), req.query.download !== '0');
}));

const resend = async (invoice: { id: string; emailedAt: Date | null; updatedAt: Date }) => {
  if (invoice.emailedAt && Date.now() - invoice.emailedAt.getTime() < RESEND_EVERY_MS) {
    throw new HttpError(429, 'The invoice was just emailed. Check your inbox (and spam) before sending it again.');
  }
  const status = await sendInvoiceEmail(invoice.id, 'copy');
  if (status === 'FAILED') throw new HttpError(502, 'The email couldn’t be sent. Try again later, or download the PDF.');
  if (status === 'SKIPPED') throw new HttpError(503, 'Email isn’t set up yet. Download the PDF instead.');
};

invoiceRoutes.post('/:id/email', route(async (req, res) => {
  await resend(await ownInvoice(req.user!.id, req.params.id));
  res.json({ ok: true });
}));

// ---------- Admin ----------

export const adminInvoiceRoutes = Router();
adminInvoiceRoutes.use(requireUser, requireAdmin);

const listQuery = z.object({
  search: z.string().trim().max(200).optional(),
  fy: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  kind: z.enum(['TAX_INVOICE', 'BILL']).optional(),
});
const listWhere = (q: z.infer<typeof listQuery>): Prisma.InvoiceWhereInput => ({
  ...(q.fy ? { financialYear: q.fy } : {}),
  ...(q.kind ? { kind: q.kind } : {}),
  ...(q.search ? { OR: [{ number: { contains: q.search } }, { buyerName: { contains: q.search } }, { buyerEmail: { contains: q.search } }, { buyerGstin: { contains: q.search } }] } : {}),
});

adminInvoiceRoutes.get('/invoices', route(async (req, res) => {
  const q = listQuery.parse(req.query);
  const where = listWhere(q);
  const [invoices, totals, years] = await Promise.all([
    db.invoice.findMany({ where, orderBy: [{ financialYear: 'desc' }, { sequence: 'desc' }], take: 500 }),
    db.invoice.aggregate({ where, _count: { _all: true }, _sum: { totalPaise: true, taxablePaise: true, cgstPaise: true, sgstPaise: true, igstPaise: true } }),
    db.invoice.findMany({ distinct: ['financialYear'], select: { financialYear: true }, orderBy: { financialYear: 'desc' } }),
  ]);
  res.json({
    invoices: invoices.map(invoiceSummary),
    count: totals._count._all,
    totals: totals._sum,
    financialYears: years.map(y => y.financialYear),
  });
}));

// The spreadsheet for the accountant (same filters as the list, no limit)
adminInvoiceRoutes.get('/invoices.csv', route(async (req, res) => {
  const q = listQuery.parse(req.query);
  const invoices = await db.invoice.findMany({ where: listWhere(q), orderBy: [{ financialYear: 'asc' }, { sequence: 'asc' }] });
  await audit(req, 'invoices.export', `${invoices.length} invoices`, { fy: q.fy ?? 'all' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="recallr-invoices-${q.fy ?? 'all'}.csv"`);
  res.send(invoicesCsv(invoices));
}));

const anyInvoice = async (id: string) => {
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  return invoice;
};

adminInvoiceRoutes.get('/invoices/:id/pdf', route(async (req, res) => {
  await sendPdf(res, await anyInvoice(req.params.id), req.query.download !== '0');
}));

adminInvoiceRoutes.post('/invoices/:id/email', route(async (req, res) => {
  const invoice = await anyInvoice(req.params.id);
  await resend(invoice);
  await audit(req, 'invoice.resend', invoice.buyerEmail, { number: invoice.number });
  res.json({ ok: true });
}));
