import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Device, User } from '@prisma/client';
import { db } from './db.js';
import { env } from './env.js';
import { HttpError } from './http.js';

const TOKEN_DAYS = 30;
const SEEN_EVERY_MS = 5 * 60 * 1000; // Update lastSeenAt at most this often

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Tokens for the desktop app carry its device ("did"): removing the device signs that computer out
export const signToken = (user: Pick<User, 'id' | 'role'>, deviceId?: string) =>
  jwt.sign({ sub: user.id, role: user.role, ...(deviceId ? { did: deviceId } : {}) }, env.JWT_SECRET, { expiresIn: `${TOKEN_DAYS}d` });

export const publicUser = (user: User) => ({
  id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, createdAt: user.createdAt,
  saveAnswers: user.saveAnswers, weeklyEmail: user.weeklyEmail,
});

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    device?: Device; // Set for the desktop app's requests
  }
}

// The user is loaded on every request, so blocking someone takes effect immediately
export const requireUser = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Please sign in.');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, 'Your session has ended. Please sign in again.');
    }
    const userId = String(payload.sub);
    // Both lookups at once, and the "last seen" times are written without waiting: answers start sooner
    const [user, device] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      payload.did ? db.device.findUnique({ where: { id: String(payload.did) } }) : null,
    ]);
    if (!user) throw new HttpError(401, 'Please sign in.');
    if (user.status === 'BLOCKED') throw new HttpError(403, 'Your access has been turned off.', 'BLOCKED');
    const later = (write: Promise<unknown>) => { write.catch(error => console.error('Could not save last seen:', error)); };
    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > SEEN_EVERY_MS) {
      later(db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }));
    }
    if (payload.did) {
      if (!device || device.userId !== user.id || device.revokedAt) {
        throw new HttpError(401, 'This computer was signed out from your account. Sign in again.', 'DEVICE_REMOVED');
      }
      if (Date.now() - device.lastSeenAt.getTime() > SEEN_EVERY_MS) {
        later(db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }));
      }
      req.device = device;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  next(req.user?.role === 'ADMIN' ? undefined : new HttpError(403, 'Admins only.'));
};

// The AI is only for the desktop app (signed in on a counted device), so one account can't be shared beyond its device limit
export const requireDevice = (req: Request, _res: Response, next: NextFunction) => {
  next(req.device ? undefined : new HttpError(403, 'Please sign in again in the Recallr app to keep using it.', 'APP_ONLY'));
};
