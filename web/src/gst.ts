// Indian states and union territories (with their GST codes) and the GSTIN check, the same as the server's gst.ts

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

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// '' when valid, otherwise what's wrong
export const gstinError = (gstin: string) => {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return 'A GSTIN has 15 characters, like 08ABCDE1234F1Z5.';
  if (!INDIAN_STATES.some(s => s.code === gstin.slice(0, 2))) return 'The first two digits of this GSTIN are not a state code.';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  if (CHARS[(36 - (sum % 36)) % 36] !== gstin[14]) return 'This GSTIN has a typo: its last character doesn’t match.';
  return '';
};

export const stateOfGstin = (gstin: string) => INDIAN_STATES.find(s => s.code === gstin.slice(0, 2)) ?? null;

export interface Invoice {
  id: string;
  number: string;
  kind: 'TAX_INVOICE' | 'BILL';
  financialYear: string;
  issuedAt: string;
  emailedAt: string | null;
  description: string;
  buyerName: string;
  buyerEmail: string;
  buyerState: string;
  buyerGstin: string;
  totalPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  paymentId: string;
  userId: string;
}

export const invoiceFilename = (number: string) => `invoice-${number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
