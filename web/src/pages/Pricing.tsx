import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { PlanCards } from '../components/PlanCards';

// What uses each part of a plan (the server counts every AI use against the plan)
const USES = [
  {
    title: 'AI answers',
    intro: 'Everything the AI writes or reads for you:',
    items: [
      'Answers to the questions it hears in your interview',
      'Questions you type, and questions read from your screen (screenshots count too)',
      'Regenerating an answer, or making it shorter or simpler',
      'Key points and follow-up questions',
      'Prep packs, prepared answers and stories from your resume',
      'Mock interview questions, scores and feedback',
      'Interview reviews and company research',
    ],
    note: 'Counted in tokens (pieces of words). The number of answers shown is a typical estimate: long technical answers use more, short ones less.',
  },
  {
    title: 'Listening time',
    intro: 'Speech that Recallr turns into text:',
    items: [
      'Listening live to the interviewer during an interview',
      'Your spoken answers in mock interviews',
    ],
    note: 'Measured from the audio itself, and only while someone is speaking: silence isn’t counted, so an hour-long interview usually uses less than an hour.',
  },
];

export const Pricing: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-center text-4xl font-bold text-white">Pricing</h1>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
        Pay once per pack, no subscription. Packs add up: buy a top-up and its time is added to what you have.
        Pay online (card, UPI, netbanking) or offline by UPI or bank transfer.
      </p>
      <div className="mt-10">
        <PlanCards
          action={plan => (
            <Link to={user ? `/account/buy?plan=${plan.id}` : `/register?next=${encodeURIComponent(`/account/buy?plan=${plan.id}`)}`}
              className="block rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-500">
              Buy {plan.name}
            </Link>
          )}
        />
      </div>
      <div className="mx-auto mt-12 max-w-4xl">
        <h2 className="text-center text-xl font-semibold text-white">What each plan counts</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {USES.map(use => (
            <div key={use.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="font-semibold text-slate-100">{use.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{use.intro}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                {use.items.map(item => <li key={item} className="flex gap-2"><span className="text-blue-400">•</span>{item}</li>)}
              </ul>
              <p className="mt-3 text-xs text-slate-500">{use.note}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-6 max-w-3xl space-y-3 text-sm text-slate-400">
          <p><strong className="text-slate-200">More than one pack?</strong> Time is used from the pack that ends first, so nothing goes to waste.</p>
          <p><strong className="text-slate-200">Invoices:</strong> every payment comes with an invoice by email, also in your account under Billing. Add your GSTIN there before paying to have it on the invoice.</p>
        </div>
      </div>
    </div>
  );
};
