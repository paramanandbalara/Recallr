import React from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../api';

// Starting points for the pages Razorpay asks for before it activates an account.
// Have them checked for your business before going live.

type Page = 'terms' | 'privacy' | 'refunds' | 'contact';

const Email = () => (SITE.supportEmail
  ? <a href={`mailto:${SITE.supportEmail}`} className="text-blue-400">{SITE.supportEmail}</a>
  : <Link to="/contact" className="text-blue-400">our contact page</Link>);

// A function so the business name from the settings is used
const content = (): Record<Page, { title: string; body: React.ReactNode }> => ({
  terms: {
    title: 'Terms of service',
    body: (
      <>
        <p>These terms apply to the Recallr website and desktop app, provided by {SITE.businessName}. By creating an account you agree to them.</p>
        <h2>Your account</h2>
        <p>Keep your password private. One account is for one person; sharing an account is not allowed. We may suspend accounts that are shared, abused or used against these terms.</p>
        <h2>Plans and payment</h2>
        <p>Plans are one-time packs of listening time and AI answers, valid for the number of days shown when you buy them. Prices are in Indian rupees and include applicable taxes unless stated otherwise. Online payments are processed by Razorpay. Offline payments become active once we confirm them.</p>
        <h2>Free trial</h2>
        <p>Each person may use one free trial. We may change or end the trial offer at any time.</p>
        <h2>Fair use</h2>
        <p>Use Recallr lawfully, and follow the rules of the interviews and platforms you use it with. You are responsible for how you use the suggestions.</p>
        <h2>The software</h2>
        <p>Recallr is provided as is. We work to keep it available and accurate, but AI suggestions can be wrong and the service can be interrupted. You may not copy, resell, or redistribute the app, or get around its sign-in or limits.</p>
        <h2>Changes</h2>
        <p>We may update these terms; we’ll show the date of the latest version on this page. Questions: <Email />.</p>
      </>
    ),
  },
  privacy: {
    title: 'Privacy policy',
    body: (
      <>
        <h2>What we keep</h2>
        <p>Your name, email, a hash of your password (never the password itself), your plans and payments, and how much listening time and AI you used (amounts and dates, not content).</p>
        <h2>What stays on your computer</h2>
        <p>Your resume, job details, prepared answers, notes and conversation history are stored only on your own computer.</p>
        <h2>What is processed but not kept</h2>
        <p>To make an answer, the audio of the question and the text needed for the answer are sent through our server to our AI providers (Groq and OpenAI). We don’t store it. The providers process it under their own policies.</p>
        <h2>Payments</h2>
        <p>Card, UPI and bank details are handled by Razorpay; we never see or store them.</p>
        <h2>Your choices</h2>
        <p>To get a copy of your account data or have your account deleted, email <Email />.</p>
      </>
    ),
  },
  refunds: {
    title: 'Refund and cancellation policy',
    body: (
      <>
        <p>Plans are one-time purchases, so there is nothing to cancel: a plan simply ends when its days are over.</p>
        <h2>Refunds</h2>
        <p>If you bought a plan and haven’t used any of it, you can ask for a full refund within 7 days of buying. If a technical problem on our side stopped you from using what you paid for, contact us and we’ll make it right with extra time or a refund.</p>
        <p>Used plans and free trials can’t be refunded.</p>
        <h2>How</h2>
        <p>Email <Email /> with your account email and payment reference. Approved refunds go back to the original payment method within 5–7 working days.</p>
      </>
    ),
  },
  contact: {
    title: 'Contact us',
    body: (
      <>
        <p>Questions about your account, a payment, or how to use Recallr? {SITE.supportEmail ? <>Email <Email />.</> : 'Contact us through the email you were given when you signed up.'} We usually reply within one working day.</p>
        <p>For payment questions, please include your account email and the payment or UPI reference.</p>
        <p>Many answers are already in the <Link to="/guide" className="text-blue-400">guide</Link>.</p>
      </>
    ),
  },
});

export const Legal: React.FC<{ page: Page }> = ({ page }) => {
  const CONTENT = content();
  return (
  <article className="legal mx-auto max-w-3xl px-4 py-16">
    <h1 className="text-4xl font-bold text-white">{CONTENT[page].title}</h1>
    <div className="mt-6 space-y-3 leading-relaxed text-slate-300 [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-100">
      {CONTENT[page].body}
    </div>
  </article>
  );
};
