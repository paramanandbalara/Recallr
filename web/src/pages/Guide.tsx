import React from 'react';
import { Link } from 'react-router-dom';

const SECTIONS = [
  { id: 'start', title: '1. Create your account (free trial)' },
  { id: 'install', title: '2. Download and install' },
  { id: 'sign-in', title: '3. Sign in to the app' },
  { id: 'setup', title: '4. Add your resume and job' },
  { id: 'check', title: '5. Check your setup' },
  { id: 'interview', title: '6. In the interview' },
  { id: 'after', title: '7. After the interview' },
  { id: 'buy', title: '8. Buying a plan' },
  { id: 'plan', title: '9. Your plan, listening time and AI answers' },
  { id: 'trouble', title: '10. Troubleshooting' },
  { id: 'forgot-password', title: 'Forgot your password?' },
];

const H: React.FC<{ id: string }> = ({ id }) => (
  <h2 id={id} className="scroll-mt-24 pt-10 text-2xl font-bold text-white">{SECTIONS.find(s => s.id === id)?.title}</h2>
);
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="mt-3 leading-relaxed text-slate-300">{children}</p>;
const Steps: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed text-slate-300 marker:text-slate-500">{children}</ol>
);
const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm leading-relaxed text-blue-100">{children}</div>
);
const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>;
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-200">{children}</kbd>
);

