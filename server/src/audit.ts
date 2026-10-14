import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { db } from './db.js';

// Records what an admin did. Never fails the request it belongs to.
export const audit = async (req: Request, action: string, target?: string | null, details?: Prisma.InputJsonValue) => {
  try {
    await db.auditLog.create({ data: { actorId: req.user?.id, action, target: target ?? null, details } });
  } catch (error) {
    console.error('Could not write the audit log:', error);
  }
};
