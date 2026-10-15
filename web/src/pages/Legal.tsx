import React from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../api';

// Starting points for the pages Razorpay asks for before it activates an account.
// Have them checked for your business before going live.

type Page = 'terms' | 'privacy' | 'refunds' | 'contact';

const Email = () => (SITE.supportEmail
  ? <a href={`mailto:${SITE.supportEmail}`} className="text-blue-400">{SITE.supportEmail}</a>
  : <Link to="/contact" className="text-blue-400">our contact page</Link>);

const UPDATED = '15 October 2026';

// A function so the business name and support email from the settings are used.
// Written for an independent business (a sole proprietorship in India), to match what Recallr actually does.
// Check it again whenever a feature that keeps or shares data is added.
const content = (): Record<Page, { title: string; updated?: string; body: React.ReactNode }> => ({
  terms: {
    title: 'Terms of service',
    updated: UPDATED,
    body: (
      <>
        <p>These terms apply to the Recallr website and desktop app, provided by {SITE.businessName}, an independent business run from India. By creating an account you agree to them and to our <Link to="/privacy" className="text-blue-400">privacy policy</Link>.</p>
        <h2>Who can use Recallr</h2>
        <p>You must be 18 or older to create an account.</p>
        <h2>Your account</h2>
        <p>Keep your password private. One account is for one person; sharing an account is not allowed. We may suspend accounts that are shared, abused or used against these terms.</p>
        <h2>Plans and payment</h2>
        <p>Plans are one-time packs of listening time and AI answers, valid for the number of days shown when you buy them. Prices are in Indian rupees and include applicable taxes unless stated otherwise. Online payments are processed by Razorpay. Offline payments become active once we confirm them. Refunds follow our <Link to="/refunds" className="text-blue-400">refund policy</Link>.</p>
        <h2>Free trial</h2>
        <p>Each person may use one free trial. We may change or end the trial offer at any time.</p>
        <h2>Invites and college ambassadors</h2>
        <p>When a friend signs up with your invite link and makes their first payment, you both get the bonus shown on your Invite friends page. Approved college ambassadors get the ambassador bonus shown there instead. Bonuses are listening time on your account, not money, and can’t be exchanged for cash. Don’t spam, don’t make claims about Recallr that aren’t true, and say that you get a bonus when you share your link. We may change or end these programmes, and remove bonuses gained by fake accounts or abuse.</p>
        <h2>Fair use</h2>
        <p>Use Recallr lawfully, and follow the rules of the interviews and platforms you use it with. You are responsible for how you use the suggestions, and for having the right to the content you add (such as your resume and notes).</p>
        <h2>The software</h2>
        <p>Recallr is provided as is. We work to keep it available and accurate, but AI suggestions can be wrong and the service can be interrupted. You may not copy, resell, or redistribute the app, or get around its sign-in or limits. To the extent the law allows, our total liability to you is limited to the amount you paid us in the 3 months before the claim.</p>
        <h2>Law</h2>
        <p>These terms are governed by the laws of India.</p>
        <h2>Changes</h2>
        <p>We may update these terms; the date of the latest version is shown at the top. Questions: <Email />.</p>
      </>
    ),
  },
  privacy: {
    title: 'Privacy policy',
    updated: UPDATED,
    body: (
      <>
        <p>{SITE.businessName} (“we”) is an independent business run by an individual in India. This policy explains, in plain words, what the Recallr website and desktop app keep about you, why, who else handles it, and what you can do about it. It is written to follow India’s Digital Personal Data Protection Act, 2023.</p>

        <h2>Your account</h2>
        <ul>
          <li>Your name, email address and a hash of your password (never the password itself).</li>
          <li>The computers you sign in on: their name, system, app version and an identifier made from the computer (a one-way hash), so we can apply the free trial once per computer and the limit on computers per account.</li>
          <li>Your plans, payments, invoices and the billing details you enter for them (name, address, state, GSTIN).</li>
          <li>How much listening time and AI you used: amounts, dates, which AI service answered and how fast. Not what was said.</li>
          <li>Who invited you, and who you invited (see “Invites and the leaderboard” below).</li>
          <li>Your support requests and our replies, and a record of the emails we sent you (address, subject and date).</li>
        </ul>

        <h2>Payments</h2>
        <p>Online payments are handled by Razorpay. Your card, UPI or bank details go straight to Razorpay; we never see or store them. We receive the payment’s ID, amount and status. For offline payments we keep the reference you give us.</p>

        <h2>The copy of your profiles</h2>
        <p>Your profiles (resume text, the job description, company and company notes, interviewer, notes and documents, prepared answers and stories) are stored in the app on your computer. While “Keep a copy of my profiles in my Recallr account” is on, and it is on by default, the app also sends a copy to our server in the background. We use it to restore your profiles (for example on a new computer) and to improve Recallr. We keep it encrypted with our own key. When our file storage is set up, the original resume file you added is kept there too, encrypted by the storage provider. Our staff can open it only when needed to run the service, for example to help you with a problem.</p>
        <p>You can turn it off at any time in the app (Settings → Data) or on the website (Account → Settings). Turning it off deletes the copy and the resume files from our servers; your profiles on your computer stay.</p>

        <h2>Interview questions and answers</h2>
        <p>Each question you’re asked in an interview is added to our question bank without your name or any link to you, so we can count which questions are asked most and publish general guides on how to answer them. While “Save my questions and answers” is on (it is by default), the question and the answer Recallr gave are also kept on your account so you can see them under My questions. You can turn it off in the app or on the website, and delete them at any time. Only you can see your answers.</p>

        <h2>Practice and career tools</h2>
        <ul>
          <li>Mock interviews: the scores and speaking feedback for each answer (pace, filler words, length). No recordings are kept.</li>
          <li>Question of the day and other practice: your written answer and its AI feedback.</li>
          <li>Career tools (such as the resume check, rewriting for a job, LinkedIn review, cover letters and salary practice): what you asked the tool to check and its result, so you can see them again.</li>
          <li>If you joined through a college or bootcamp, your coach sees your mock interview scores and how much you practised, never your questions or answers.</li>
        </ul>

        <h2>Your interview calendar</h2>
        <p>The interviews you add in the app (name, date and time, which profile, and your notes) are kept on your account, so they show on your account page and so we can send the reminders you asked for.</p>

        <h2>Emails and WhatsApp</h2>
        <p>We email you about your account and payments, and a weekly progress email that you can turn off with one click from any of them or in Account → Settings. WhatsApp messages (interview reminders, question of the day) are sent only if you add your number and turn them on; you can turn them off at any time. Messages go through our email provider and Meta’s WhatsApp Business service.</p>

        <h2>Invites and the leaderboard</h2>
        <p>When you invite friends, you see their first names and whether they’ve made a first payment. If friends you invited make a payment, your first name, the first letter of your last name and the number of those friends can appear on the invite leaderboard, which other signed-in users see. Your email is never shown. If you apply to be a college ambassador, we keep your application (college, city, course and why you applied) and our decision.</p>

        <h2>What stays on your computer</h2>
        <p>Your conversation history and the app’s settings stay on your own computer. If you use Cloud backup, an encrypted copy of the app’s data is kept on our server until you delete it or replace it.</p>

        <h2>AI services that process your text</h2>
        <p>To make an answer, the audio of the question (to turn it into text), the text needed for the answer (such as the question and parts of your profile) and, when you use “Read from screen”, a picture of your screen are sent through our server to the AI services we use: Groq, OpenAI and Anthropic. They process it to give the answer; apart from what’s described above, we don’t store it. We use their paid business APIs, not their consumer apps. At the time of writing, each of them says in its API terms that it does not use data sent through the API to train its models unless the customer opts in, and we have not opted in. They may keep it for a limited time, for example to check for abuse, under their own terms. These companies are based in the United States, so this processing happens outside India.</p>

        <h2>Where your data is kept</h2>
        <p>Our database and files are on servers in India, or in the region our hosting provider uses for the service we chose. The services named above (Razorpay, our email provider, Meta for WhatsApp and the AI services) handle the parts they need, under their own privacy policies. We don’t sell your data or share it for advertising.</p>

        <h2>Cookies and local storage</h2>
        <p>The website doesn’t use advertising or analytics trackers. It keeps your sign-in and the messages you closed in your browser’s local storage. Razorpay may set its own cookies while you pay. The app keeps its data in its own storage on your computer.</p>

        <h2>How long we keep it</h2>
        <p>We keep your data while you have an account. When you close your account (Account → Settings), we delete your profiles and resume files, saved questions and answers, practice results, career tool results, interview calendar, cloud backup, computers and support requests, and remove your name and email from the account. Payment records and invoices are kept, without your name and email on the account, for as long as tax and accounting laws require.</p>

        <h2>Your rights</h2>
        <p>Under the Digital Personal Data Protection Act, 2023 you can:</p>
        <ul>
          <li>Get a copy of your data: “Download my data” under Account → Settings, or ask us for anything not in it.</li>
          <li>Correct it: change your name in Account → Settings, edit your profiles in the app, or ask us.</li>
          <li>Delete it: delete saved answers one by one, delete a profile in the app (its copy on your account goes too), turn off the profile copy, or close your account.</li>
          <li>Withdraw your consent: turn off the profile copy, saved answers, the weekly email or WhatsApp messages at any time. Withdrawing doesn’t affect what was done before.</li>
          <li>Nominate someone to use these rights for you if you die or can’t act for yourself, by writing to us.</li>
          <li>Complain to our Grievance Officer (below), and if you’re not satisfied with our answer, to the Data Protection Board of India.</li>
        </ul>
        <p>If a security breach affects your data, we’ll tell you and the Data Protection Board as the law requires.</p>

        <h2>Grievance Officer</h2>
        <p>Grievance Officer, {SITE.businessName}: <Email />. Write with your account email and what you’d like us to do. We’ll reply within 7 days and resolve it as quickly as we can, within the time the law allows.</p>

        <h2>Children</h2>
        <p>Recallr is for people aged 18 and over. We don’t knowingly keep data about children; if you think a child has made an account, write to us and we’ll delete it.</p>

        <h2>Changes</h2>
        <p>When we change this policy, we update the date at the top. For important changes we’ll also tell you by email or in the app.</p>
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
    {CONTENT[page].updated && <p className="mt-2 text-sm text-slate-500">Last updated: {CONTENT[page].updated}</p>}
    <div className="mt-6 space-y-3 leading-relaxed text-slate-300 [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-100 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      {CONTENT[page].body}
    </div>
  </article>
  );
};