export const Guide: React.FC = () => (
  <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[220px_1fr]">
    <aside className="hidden lg:block">
      <nav className="sticky top-24 space-y-1 text-sm">
        {SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`} className="block rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white">{s.title}</a>
        ))}
      </nav>
    </aside>

    <article className="max-w-3xl">
      <h1 className="text-4xl font-bold text-white">How to use Recallr</h1>
      <P>From creating your account to your first interview, in about five minutes.</P>

      <H id="start" />
      <Steps>
        <li><Link to="/register" className="text-blue-400">Create an account</Link> with your name, email and a password.</li>
        <li>Your <B>free trial starts the first time you sign in to the app</B> (step 3), so none of it is used up before you’ve installed it. No card is needed. There’s one trial per person and per computer.</li>
        <li>Use the trial for a mock interview first, so you know how Recallr works before a real one.</li>
      </Steps>

      <H id="install" />
      <Steps>
        <li>Go to <Link to="/download" className="text-blue-400">Download</Link> and get the installer for your computer.</li>
        <li><B>Windows:</B> run the installer. If Windows shows “Windows protected your PC”, click <B>More info → Run anyway</B>.</li>
        <li><B>macOS:</B> open the .dmg and drag Recallr to Applications. The first time, right-click Recallr and choose <B>Open</B>.</li>
        <li>On macOS, allow Recallr when it asks for the <B>Microphone</B> and <B>Screen &amp; System Audio Recording</B> (System Settings → Privacy &amp; Security). The second one lets it hear the call, and read questions from your screen. Restart Recallr after allowing it.</li>
      </Steps>

      <H id="sign-in" />
      <Steps>
        <li>Open Recallr and sign in with the <B>same email and password</B> as on this website.</li>
        <li>If you have an active plan or trial, the app opens. If not, it shows <B>Choose a plan to continue</B>, with a button that brings you to the plans.</li>
        <li>You stay signed in. To switch accounts: <B>Settings → Account → Sign out</B>.</li>
        <li>An account can be signed in on a limited number of computers. Changed computer? Remove the old one under <Link to="/account/devices" className="text-blue-400">Account → Devices</Link>, then sign in on the new one.</li>
      </Steps>

      <H id="setup" />
      <P>The first time, Recallr asks for:</P>
      <Steps>
        <li><B>Your resume</B>: upload a PDF or paste the text. Answers only use facts from it.</li>
        <li><B>Company name and job description</B>: so answers fit the role.</li>
        <li><B>Prepared answers</B> (optional): the answers you practised, like “Tell me about yourself”. When that question comes, Recallr shows your answer instantly. It can also draft answers from the job description or stories from your resume.</li>
      </Steps>
      <P>
        Later, in <B>Settings → Profile</B>, you can add company research, who the interviewer is, your own notes and documents,
        and the interview language. Applying to several jobs? Create a <B>profile</B> per job: each keeps its own resume, job and answers.
      </P>

      <H id="check" />
      <P>
        Before every interview, run the <B>Pre-interview check</B> (in the main window). It checks your plan and how much time is left,
        how fast answers arrive, your microphone, the call audio, and screen reading, and tells you how to fix anything that’s wrong.
      </P>
      <Tip>Start a <B>Mock interview</B> to practise: Recallr asks questions for your role and scores your answers.</Tip>

      <H id="interview" />
      <Steps>
        <li>Join your call (Zoom, Google Meet, Teams…) as usual.</li>
        <li>In Recallr, choose what it listens to: <B>Call audio</B> (the interviewer), <B>Call + mic</B> (the interviewer and you, kept apart), or <B>Mic</B> only.</li>
        <li>Click the <B>microphone button</B> to start listening. Each question appears with an answer under it within a second or two.</li>
        <li>Question in the chat or a coding problem on screen? Click <B>Read from screen</B>.</li>
        <li>You can also type a question in the box at the bottom.</li>
        <li>Use the <B>display menu</B> to make the window see-through, change the text size, or show answers as short key points.</li>
      </Steps>
      <P>Keyboard shortcuts work even when Recallr isn’t in front (on Windows add <Key>Shift</Key>):</P>
      <ul className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <li><Key>Ctrl</Key> + <Key>Alt</Key> + <Key>L</Key> start or stop listening</li>
        <li><Key>Ctrl</Key> + <Key>Alt</Key> + <Key>S</Key> read the question from the screen</li>
        <li><Key>Ctrl</Key> + <Key>Alt</Key> + <Key>A</Key> type a question</li>
        <li><Key>Ctrl</Key> + <Key>Alt</Key> + <Key>R</Key> new version of the last answer</li>
        <li><Key>Ctrl</Key> + <Key>Alt</Key> + <Key>N</Key> start a new conversation</li>
      </ul>
      <Tip>Stop listening when the interview ends. Listening time is only used while there’s speech, but stopping avoids using it on other calls.</Tip>

      <H id="after" />
      <P>
        Every conversation is saved in <B>History</B> on your computer. Open one to get a <B>review</B> of how you did, practise its questions again,
        or export it as Markdown or PDF. To move to another computer, use <B>Settings → Data → Back up to my account</B>, then
        <B> Restore from my account</B> on the new one (or save a backup file instead).
      </P>

      <H id="buy" />
      <P>When your trial ends, or before a big interview, buy a pack on the <Link to="/account/buy" className="text-blue-400">Buy a plan</Link> page.</P>
      <h3 className="mt-5 font-semibold text-slate-100">Pay online (fastest)</h3>
      <Steps>
        <li>Choose a plan and click <B>Pay online</B>. Pay by card, UPI, netbanking or wallet with Razorpay.</li>
        <li>As soon as the payment goes through, the plan is active.</li>
        <li>In the app, click <B>I’ve paid, check again</B> (or wait a few minutes, or restart the app).</li>
      </Steps>
      <h3 className="mt-5 font-semibold text-slate-100">Pay offline (UPI or bank transfer)</h3>
      <Steps>
        <li>Choose a plan and click <B>Pay offline</B>. You’ll see where to send the money.</li>
        <li>Send the exact amount, then enter the <B>UPI reference / transaction ID</B> and submit.</li>
        <li>We check the payment and approve it, usually within a few hours. Your account page shows it as <B>Waiting for confirmation</B> until then.</li>
        <li>Once it’s approved, the plan is active. Open the app and click <B>I’ve paid, check again</B>.</li>
      </Steps>
      <Tip>Buying while you still have time left? The new pack is <B>added</B> to what you have: nothing is lost.</Tip>

      <H id="plan" />
      <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-slate-300">
        <li><B>Listening time</B> is the speech Recallr turns into text. Silence isn’t counted.</li>
        <li><B>AI answers</B> are counted in tokens (pieces of words). A typical answer uses 1,500–3,000. The plans show an estimate of how many answers that is.</li>
        <li>Each pack is valid for its number of days. With more than one, time is used from the one that ends first.</li>
        <li>See what’s left on your <Link to="/account" className="text-blue-400">account page</Link> or in the app under <B>Settings → Account</B>.</li>
        <li>When something runs out, the app says so and offers a top-up. Your resume, answers and history are kept.</li>
      </ul>

      <H id="trouble" />
      <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-slate-300">
        <li><B>No answers appear:</B> run the Pre-interview check. Most often the call audio isn’t allowed (macOS: Screen &amp; System Audio Recording), or the plan has run out.</li>
        <li><B>It hears silence:</B> make sure the call’s sound plays through your computer (not only a phone), and try <B>Call + mic</B>.</li>
        <li><B>“Can’t reach Recallr”:</B> check your internet connection. Recallr needs the internet to make answers.</li>
        <li><B>Paid but the app still asks for a plan:</B> click <B>I’ve paid, check again</B>. Offline payments open once confirmed. Still stuck? <Link to="/contact" className="text-blue-400">Contact us</Link> with your payment reference.</li>
      </ul>

      <H id="forgot-password" />
      <P>
        Click <Link to="/forgot-password" className="text-blue-400">Forgot password?</Link> on the sign-in page and enter your email.
        We’ll email you a link to choose a new one (it works for an hour). Setting a new password signs you out of the app
        on every computer, so sign in again with the new one.
      </P>
    </article>
  </div>
);
