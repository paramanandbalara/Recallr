import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { PlanCards } from '../components/PlanCards';

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
      <div className="mx-auto mt-12 max-w-3xl space-y-3 text-sm text-slate-400">
        <p><strong className="text-slate-200">Listening time</strong> counts only while there is speech to turn into text, not silence.</p>
        <p><strong className="text-slate-200">AI answers</strong> are an estimate: long technical answers use more, short ones less.</p>
        <p><strong className="text-slate-200">More than one pack?</strong> Time is used from the pack that ends first, so nothing goes to waste.</p>
      </div>
    </div>
  );
};
