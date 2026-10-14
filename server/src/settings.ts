import crypto from 'node:crypto';
import { db } from './db.js';
import { env } from './env.js';

// Settings kept in the database and changed in Admin → Settings. A value saved there wins; until then the
// matching environment variable is used (handy for the first start), then the default.

interface Definition {
  label: string;
  group: 'ai' | 'razorpay' | 'payments' | 'email' | 'accounts' | 'referrals' | 'app' | 'website';
  number?: boolean;        // Must be a whole number
  secret?: boolean;        // Encrypted in the database, never sent back in full
  public?: boolean;        // Shown on the website (/api/site)
  env?: keyof typeof env;  // Fallback until it's saved in the database
  default?: string;
  hint?: string;
}

export const SETTINGS = {
  groqApiKey: { label: 'Groq API key', group: 'ai', secret: true, env: 'GROQ_API_KEY', hint: 'console.groq.com/keys. Used first: the fastest.' },
  openaiApiKey: { label: 'OpenAI API key', group: 'ai', secret: true, env: 'OPENAI_API_KEY', hint: 'platform.openai.com/api-keys. Used when Groq fails, or alone.' },
  aiProviderOrder: { label: 'Provider order', group: 'ai', default: 'groq,openai', hint: '"groq,openai" or "openai,groq": who answers first.' },
  razorpayKeyId: { label: 'Key ID', group: 'razorpay', env: 'RAZORPAY_KEY_ID', hint: 'rzp_live_... (or rzp_test_... to try it out)' },
  razorpayKeySecret: { label: 'Key secret', group: 'razorpay', secret: true, env: 'RAZORPAY_KEY_SECRET' },
  razorpayWebhookSecret: { label: 'Webhook secret', group: 'razorpay', secret: true, env: 'RAZORPAY_WEBHOOK_SECRET', hint: 'The secret you typed when adding the webhook.' },
  offlinePaymentInfo: { label: 'Offline payment details', group: 'payments', public: true, env: 'OFFLINE_PAYMENT_INFO', hint: 'Shown to users paying by UPI or bank transfer.' },
  smtpHost: { label: 'SMTP server', group: 'email', hint: 'e.g. email-smtp.ap-south-1.amazonaws.com (Amazon SES), smtp.gmail.com, smtp.zoho.in' },
  smtpPort: { label: 'SMTP port', group: 'email', number: true, default: '587', hint: '587 (STARTTLS) or 465 (SSL)' },
  smtpUser: { label: 'SMTP username', group: 'email' },
  smtpPassword: { label: 'SMTP password', group: 'email', secret: true },
  emailFrom: { label: 'Send emails from', group: 'email', hint: 'e.g. Recallr <hello@your-domain.com>. Must be allowed by your email provider.' },
  maxDevices: { label: 'Computers per account', group: 'accounts', number: true, default: '2', hint: 'How many computers one account can be signed in on at the same time.' },
  lowMinutesWarning: { label: 'Low listening warning (minutes)', group: 'accounts', number: true, default: '15', hint: 'Warn in the app, and by email, when less than this is left.' },
  referralBonusMinutes: { label: 'Bonus listening (minutes)', group: 'referrals', number: true, default: '30', hint: 'Given to both people when an invited friend makes their first payment. 0 turns referrals off.' },
  referralBonusTokens: { label: 'Bonus AI tokens', group: 'referrals', number: true, default: '100000' },
  referralBonusDays: { label: 'Bonus valid for (days)', group: 'referrals', number: true, default: '30' },
  latestAppVersion: { label: 'Latest app version', group: 'app', public: true, hint: 'e.g. 1.2.0. Older apps offer it in a popup (Update / Remind me later), never while listening.' },
  minimumAppVersion: { label: 'Minimum app version', group: 'app', public: true, hint: 'Older apps must update before they can be used. Leave empty to allow all.' },
  releaseNotes: { label: "What's new", group: 'app', public: true, hint: 'Shown with the update message.' },
  businessName: { label: 'Business name', group: 'website', public: true, default: 'Recallr' },
  supportEmail: { label: 'Support email', group: 'website', public: true, default: '' },
  downloadUrlWindows: { label: 'Windows download link', group: 'website', public: true, default: '' },
  downloadUrlMac: { label: 'macOS download link', group: 'website', public: true, default: '' },
} satisfies Record<string, Definition>;

