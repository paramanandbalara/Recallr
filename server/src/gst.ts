// Indian GST helpers for invoices: states with their GST codes, GSTIN checks, the tax split,
// the financial year, and amounts in words (lakh / crore).

// States and union territories with the 2-digit code GST uses (also the first 2 digits of a GSTIN)
export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
];

const simplify = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const ALIASES: Record<string, string> = { orissa: 'Odisha', pondicherry: 'Puducherry', newdelhi: 'Delhi', nctofdelhi: 'Delhi', uttaranchal: 'Uttarakhand', jandk: 'Jammu and Kashmir' };

// "rajasthan", "Rajasthan", "08" → { code: '08', name: 'Rajasthan' }; null when it isn't a state
export const findState = (value: string) => {
  const key = simplify(value);
  if (!key) return null;
  const alias = ALIASES[key];
  return INDIAN_STATES.find(s => s.code === key.padStart(2, '0') || simplify(s.name) === key || s.name === alias) ?? null;
};

// ---------- GSTIN ----------

const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The 15th character is a check digit over the first 14 (base 36, weights 1 and 2 in turn)
export const gstinCheckDigit = (first14: string) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
};

// '' when it's valid, otherwise what's wrong
export const gstinError = (gstin: string) => {
  if (!GSTIN_FORMAT.test(gstin)) return 'A GSTIN has 15 characters, like 08ABCDE1234F1Z5.';
  if (!INDIAN_STATES.some(s => s.code === gstin.slice(0, 2))) return 'The first two digits of this GSTIN are not a state code.';
  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) return 'This GSTIN has a typo: its last character doesn’t match.';
  return '';
};

export const stateOfGstin = (gstin: string) => INDIAN_STATES.find(s => s.code === gstin.slice(0, 2)) ?? null;

// ---------- Tax ----------

// Prices include GST: taxable value = total / (1 + rate), tax = the rest. In the seller's own state the tax is
// split into CGST and SGST (an odd paisa goes to SGST); to another state it is IGST.
export const splitGst = (totalPaise: number, rateBasisPoints: number, intraState: boolean) => {
  const taxablePaise = Math.round((totalPaise * 10_000) / (10_000 + rateBasisPoints));
  const tax = totalPaise - taxablePaise;
  if (!intraState) return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: tax };
  const cgstPaise = Math.floor(tax / 2);
  return { taxablePaise, cgstPaise, sgstPaise: tax - cgstPaise, igstPaise: 0 };
};

// ---------- Dates ----------

const IST_OFFSET_MS = 330 * 60 * 1000;

// The Indian financial year (April to March, India time), e.g. "2026-27"
export const financialYear = (date: Date) => {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

export const istDate = (date: Date) => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

// ---------- Money ----------

// 123456789 paise → "₹12,34,567.89"
export const formatRupees = (paise: number, symbol = '₹') => {
  const sign = paise < 0 ? '-' : '';
  return `${sign}${symbol}${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const belowHundred = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const belowThousand = (n: number) =>
  [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? belowHundred(n % 100) : ''].filter(Boolean).join(' ');

// Indian numbering: 1,23,45,678 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight"
export const numberInWords = (n: number): string => {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor((n % 100_000) / 1000);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n % 1000) parts.push(belowThousand(n % 1000));
  return parts.join(' ');
};

// 99950 → "Rupees Nine Hundred Ninety Nine and Fifty Paise Only"
export const rupeesInWords = (paise: number) => {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `Rupees ${numberInWords(rupees)}${rest ? ` and ${belowHundred(rest)} Paise` : ''} Only`;
};
