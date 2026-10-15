import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import { HttpError } from './http.js';
import { grantTrialIfNew } from './fulfil.js';
import { getSettings, numberSetting } from './settings.js';

// What the desktop app sends when it signs in
export const deviceInput = z.object({
  fingerprint: z.string().min(16).max(200),
  name: z.string().trim().max(100).default('Computer'),
  platform: z.string().max(30).default(''),
  appVersion: z.string().max(30).default(''),
});
export type DeviceInput = z.infer<typeof deviceInput>;

// Never store the app's raw value
const hashFingerprint = (fingerprint: string) => crypto.createHash('sha256').update(`recallr:${fingerprint}`).digest('hex');

export const activeDevices = (userId: string) =>
  db.device.findMany({ where: { userId, revokedAt: null }, orderBy: { lastSeenAt: 'desc' } });

export const publicDevice = (d: { id: string; name: string; platform: string; appVersion: string; createdAt: Date; lastSeenAt: Date }) => ({
  id: d.id, name: d.name, platform: d.platform, appVersion: d.appVersion, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt,
});

// Signs a computer in: within the account's limit, then the free trial if this computer never had one
export const signInDevice = async (userId: string, input: DeviceInput) => {
  const fingerprint = hashFingerprint(input.fingerprint);
  const existing = await db.device.findUnique({ where: { userId_fingerprint: { userId, fingerprint } } });
  if (!existing || existing.revokedAt) {
    const max = numberSetting(await getSettings(), 'maxDevices');
    const active = await activeDevices(userId);
    if (max > 0 && active.length >= max) {
      throw Object.assign(new HttpError(409,
        `Your account is already signed in on ${active.length} ${active.length === 1 ? 'computer' : 'computers'}, the most allowed. Remove one on the website (Account → Devices), then sign in again.`,
        'DEVICE_LIMIT'), { details: { devices: active.map(publicDevice) } });
    }
  }
  const data = { name: input.name || 'Computer', platform: input.platform, appVersion: input.appVersion, lastSeenAt: new Date(), revokedAt: null };
  const device = existing
    ? await db.device.update({ where: { id: existing.id }, data })
    : await db.device.create({ data: { userId, fingerprint, ...data } });
  const trial = await grantTrialIfNew(userId, fingerprint);
  return { device, trial };
};