export type SettingKey = keyof typeof SETTINGS;
export type Settings = Record<SettingKey, string>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
const definition = (key: SettingKey): Definition => SETTINGS[key];

// ---------- Encryption ----------

const KEY = crypto.createHash('sha256').update(env.ENCRYPTION_KEY ?? env.JWT_SECRET).digest();

export const encrypt = (plain: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
};

export const decrypt = (stored: string) => {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !data) throw new Error('Unknown format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

// ---------- Reading ----------
// Cached briefly, so every AI request doesn't hit the database. Saving clears the cache on this server;
// other servers pick the change up within CACHE_MS.

const CACHE_MS = 30_000;
let cache: { at: number; stored: Partial<Settings> } | null = null;
let loading: Promise<Partial<Settings>> | null = null;

const loadStored = async (): Promise<Partial<Settings>> => {
  const rows = await db.setting.findMany();
  const stored: Partial<Settings> = {};
  for (const row of rows) {
    const key = row.key as SettingKey;
    if (!(key in SETTINGS)) continue;
    try {
      stored[key] = definition(key).secret ? decrypt(row.value) : row.value;
    } catch {
      console.error(`Setting "${key}" can't be decrypted (was ENCRYPTION_KEY changed?). Save it again in Admin → Settings.`);
    }
  }
  return stored;
};

const stored = async () => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.stored;
  loading ??= loadStored().finally(() => { loading = null; });
  const values = await loading;
  cache = { at: Date.now(), stored: values };
  return values;
};

export const clearSettingsCache = () => { cache = null; };

// Where each value comes from, for the admin panel
export type Source = 'database' | 'environment' | 'default' | 'unset';

export const getSettingsWithSource = async () => {
  const saved = await stored();
  const values = {} as Settings;
  const sources = {} as Record<SettingKey, Source>;
  for (const key of SETTING_KEYS) {
    const def = definition(key);
    const fromEnv = def.env ? (env[def.env] as string | undefined) : undefined;
    if (saved[key] !== undefined) [values[key], sources[key]] = [saved[key]!, 'database'];
    else if (fromEnv) [values[key], sources[key]] = [fromEnv, 'environment'];
    else [values[key], sources[key]] = [def.default ?? '', def.default ? 'default' : 'unset'];
  }
  return { values, sources };
};

export const getSettings = async () => (await getSettingsWithSource()).values;

export const publicSettings = async () => {
  const values = await getSettings();
  return Object.fromEntries(SETTING_KEYS.filter(k => definition(k).public).map(k => [k, values[k]]));
};

// ---------- Writing ----------

// `changes`: a value to save, or null to remove the saved one (back to the environment/default)
export const saveSettings = async (changes: Partial<Record<SettingKey, string | null>>, adminId: string) => {
  await db.$transaction(Object.entries(changes).map(([key, value]) => {
    const k = key as SettingKey;
    if (value === null) return db.setting.deleteMany({ where: { key: k } });
    const stored = definition(k).secret ? encrypt(value!) : value!;
    return db.setting.upsert({ where: { key: k }, create: { key: k, value: stored, updatedById: adminId }, update: { value: stored, updatedById: adminId } });
  }));
  clearSettingsCache();
};

// What the admin panel shows: secrets as "••••last4"
export const mask = (value: string) => (value ? `••••${value.slice(-4)}` : '');

export const settingsForAdmin = async () => {
  const { values, sources } = await getSettingsWithSource();
  return SETTING_KEYS.map(key => {
    const def = definition(key);
    return {
      key, label: def.label, group: def.group, hint: def.hint ?? '', secret: !!def.secret, source: sources[key],
      value: def.secret ? mask(values[key]) : values[key],
    };
  });
};

// A whole-number setting (falls back to its default if it was saved as something else)
export const numberSetting = (settings: Settings, key: SettingKey) => {
  const value = Number.parseInt(settings[key], 10);
  return Number.isFinite(value) ? value : Number.parseInt(definition(key).default ?? '0', 10);
};

export const isNumberSetting = (key: SettingKey) => !!definition(key).number;
