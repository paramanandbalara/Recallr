import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { findState, formatRupees, istDate, rupeesInWords } from './gst.js';

// The invoice as an A4 PDF, made when it's downloaded or emailed (nothing is stored).
// Noto Sans (SIL Open Font License, see assets/fonts/OFL.txt) is bundled because it has the ₹ sign.

export interface InvoicePdfData {
  number: string;
  kind: 'TAX_INVOICE' | 'BILL';
  issuedAt: Date;
  sellerName: string;
  sellerAddress: string;
  sellerState: string;
  sellerGstin: string;
  buyerName: string;
  buyerEmail: string;
  buyerAddress: string;
  buyerState: string;
  buyerGstin: string;
  description: string;
  sacCode: string;
  totalPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  gstRateBasisPoints: number;
  discountPaise: number;
  couponCode: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  paymentMethod: string; // e.g. "Online (Razorpay)"
  paymentReference: string;
  paidAt: Date | null;
  supportEmail: string;
}

const font = (name: string) => fileURLToPath(new URL(`../assets/fonts/${name}`, import.meta.url));
let fonts: { regular: Buffer; bold: Buffer } | null = null;
const loadFonts = () => (fonts ??= { regular: fs.readFileSync(font('NotoSans-Regular.ttf')), bold: fs.readFileSync(font('NotoSans-Bold.ttf')) });

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#cbd5e1';
const SHADE = '#f1f5f9';

const stateLabel = (name: string) => {
  const state = findState(name);
  return state ? `${state.name} (${state.code})` : name;
};
const percent = (basisPoints: number) => `${+(basisPoints / 100).toFixed(2)}%`;

