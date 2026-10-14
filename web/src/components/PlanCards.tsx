import React, { useEffect, useState } from 'react';
import { Check, Gift, Loader2 } from 'lucide-react';
import { answers, api, days, hours, rupees, type Plan } from '../api';
import { Badge } from './ui';

export const usePlans = () => {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ plans: Plan[] }>('/plans').then(r => setPlans(r.plans), e => setError(e.message));
  }, []);
  return { plans, error };
};

const Feature: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {children}</li>
);

// The plans on sale, each with a button (`action`) under it. The free trial shows as its own card.
export const PlanCards: React.FC<{ action: (plan: Plan) => React.ReactNode; showTrial?: boolean }> = ({ action, showTrial = true }) => {
  const { plans, error } = usePlans();
  if (error) return <p className="text-center text-sm text-red-300">{error}</p>;
  if (!plans) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-400" /></div>;

  const shown = plans.filter(p => showTrial || !p.isTrial);
  // With two or more paid plans, the biggest one is marked "Best value"
  const paid = shown.filter(p => !p.isTrial).sort((a, b) => b.pricePaise - a.pricePaise);
  const highlight = paid.length >= 2 ? paid[0].id : undefined;

  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${shown.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {shown.map(plan => (
        <div
          key={plan.id}
          className={`flex flex-col rounded-2xl border p-5 ${plan.id === highlight ? 'border-blue-500/70 bg-blue-500/5' : 'border-slate-800 bg-slate-900/60'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-100">{plan.name}</h3>
            {plan.isTrial ? <Badge tone="green"><Gift className="mr-1 h-3 w-3" /> Free</Badge> : plan.id === highlight && <Badge tone="blue">Best value</Badge>}
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-white">{plan.isTrial ? '₹0' : rupees(plan.pricePaise)}</span>
            <span className="text-sm text-slate-400"> / {days(plan.durationDays)}</span>
          </div>
          {plan.description && <p className="mt-2 text-sm text-slate-400">{plan.description}</p>}
          <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">
            <Feature>{plan.listeningMinutes === null ? 'Unlimited listening' : `${hours(plan.listeningMinutes)} of listening`}</Feature>
            <Feature>{answers(plan.tokenLimit)}</Feature>
            <Feature>Valid for {days(plan.durationDays)}</Feature>
            <Feature>All features: mock interviews, screen reading, reviews</Feature>
          </ul>
          <div className="mt-5">{plan.isTrial ? <p className="text-center text-xs text-slate-500">Included automatically when you create an account</p> : action(plan)}</div>
        </div>
      ))}
    </div>
  );
};
