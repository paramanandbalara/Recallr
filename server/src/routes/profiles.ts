import express, { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth.js';
import { db } from '../db.js';
import { HttpError, route } from '../http.js';
import { deleteProfileFiles, profileKey, profileSummary, readProfileData, resumeFileKey } from '../profiles.js';
import { encrypt } from '../settings.js';
import { objectStore, storageReady } from '../storage.js';

// Copies of the desktop app's profiles on the account (resume, job, company, notes, prepared answers, stories),
// sent by the app in the background whenever a profile changes. Encrypted with the server's key, in S3 when it's
// set up (Admin → Settings → Storage), otherwise in the database. The original resume file is kept in S3 only.
// Users can turn this off (PATCH /api/auth/me { profileSync: false }), which deletes the copies.

export const profileRoutes = Router();
profileRoutes.use(requireUser);

const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const LINK_SECONDS = 5 * 60;

const clientIdOf = (req: Request) => {
  const id = req.params.clientId;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new HttpError(400, 'That isn’t a profile id.');
  return id;
};

// The app stops sending when it gets this
const SYNC_OFF = () => new HttpError(409, 'Keeping profiles on your account is turned off.', 'PROFILE_SYNC_OFF');
const requireSyncOn = (req: Request, _res: Response, next: NextFunction) => {
  next(req.user!.profileSync ? undefined : SYNC_OFF());
};

// The app's Profile (desktop/src/services/storage.ts). Fields added later are kept as they are.
const profileInput = z.object({
  id: z.string(),
  name: z.string().max(500),
  cv: z.string().default(''),
  cvFileName: z.string().max(500).default(''),
  job: z.string().default(''),
  company: z.string().max(500).default(''),
  companyNotes: z.string().default(''),
  interviewer: z.string().default(''),
  knowledge: z.array(z.unknown()).default([]),
  language: z.string().max(20).default(''),
  answerLanguage: z.string().max(20).default(''),
  answers: z.array(z.object({ question: z.string(), answer: z.string() }).passthrough()).default([]),
  stories: z.array(z.object({ title: z.string() }).passthrough()).default([]),
}, { invalid_type_error: 'That isn’t a Recallr profile.', required_error: 'That isn’t a Recallr profile.' }).passthrough();

// The job ad's first line is usually the job title
const jobTitleOf = (job: string) => (job.split('\n').map(l => l.trim()).find(Boolean) ?? '').slice(0, 200);

profileRoutes.get('/', route(async (req, res) => {
  const profiles = await db.userProfile.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'asc' } });
  res.json({ userId: req.user!.id, profileSync: req.user!.profileSync, files: await storageReady(), profiles: profiles.map(profileSummary) });
}));

const findOwn = async (req: Request) => {
  const profile = await db.userProfile.findUnique({ where: { userId_clientId: { userId: req.user!.id, clientId: clientIdOf(req) } } });
  if (!profile) throw new HttpError(404, 'This profile isn’t on your account.', 'PROFILE_NOT_FOUND');
  return profile;
};

profileRoutes.get('/:clientId', route(async (req, res) => {
  const profile = await findOwn(req);
  res.json({ ...profileSummary(profile), profile: await readProfileData(profile) });
}));

profileRoutes.put('/:clientId', requireSyncOn, route(async (req, res) => {
  const userId = req.user!.id;
  const clientId = clientIdOf(req);
  const profile = profileInput.parse(req.body);
  if (profile.id !== clientId) throw new HttpError(400, 'The profile id doesn’t match.');
  const text = JSON.stringify(profile);
  const sizeBytes = Buffer.byteLength(text);
  if (sizeBytes > MAX_PROFILE_BYTES) throw new HttpError(413, 'This profile is too big to keep on the account (5 MB at most).', 'TOO_LARGE');

  const store = await objectStore();
  let stored: { storage: 'S3'; storageKey: string; data: null } | { storage: 'DATABASE'; storageKey: null; data: string };
  if (store) {
    const key = profileKey(userId, clientId);
    await store.put(key, encrypt(text), 'application/octet-stream');
    stored = { storage: 'S3', storageKey: key, data: null };
  } else {
    stored = { storage: 'DATABASE', storageKey: null, data: encrypt(text) };
  }
  const fields = {
    ...stored, sizeBytes,
    name: (profile.name.trim() || 'Untitled').slice(0, 120),
    company: profile.company.trim().slice(0, 200),
    jobTitle: jobTitleOf(profile.job),
    resumeFileName: profile.cvFileName.slice(0, 255),
    resumeChars: profile.cv.length,
    answersCount: profile.answers.length,
    storiesCount: profile.stories.length,
    deviceName: (req.device?.name ?? '').slice(0, 100),
  };
  const saved = await db.userProfile.upsert({
    where: { userId_clientId: { userId, clientId } }, create: { userId, clientId, ...fields }, update: fields,
  });
  res.json({ profile: profileSummary(saved) });
}));