export const renderInvoicePdf = (inv: InvoicePdfData): Promise<Buffer> => new Promise((resolve, reject) => {
  const { regular, bold } = loadFonts();
  const doc = new PDFDocument({
    size: 'A4', margin: 48,
    info: { Title: `Invoice ${inv.number}`, Author: inv.sellerName, Subject: inv.description, Creator: 'Recallr' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(chunk as Buffer));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  doc.registerFont('regular', regular);
  doc.registerFont('bold', bold);

  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;
  const tax = inv.kind === 'TAX_INVOICE';
  const placeOfSupply = inv.buyerState || inv.sellerState;
  const interState = inv.igstPaise > 0 || (inv.cgstPaise + inv.sgstPaise === 0 && findState(placeOfSupply)?.code !== findState(inv.sellerState)?.code);

  // Small label, then the value under it
  const block = (x: number, y: number, w: number, lines: { text: string; bold?: boolean; muted?: boolean; size?: number }[]) => {
    let at = y;
    for (const line of lines) {
      if (!line.text) continue;
      doc.font(line.bold ? 'bold' : 'regular').fontSize(line.size ?? 9.5).fillColor(line.muted ? MUTED : INK);
      doc.text(line.text, x, at, { width: w });
      at = doc.y + 1;
    }
    return at;
  };

  // ---------- Seller and title ----------
  const sellerEnd = block(left, 48, width * 0.55, [
    { text: inv.sellerName, bold: true, size: 15 },
    { text: inv.sellerAddress, muted: true },
    { text: inv.sellerState ? `State: ${stateLabel(inv.sellerState)}` : '', muted: true },
    { text: inv.sellerGstin ? `GSTIN: ${inv.sellerGstin}` : '', bold: true },
    { text: inv.supportEmail, muted: true },
  ]);
  doc.font('bold').fontSize(20).fillColor(INK).text(tax ? 'TAX INVOICE' : 'INVOICE', left, 48, { width, align: 'right' });
  doc.font('regular').fontSize(9.5).fillColor(MUTED);
  const metaY = doc.y + 6;
  const meta = [['Invoice no.', inv.number], ['Date', istDate(inv.issuedAt)]];
  meta.forEach(([label, value], i) => {
    doc.font('regular').fillColor(MUTED).text(label, right - 220, metaY + i * 15, { width: 80 });
    doc.font('bold').fillColor(INK).text(value, right - 140, metaY + i * 15, { width: 140, align: 'right' });
  });
  let y = Math.max(sellerEnd, metaY + meta.length * 15) + 14;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(LINE).stroke();
  y += 14;

  // ---------- Buyer and payment ----------
  doc.font('bold').fontSize(8).fillColor(MUTED).text('BILL TO', left, y);
  doc.font('bold').fontSize(8).fillColor(MUTED).text('PAYMENT', left + width * 0.58, y);
  const buyerEnd = block(left, y + 13, width * 0.52, [
    { text: inv.buyerName, bold: true, size: 11 },
    { text: inv.buyerEmail, muted: true },
    { text: inv.buyerAddress },
    { text: inv.buyerState ? `State: ${stateLabel(inv.buyerState)}` : '' },
    { text: inv.buyerGstin ? `GSTIN: ${inv.buyerGstin}` : '', bold: true },
  ]);
  const paymentEnd = block(left + width * 0.58, y + 13, width * 0.42, [
    { text: `Method: ${inv.paymentMethod}` },
    { text: inv.paymentReference ? `Reference: ${inv.paymentReference}` : '' },
    { text: inv.paidAt ? `Paid on: ${istDate(inv.paidAt)}` : '' },
    { text: tax && placeOfSupply ? `Place of supply: ${stateLabel(placeOfSupply)}` : '' },
  ]);
  y = Math.max(buyerEnd, paymentEnd) + 18;

  // ---------- The line item ----------
  // Tax invoice: amounts are taxable values (before GST); otherwise what was paid
  const cols = { no: left + 8, desc: left + 30, sac: left + width - 190, amount: left + width - 110 };
  const amountWidth = 102;
  doc.rect(left, y, width, 22).fill(SHADE);
  doc.font('bold').fontSize(8.5).fillColor(MUTED);
  doc.text('#', cols.no, y + 7);
  doc.text('DESCRIPTION', cols.desc, y + 7);
  if (tax || inv.sacCode) doc.text('SAC', cols.sac, y + 7);
  doc.text(tax ? 'TAXABLE VALUE' : 'AMOUNT', cols.amount, y + 7, { width: amountWidth, align: 'right' });
  y += 30;

  const listPaise = inv.totalPaise + inv.discountPaise;
  const listTaxable = tax ? Math.round((listPaise * 10_000) / (10_000 + inv.gstRateBasisPoints)) : listPaise;
  const row = (no: string, title: string, detail: string, sac: string, paise: number) => {
    doc.font('regular').fontSize(9.5).fillColor(INK).text(no, cols.no, y);
    doc.font('bold').fontSize(10).fillColor(INK).text(title, cols.desc, y, { width: cols.sac - cols.desc - 12 });
    let end = doc.y;
    if (detail) {
      doc.font('regular').fontSize(8.5).fillColor(MUTED).text(detail, cols.desc, end + 1, { width: cols.sac - cols.desc - 12 });
      end = doc.y;
    }
    doc.font('regular').fontSize(9.5).fillColor(INK).text(sac, cols.sac, y);
    doc.text(formatRupees(paise), cols.amount, y, { width: amountWidth, align: 'right' });
    y = end + 10;
  };
  const validity = [
    inv.validFrom && inv.validUntil ? `Valid ${istDate(inv.validFrom)} to ${istDate(inv.validUntil)}` : '',
    tax ? `Price ${formatRupees(listPaise)} including GST` : '',
  ].filter(Boolean).join(' · ');
  row('1', inv.description, validity, tax || inv.sacCode ? inv.sacCode : '', listTaxable);
  if (inv.discountPaise > 0) {
    row('', `Discount${inv.couponCode ? ` (code ${inv.couponCode})` : ''}`, tax ? `${formatRupees(inv.discountPaise)} off the price including GST` : '', '', -(listTaxable - inv.taxablePaise));
  }
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(LINE).stroke();
  y += 10;

  // ---------- Totals ----------
  const totalsX = left + width - 250;
  const half = Math.round(inv.gstRateBasisPoints / 2);
  const totals: [string, number][] = tax
    ? [
      ['Taxable value', inv.taxablePaise],
      ...(interState
        ? [[`IGST @ ${percent(inv.gstRateBasisPoints)}`, inv.igstPaise] as [string, number]]
        : [[`CGST @ ${percent(half)}`, inv.cgstPaise], [`SGST @ ${percent(inv.gstRateBasisPoints - half)}`, inv.sgstPaise]] as [string, number][]),
    ]
    : [];
  for (const [label, paise] of totals) {
    doc.font('regular').fontSize(9.5).fillColor(MUTED).text(label, totalsX, y, { width: 140 });
    doc.fillColor(INK).text(formatRupees(paise), cols.amount, y, { width: amountWidth, align: 'right' });
    y += 16;
  }
  doc.rect(totalsX - 8, y - 2, right - totalsX + 8, 24).fill(SHADE);
  doc.font('bold').fontSize(11).fillColor(INK).text(tax ? 'Total (incl. GST)' : 'Total', totalsX, y + 4, { width: 140 });
  doc.text(formatRupees(inv.totalPaise), cols.amount - 20, y + 4, { width: amountWidth + 20, align: 'right' });
  y += 34;

  doc.font('regular').fontSize(9).fillColor(MUTED).text('Amount in words', left, y);
  doc.font('bold').fontSize(10).fillColor(INK).text(rupeesInWords(inv.totalPaise), left, doc.y + 1, { width });
  y = doc.y + 14;

  const notes = [
    tax ? `Prices include GST. Tax is ${interState ? 'IGST (supply to another state)' : 'CGST and SGST (supply within the state)'}.` : 'GST not applicable: supplier not registered under GST.',
    tax ? 'Reverse charge: No.' : '',
  ].filter(Boolean);
  doc.font('regular').fontSize(9).fillColor(INK);
  for (const note of notes) {
    doc.text(note, left, y, { width });
    y = doc.y + 3;
  }

  // ---------- Footer ----------
  const footerY = doc.page.height - 48 - 30;
  doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.font('regular').fontSize(8.5).fillColor(MUTED)
    .text('This is a computer-generated invoice and needs no signature.', left, footerY + 8, { width, align: 'center', lineBreak: false });
  doc.end();
});
