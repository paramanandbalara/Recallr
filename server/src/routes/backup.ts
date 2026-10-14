import express, { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { HttpError, route } from '../http.js';
import { decrypt, encrypt } from '../settings.js';

// One cloud backup per account of the desktop app's data (profiles, answers, history), encrypted at rest
export const backupRoutes = Router();
backupRoutes.use(requireUser);

const MAX_BYTES = 20 * 1024 * 1024;

backupRoutes.get('/', route(async (req, res) => {
  const backup = await db.backup.findUnique({ where: { userId: req.user!.id }, select: { sizeBytes: true, updatedAt: true, deviceName: true } });
  res.json({ backup });
}));

backupRoutes.get('/data', route(async (req, res) => {
  const backup = await db.backup.findUnique({ where: { userId: req.user!.id } });
  if (!backup) throw new HttpError(404, 'There’s no backup on your account yet.');
  res.type('application/json').send(decrypt(backup.data));
}));

// The body is the backup file's JSON, sent as text so it's stored exactly as made
backupRoutes.put('/', express.text({ type: '*/*', limit: MAX_BYTES }), route(async (req, res) => {
  const text = typeof req.body === 'string' ? req.body : '';
  try {
    JSON.parse(text);
  } catch {
    throw new HttpError(400, 'That isn’t a Recallr backup.');
  }
  const deviceName = z.string().max(100).default('').parse(req.device?.name ?? '');
  const data = { data: encrypt(text), sizeBytes: Buffer.byteLength(text), deviceName };
  const backup = await db.backup.upsert({
    where: { userId: req.user!.id }, create: { userId: req.user!.id, ...data }, update: data,
    select: { sizeBytes: true, updatedAt: true, deviceName: true },
  });
  res.json({ backup });
}));

backupRoutes.delete('/', route(async (req, res) => {
  await db.backup.deleteMany({ where: { userId: req.user!.id } });
  res.json({ ok: true });
}));
