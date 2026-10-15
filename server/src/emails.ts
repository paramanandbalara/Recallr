import { publicUrl } from './env.js';
import type { Email } from './mailer.js';
import { getSettings } from './settings.js';

// The emails Recallr sends. Plain, so they read well in every mail app.

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const minutes = (m: number) => (m >= 60 ? `${+(m / 60).toFixed(1)} hours` : `${Math.floor(m)} minutes`);
const date = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

// paragraphs: plain text; button: [label, path on the website]
const build = async (to: string, subject: string, name: string, paragraphs: string[], button?: [string, string]): Promise<Email> => {
  const { businessName, supportEmail } = await getSettings();
  const url = button ? `${publicUrl}${button[1]}` : '';
  const footer = `${businessName}${supportEmail ? ` · Questions? Reply to ${supportEmail}` : ''}`;
  const text = [`Hi ${name},`, ...paragraphs, ...(button ? [`${button[0]}: ${url}`] : []), '', footer].join('\n\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.55">
<p>Hi ${escape(name)},</p>
${paragraphs.map(p => `<p>${escape(p)}</p>`).join('\n')}
${button ? `<p style="margin:24px 0"><a href="${escape(url)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escape(button[0])}</a></p>` : ''}
<p style="color:#64748b;font-size:13px;margin-top:32px">${escape(footer)}</p></div>`;
  return { to, subject, text, html };
};

type To = { email: string; name: string };
const first = (name: string) => name.split(' ')[0] || name;

export const emails = {
  welcome: (u: To) => build(u.email, 'Welcome to Recallr', first(u.name), [
    'Your account is ready.',
    'Next: download the app and sign in with this email. Your free trial starts the first time you sign in on your computer.',
    'Try a mock interview first, so you know how Recallr works before a real one.',
  ], ['Download Recallr', '/download']),

  passwordReset: (u: To, token: string) => build(u.email, 'Reset your Recallr password', first(u.name), [
    'Someone (hopefully you) asked to reset the password of your Recallr account.',
    'The link works for 1 hour. If it wasn\'t you, ignore this email: your password stays the same.',
  ], ['Choose a new password', `/reset-password?token=${encodeURIComponent(token)}`]),

  paymentReceived: (u: To, planName: string, amountPaise: number, expiresAt: Date) => build(u.email, `Payment received: ${planName}`, first(u.name), [
    `We received ${rupees(amountPaise)} for ${planName}. It's active now, until ${date(expiresAt)}.`,
    'If the app is open, click "I\'ve paid, check again" or restart it.',
  ], ['See your plan', '/account']),

  offlineSubmitted: (u: To, planName: string, amountPaise: number, reference: string) => build(u.email, 'We got your payment details', first(u.name), [
    `Thanks. We'll check your payment of ${rupees(amountPaise)} for ${planName} (reference ${reference}) and confirm it, usually within a few hours.`,
    'You\'ll get an email as soon as your plan is active.',
  ], ['See your account', '/account']),

  offlineRejected: (u: To, planName: string, note: string) => build(u.email, 'We couldn\'t confirm your payment', first(u.name), [
    `We couldn't find your payment for ${planName}.${note ? ` Reason: ${note}` : ''}`,
    'If you did pay, reply with a screenshot of the payment and we\'ll sort it out.',
  ], ['See your account', '/account']),

  planEnding: (u: To, planName: string, expiresAt: Date) => build(u.email, `Your ${planName} ends soon`, first(u.name), [
    `Your ${planName} ends on ${date(expiresAt)}.`,
    'Have an interview coming up? Buy a top-up so you don\'t run out in the middle of it.',
  ], ['Buy a top-up', '/account/buy']),

  lowMinutes: (u: To, left: number) => build(u.email, 'Your listening time is almost used up', first(u.name), [
    `You have about ${minutes(left)} of listening left.`,
    'Top up before your next interview so it doesn\'t stop halfway.',
  ], ['Buy a top-up', '/account/buy']),

  referralReward: (u: To, friend: string, bonusMinutes: number) => build(u.email, 'You earned bonus listening time', first(u.name), [
    `${friend} joined Recallr with your invite and made their first payment, so you both get ${minutes(bonusMinutes)} of bonus listening time.`,
    'Invite more friends from your account page.',
  ], ['Invite friends', '/account/invite']),

  ticketReply: (u: To, subject: string) => build(u.email, `Re: ${subject}`, first(u.name), [
    `We replied to your support request "${subject}".`,
  ], ['Read the reply', '/account/support']),

  newTicketForAdmin: (to: string, from: string, subject: string, body: string) => build(to, `New support request: ${subject}`, 'there', [
    `${from} wrote:`, body.slice(0, 2000),
  ], ['Answer it', '/admin/support']),

  weeklyProgress: (u: To, s: { mockInterviews: number; score: number | null; previousScore: number | null; wordsPerMinute: number | null; fillersPerMinute: number | null; questionsSaved: number }, tip: string, offUrl: string) => {
    const lines: string[] = [];
    if (s.mockInterviews > 0) {
      const change = s.score !== null && s.previousScore !== null ? ` (${s.score >= s.previousScore ? 'up' : 'down'} from ${s.previousScore})` : '';
      lines.push(`This week you did ${s.mockInterviews} mock ${s.mockInterviews === 1 ? 'interview' : 'interviews'}${s.score !== null ? `, with an average score of ${s.score} out of 10${change}` : ''}.`);
      const speaking = [
        s.wordsPerMinute !== null ? `you spoke at about ${Math.round(s.wordsPerMinute)} words a minute` : '',
        s.fillersPerMinute !== null ? `with ${s.fillersPerMinute} filler words a minute` : '',
      ].filter(Boolean).join(', ');
      if (speaking) lines.push(`On average ${speaking}.`);
    } else {
      lines.push('No mock interviews this week.');
    }
    if (s.questionsSaved > 0) lines.push(`You answered ${s.questionsSaved} interview ${s.questionsSaved === 1 ? 'question' : 'questions'} with Recallr; they're saved under My questions.`);
    lines.push(`Tip for this week: ${tip}`);
    lines.push(`Don't want this weekly email? Turn it off with one click: ${offUrl}`);
    return build(u.email, s.mockInterviews > 0 ? 'Your week of interview practice' : 'One tip for your interview practice', first(u.name), lines, ['See your progress', '/account/progress']);
  },

  enquiryForAdmin: (to: string, e: { name: string; email: string; phone: string; organization: string; size: number | null; message: string }) =>
    build(to, `Plan enquiry: ${e.organization}`, 'there', [
      `${e.name} (${e.email}${e.phone ? `, ${e.phone}` : ''}) asked about a plan for ${e.organization}${e.size ? `, about ${e.size} students` : ''}.`,
      ...(e.message ? [e.message.slice(0, 2000)] : []),
    ], ['See enquiries', '/admin/organizations']),

  joinedOrganization: (u: To, organization: string, days: number) => build(u.email, `You joined ${organization} on Recallr`, first(u.name), [
    `${organization} gave you a Recallr pack for ${days} days. It's on your account now.`,
    'Download the app and sign in with this email to start practising. Your coach sees your mock interview scores, never your answers.',
  ], ['Download Recallr', '/download']),
};
