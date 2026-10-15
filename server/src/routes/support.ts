import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { db } from '../db.js';
import { emails } from '../emails.js';
import { HttpError, route } from '../http.js';
import { queueEmail } from '../mailer.js';
import { getSettings } from '../settings.js';

// Users' support requests and the conversation with the admin
export const supportRoutes = Router();
supportRoutes.use(requireUser);

const body = z.string().trim().min(1, 'Write a message.').max(10_000);

const notifyAdmin = async (from: string, subject: string, text: string) => {
  const { supportEmail } = await getSettings();
  if (supportEmail) queueEmail(await emails.newTicketForAdmin(supportEmail, from, subject, text), 'ticket_admin');
};

supportRoutes.get('/', route(async (req, res) => {
  const tickets = await db.ticket.findMany({
    where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  });
  res.json({ tickets });
}));

supportRoutes.post('/', route(async (req, res) => {
  const input = z.object({ subject: z.string().trim().min(3, 'Add a short subject.').max(200), body }).parse(req.body);
  const ticket = await db.ticket.create({
    data: { userId: req.user!.id, subject: input.subject, messages: { create: { authorId: req.user!.id, fromAdmin: false, body: input.body } } },
  });
  await notifyAdmin(req.user!.email, input.subject, input.body);
  res.status(201).json({ ticket });
}));

const ownTicket = async (id: string, userId: string) => {
  const ticket = await db.ticket.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, fromAdmin: true, body: true, createdAt: true } } },
  });
  if (!ticket) throw new HttpError(404, 'Request not found.');
  return ticket;
};

supportRoutes.get('/:id', route(async (req, res) => {
  res.json({ ticket: await ownTicket(req.params.id, req.user!.id) });
}));

// A reply from the user reopens the request
supportRoutes.post('/:id/messages', route(async (req, res) => {
  const ticket = await ownTicket(req.params.id, req.user!.id);
  const text = body.parse(req.body.body);
  await db.ticket.update({
    where: { id: ticket.id },
    data: { status: 'OPEN', messages: { create: { authorId: req.user!.id, fromAdmin: false, body: text } } },
  });
  await notifyAdmin(req.user!.email, ticket.subject, text);
  res.status(201).json({ ticket: await ownTicket(ticket.id, req.user!.id) });
}));

supportRoutes.post('/:id/close', route(async (req, res) => {
  const ticket = await ownTicket(req.params.id, req.user!.id);
  await db.ticket.update({ where: { id: ticket.id }, data: { status: 'CLOSED' } });
  res.json({ ok: true });
}));
