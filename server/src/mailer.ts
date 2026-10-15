import nodemailer, { type Transporter } from 'nodemailer';
import { db } from './db.js';
import { getSettings, numberSetting } from './settings.js';

// Sends email through the SMTP server set in Admin → Settings → Email. Until it's set up, emails are only
// logged (status SKIPPED), so nothing else breaks. Every email is recorded in EmailLog.

// A file sent with the email. Large ones (e.g. invoice PDFs) are made with `render` just before sending,
// so nothing big is kept in memory or in the database while it waits.
export interface EmailAttachment {
  filename: string;
  contentType?: string;
  content?: Buffer;
  render?: () => Promise<Buffer>;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

// In tests, emails are collected here instead of being sent (attachments already made)
export const testOutbox: (Email & { kind: string; files: { filename: string; contentType?: string; content: Buffer }[] })[] = [];

const makeAttachments = (email: Email) =>
  Promise.all((email.attachments ?? []).map(async a => ({ filename: a.filename, contentType: a.contentType, content: a.content ?? await a.render!() })));

let current: { signature: string; transport: Transporter | null } | null = null;

const transport = async () => {
  const s = await getSettings();
  const signature = [s.smtpHost, s.smtpPort, s.smtpUser, s.smtpPassword].join('|');
  if (current?.signature !== signature) {
    const port = numberSetting(s, 'smtpPort');
    current = {
      signature,
      transport: s.smtpHost
        ? nodemailer.createTransport({ host: s.smtpHost, port, secure: port === 465, auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPassword } : undefined })
        : null,
    };
  }
  const from = s.emailFrom || s.smtpUser;
  // Replies reach the support inbox even when emails are sent from a no-reply address
  const replyTo = s.supportEmail && !from.includes(s.supportEmail) ? s.supportEmail : undefined;
  return { transport: current.transport, from, replyTo, businessName: s.businessName };
};

export const emailReady = async () => !!(await transport()).transport;

// Sends and logs. Never throws: a failed email must not fail what the user was doing.
export const sendEmail = async (email: Email, kind: string, userId?: string | null) => {
  let status: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
  let error: string | undefined;
  try {
    const files = await makeAttachments(email);
    if (process.env.VITEST) {
      testOutbox.push({ ...email, kind, files });
      status = 'SENT';
    } else {
      const { transport: smtp, from, replyTo } = await transport();
      if (smtp) {
        await smtp.sendMail({ from, replyTo, to: email.to, subject: email.subject, text: email.text, html: email.html, attachments: files });
        status = 'SENT';
      } else {
        console.log(`[email not set up] ${kind} → ${email.to}: ${email.subject}`);
      }
    }
  } catch (err) {
    status = 'FAILED';
    error = err instanceof Error ? err.message : String(err);
    console.error(`Email "${kind}" to ${email.to} failed:`, error);
  }
  await db.emailLog.create({ data: { userId: userId ?? null, to: email.to, kind, subject: email.subject, status, error } }).catch(() => {});
  return status;
};

// Fire and forget, for emails sent after a request has its answer. Tests wait for them with emailsSent().
const pending = new Set<Promise<unknown>>();
export const queueEmail = (email: Email, kind: string, userId?: string | null) => { void track(sendEmail(email, kind, userId)); };
export const track = <T>(work: Promise<T>) => {
  pending.add(work);
  void work.finally(() => pending.delete(work)).catch(() => {});
  return work;
};
export const emailsSent = async () => { while (pending.size) await Promise.allSettled([...pending]); };

// For the admin's "Send a test email" button: throws with the SMTP error so it can be shown
export const sendTestEmail = async (to: string) => {
  const { transport: smtp, from } = await transport();
  if (!smtp) throw new Error('Set the SMTP server first.');
  await smtp.verify();
  await smtp.sendMail({ from, to, subject: 'Recallr test email', text: 'Email from Recallr works.' });
};
