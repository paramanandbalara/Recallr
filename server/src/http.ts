import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

// An error with an HTTP status and a message the user can see
export class HttpError extends Error {
  details?: Record<string, unknown>; // Extra data for the app, e.g. the devices signed in
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

// Wraps async route handlers so thrown errors reach the error handler
export const route = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  if (res.headersSent) return;
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
  if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid request' });
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Try again in a moment.' });
};
