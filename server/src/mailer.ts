import nodemailer, { type Transporter } from 'nodemailer';
import { db } from './db.js';
import { getSettings, numberSetting } from './settings.js';

// Sends email through the SMTP server set in Admin → Settings → Email. Until it's set up, emails are only
// logged (status SKIPPED), so nothing else breaks. Every email is recorded in EmailLog.

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// In tests, emails are collected here instead of being sent
export const testOutbox: (Email & { kind: string })[] = [];

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
  return { transport: current.transport, from: s.emailFrom || s.smtpUser, businessName: s.businessName };
};

export const emailReady = async () => !!(await transport()).transport;

// Sends and logs. Never throws: a failed email must not fail what the user was doing.
export const sendEmail = async (email: Email, kind: string, userId?: string | null) => {
  let status: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
  let error: string | undefined;
  try {
    if (process.env.VITEST) {
      testOutbox.push({ ...email, kind });
    } else {
      const { transport: smtp, from } = await transport();
      if (smtp) {
        await smtp.sendMail({ from, to: email.to, subject: email.subject, text: email.text, html: email.html });
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

// Fire and forget, for emails sent after a request has its answer
export const queueEmail = (email: Email, kind: string, userId?: string | null) => {
  void sendEmail(email, kind, userId);
};

// For the admin's "Send a test email" button: throws with the SMTP error so it can be shown
export const sendTestEmail = async (to: string) => {
  const { transport: smtp, from } = await transport();
  if (!smtp) throw new Error('Set the SMTP server first.');
  await smtp.verify();
  await smtp.sendMail({ from, to, subject: 'Recallr test email', text: 'Email from Recallr works.' });
};
