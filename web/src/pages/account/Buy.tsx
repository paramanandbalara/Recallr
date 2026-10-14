import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CreditCard } from 'lucide-react';
import { api, days, hours, rupees, type Plan } from '../../api';
import { useAuth } from '../../auth';
import { AccountPage } from '../../components/AccountNav';
import { PlanCards, usePlans } from '../../components/PlanCards';
import { Button, Card, ErrorText, Field, Input, TextArea } from '../../components/ui';

interface Options {
  razorpayKeyId: string | null;
  offlineInfo: string;
}

interface Order {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  planName: string;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (e: { error: { description: string } }) => void) => void };
  }
}

// Razorpay Checkout's script, loaded only when someone pays
const loadCheckout = () =>
  new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(script);
  });

const OnlinePayment: React.FC<{ plan: Plan; code: string; amountPaise: number; onPaid: () => void }> = ({ plan, code, amountPaise, onPaid }) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      await loadCheckout();
      const order = await api<Order>('/billing/orders', { body: { planId: plan.id, code: code || undefined } });
      const checkout = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Recallr',
        description: order.planName,
        prefill: { name: user!.name, email: user!.email },
        theme: { color: '#2563eb' },
        handler: async (response: RazorpayResponse) => {
          try {
            await api('/billing/verify', { body: response });
            onPaid();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on('payment.failed', e => {
        setError(`Payment failed: ${e.error.description}. You haven't been charged; try again or pay offline.`);
        setBusy(false);
      });
      checkout.open();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Card, UPI, netbanking or wallet. Your plan starts the moment the payment goes through.</p>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" onClick={pay} loading={busy}>Pay {rupees(amountPaise)}</Button>
    </div>
  );
};

const OfflinePayment: React.FC<{ plan: Plan; code: string; amountPaise: number; info: string; onSent: () => void }> = ({ plan, code, amountPaise, info, onSent }) => {
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/billing/offline', { body: { planId: plan.id, reference, note: note || undefined, code: code || undefined } });
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
        <li>Send exactly <strong className="text-white">{rupees(amountPaise)}</strong> to:</li>
      </ol>
      <div className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100">
        {info || 'Contact us for payment details.'}
      </div>
      <ol start={2} className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
        <li>Enter the UPI reference or transaction ID below and submit.</li>
        <li>We confirm it, usually within a few hours, and your plan starts.</li>
      </ol>
      <Field label="UPI reference / transaction ID">
        <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. 425611234567" required minLength={3} />
      </Field>
      <Field label="Note (optional)" hint="e.g. the name or UPI ID you paid from">
        <TextArea value={note} onChange={e => setNote(e.target.value)} rows={2} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" loading={busy}>I’ve paid, submit</Button>
    </form>
  );
};

export const Buy: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { plans } = usePlans();
  const [options, setOptions] = useState<Options | null>(null);
  const [method, setMethod] = useState<'online' | 'offline'>('online');
  // Discount code: what's typed, and the price once it's been applied
  const [codeInput, setCodeInput] = useState('');
  const [applied, setApplied] = useState<{ code: string; discountPaise: number; amountPaise: number } | null>(null);
  const [codeError, setCodeError] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [freeBusy, setFreeBusy] = useState(false);

  useEffect(() => {
    api<Options>('/billing/options').then(o => {
      setOptions(o);
      if (!o.razorpayKeyId) setMethod('offline');
    });
  }, []);

  const plan = plans?.find(p => p.id === params.get('plan') && !p.isTrial);

  if (!plan) {
    return (
      <AccountPage title="Buy a plan">
        <PlanCards
          showTrial={false}
          action={p => <Button variant="primary" className="w-full" onClick={() => setParams({ plan: p.id })}>Choose {p.name}</Button>}
        />
      </AccountPage>
    );
  }

  const paid = async () => {
    await refresh();
    navigate('/account?paid=1');
  };

  const applyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeBusy(true);
    setCodeError('');
    try {
      const q = await api<{ code: string; discountPaise: number; amountPaise: number }>('/billing/quote', { body: { planId: plan.id, code: codeInput } });
      setApplied(q);
    } catch (err) {
      setApplied(null);
      setCodeError((err as Error).message);
    } finally {
      setCodeBusy(false);
    }
  };

  const claimFree = async () => {
    setFreeBusy(true);
    try {
      await api('/billing/free', { body: { planId: plan.id, code: applied!.code } });
      await paid();
    } catch (err) {
      setCodeError((err as Error).message);
      setFreeBusy(false);
    }
  };

  const amountPaise = applied?.amountPaise ?? plan.pricePaise;
  const code = applied?.code ?? '';

  return (
    <AccountPage title="Buy a plan">
      <button onClick={() => { setParams({}); setApplied(null); setCodeInput(''); setCodeError(''); }} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> All plans
      </button>
      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-500">You’re buying</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{plan.name}</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{rupees(amountPaise)}</span>
            {applied && applied.discountPaise > 0 && <span className="text-sm text-slate-500 line-through">{rupees(plan.pricePaise)}</span>}
          </div>
          {applied && <p className="mt-1 text-xs text-emerald-300">Code {applied.code}: {rupees(applied.discountPaise)} off</p>}
          <ul className="mt-4 space-y-1 text-sm text-slate-300">
            <li>{plan.listeningMinutes === null ? 'Unlimited listening' : `${hours(plan.listeningMinutes)} of listening`}</li>
            <li>Valid for {days(plan.durationDays)} from today</li>
            <li>Added to any time you have left</li>
          </ul>
          <form onSubmit={applyCode} className="mt-5 border-t border-slate-800 pt-4">
            <label className="mb-1 block text-xs font-medium text-slate-300">Discount code</label>
            <div className="flex gap-2">
              <Input value={codeInput} onChange={e => { setCodeInput(e.target.value); setCodeError(''); }} placeholder="e.g. LAUNCH20" className="uppercase" />
              <Button loading={codeBusy} disabled={!codeInput.trim()}>Apply</Button>
            </div>
            {codeError && <p className="mt-1.5 text-xs text-red-300">{codeError}</p>}
            {applied && <button type="button" onClick={() => { setApplied(null); setCodeInput(''); }} className="mt-1.5 text-xs text-slate-400 hover:text-slate-200">Remove code</button>}
          </form>
        </Card>

        <Card>
          {options === null ? null : applied && amountPaise === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">With your code this plan is free. No payment needed.</p>
              <Button variant="primary" loading={freeBusy} onClick={claimFree}>Get {plan.name} free</Button>
            </div>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-950 p-1">
                {([['online', 'Pay online', CreditCard], ['offline', 'Pay offline (UPI/bank)', Banknote]] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setMethod(id)}
                    disabled={id === 'online' && !options.razorpayKeyId}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      method === id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
              {method === 'online' && options.razorpayKeyId
                ? <OnlinePayment plan={plan} code={code} amountPaise={amountPaise} onPaid={paid} />
                : <OfflinePayment plan={plan} code={code} amountPaise={amountPaise} info={options.offlineInfo} onSent={() => navigate('/account')} />}
            </>
          )}
        </Card>
      </div>
    </AccountPage>
  );
};
