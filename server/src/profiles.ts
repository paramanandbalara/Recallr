import type { UserProfile } from '@prisma/client';
import { db } from './db.js';
import { decrypt } from './settings.js';
import { objectStore } from './storage.js';

// The copies of users' profiles (resume, job, company, notes, prepared answers, stories) that the desktop app
// keeps on the account. See routes/profiles.ts.

export const profileKey = (userId: string, clientId: string) => `profiles/${userId}/${clientId}/profile.json.enc`;
export const resumeFileKey = (userId: string, clientId: string) => `profiles/${userId}/${clientId}/resume`;

// What lists show: no profile content
export const profileSummary = (p: UserProfile) => ({
  id: p.id, clientId: p.clientId, name: p.name, company: p.company, jobTitle: p.jobTitle,
  resumeFileName: p.resumeFileName, resumeChars: p.resumeChars, answersCount: p.answersCount, storiesCount: p.storiesCount,
  storage: p.storage, sizeBytes: p.sizeBytes, hasResumeFile: !!p.resumeFileKey, resumeFileType: p.resumeFileType,
  deviceName: p.deviceName, createdAt: p.createdAt, updatedAt: p.updatedAt,
});

// The profile as the app sent it
export const readProfileData = async (p: UserProfile): Promise<unknown> => {
  if (p.storage === 'S3') {
    if (!p.storageKey) return null;
    const store = await objectStore();
    if (!store) throw new Error('S3 is no longer set up, so this profile can’t be read.');
    return JSON.parse(decrypt((await store.get(p.storageKey)).toString('utf8')));
  }
  return p.data ? JSON.parse(decrypt(p.data)) : null;
};

// Removes a profile's files from S3; a file that can't be removed is logged (and the error passed on if `strict`)
export const deleteProfileFiles = async (p: Pick<UserProfile, 'storageKey' | 'resumeFileKey'>, strict = false) => {
  const keys = [p.storageKey, p.resumeFileKey].filter((k): k is string => !!k);
  if (!keys.length) return;
  const store = await objectStore();
  if (!store) {
    console.error(`Profile files left in S3 (S3 is no longer set up): ${keys.join(', ')}`);
    return;
  }
  for (const key of keys) {
    try {
      await store.delete(key);
    } catch (error) {
      console.error(`Could not delete ${key} from S3:`, error);
      if (strict) throw error;
    }
  }
};

// All of a user's profiles and files: when they turn keeping profiles off, or close their account
export const deleteUserProfiles = async (userId: string) => {
  const profiles = await db.userProfile.findMany({ where: { userId }, select: { storageKey: true, resumeFileKey: true } });
  for (const p of profiles) await deleteProfileFiles(p);
  await db.userProfile.deleteMany({ where: { userId } });
};

// Everything kept, for "Download my data"
export const exportProfiles = async (userId: string) => {
  const rows = await db.userProfile.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return Promise.all(rows.map(async p => {
    let profile: unknown = null;
    try {
      profile = await readProfileData(p);
    } catch (error) {
      console.error(`Could not read profile ${p.id} for the export:`, error);
    }
    return {
      name: p.name, company: p.company, jobTitle: p.jobTitle, resumeFileName: p.resumeFileName, resumeFileKept: !!p.resumeFileKey,
      deviceName: p.deviceName, createdAt: p.createdAt, updatedAt: p.updatedAt, profile,
    };
  }));
};