profileRoutes.delete('/:clientId', route(async (req, res) => {
  const profile = await db.userProfile.findUnique({ where: { userId_clientId: { userId: req.user!.id, clientId: clientIdOf(req) } } });
  if (profile) {
    await deleteProfileFiles(profile, true); // If S3 fails, the app tries again later
    await db.userProfile.deleteMany({ where: { id: profile.id } });
  }
  res.json({ ok: true });
}));

// ---------- The original resume file ----------

const RESUME_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
} as const;

// What the file really is, from its first bytes (and its name, for Word and text files)
export const resumeFileType = (bytes: Buffer, fileName: string, declared: string) => {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const starts = (hex: string) => bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  if (starts('255044462d')) return RESUME_TYPES.pdf; // %PDF-
  if (starts('d0cf11e0a1b11ae1') && (ext === 'doc' || declared.startsWith('application/msword'))) return RESUME_TYPES.doc;
  if (starts('504b0304') && (ext === 'docx' || declared.includes('wordprocessingml'))) return RESUME_TYPES.docx;
  const textName = ['txt', 'md'].includes(ext) || declared.startsWith('text/plain') || declared.startsWith('text/markdown');
  if (textName && !bytes.includes(0)) return RESUME_TYPES.txt;
  return null;
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
const readFileBody = (req: Request, res: Response, next: NextFunction) => {
  const done = (error?: unknown) => {
    const e = error as { type?: string; code?: string } | undefined;
    if (e?.type === 'entity.too.large' || e?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'The resume file is too big (10 MB at most).', 'FILE_TOO_LARGE'));
    next(error);
  };
  if (req.is('multipart/form-data')) upload.single('file')(req, res, done);
  else express.raw({ type: () => true, limit: MAX_FILE_BYTES })(req, res, done);
};

// Ignored (204) while S3 isn't set up
const requireStorage = route(async (_req, res, next) => {
  if (await storageReady()) next();
  else res.status(204).end();
});

// Raw body (with X-File-Name) or multipart ("file"): PDF, Word or text, 10 MB at most
profileRoutes.put('/:clientId/resume-file', requireSyncOn, requireStorage, route(async (req, res, next) => {
  res.locals.profile = await findOwn(req); // The profile itself is sent first
  next();
}), readFileBody, route(async (req, res) => {
  const profile = res.locals.profile as Awaited<ReturnType<typeof findOwn>>;
  const bytes = req.file?.buffer ?? (Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  if (!bytes.length) throw new HttpError(400, 'The file is empty.');
  let fileName = req.file?.originalname ?? '';
  try {
    fileName ||= decodeURIComponent(req.get('X-File-Name') ?? '');
  } catch {
    // Not encoded: the type is then found from the content alone
  }
  const type = resumeFileType(bytes, fileName, req.file?.mimetype ?? req.get('Content-Type') ?? '');
  if (!type) throw new HttpError(415, 'Only PDF, Word (DOC, DOCX) and text resume files are kept.', 'UNSUPPORTED_FILE');
  const store = await objectStore();
  if (!store) return res.status(204).end();
  const key = resumeFileKey(req.user!.id, profile.clientId);
  await store.put(key, bytes, type);
  await db.userProfile.update({ where: { id: profile.id }, data: { resumeFileKey: key, resumeFileType: type } });
  res.status(204).end();
}));

// A short-lived download link for the user's own file
profileRoutes.get('/:clientId/resume-file', route(async (req, res) => {
  const profile = await findOwn(req);
  const store = await objectStore();
  if (!profile.resumeFileKey || !store) throw new HttpError(404, 'No resume file is kept for this profile.');
  res.json({ url: await store.signedUrl(profile.resumeFileKey, LINK_SECONDS, profile.resumeFileName || undefined), expiresIn: LINK_SECONDS });
}));

// ---------- Admin ----------

export const adminProfileRoutes = Router();
adminProfileRoutes.use(requireUser, requireAdmin);

const findForAdmin = async (req: Request) => {
  const profile = await db.userProfile.findFirst({ where: { id: req.params.profileId, userId: req.params.id }, include: { user: { select: { email: true } } } });
  if (!profile) throw new HttpError(404, 'Profile not found.');
  return profile;
};

adminProfileRoutes.get('/users/:id/profiles/:profileId', route(async (req, res) => {
  const profile = await findForAdmin(req);
  const data = await readProfileData(profile);
  await audit(req, 'profile.view', profile.user.email, { profile: profile.name });
  res.json({ ...profileSummary(profile), profile: data });
}));

adminProfileRoutes.get('/users/:id/profiles/:profileId/resume-file', route(async (req, res) => {
  const profile = await findForAdmin(req);
  const store = await objectStore();
  if (!profile.resumeFileKey) throw new HttpError(404, 'No resume file is kept for this profile.');
  if (!store) throw new HttpError(503, 'S3 isn’t set up any more, so the file can’t be downloaded.');
  const url = await store.signedUrl(profile.resumeFileKey, LINK_SECONDS, profile.resumeFileName || undefined);
  await audit(req, 'profile.resume_download', profile.user.email, { profile: profile.name, file: profile.resumeFileName });
  res.json({ url, expiresIn: LINK_SECONDS });
}));
