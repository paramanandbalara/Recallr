import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '../api';
import { Button, Card, ErrorText, Field, Input } from './ui';

// Account → Settings → WhatsApp: the user's number (verified with a code sent on WhatsApp) and what they get on it.
// The number is saved only once the code is typed, and nothing is ever sent to a number that wasn't verified.

interface WhatsApp {
  available: boolean; // Set up by the admin
  phone: string;      // Verified number, or ''
  reminders: boolean;
  daily: boolean;
}

const pretty = (phone: string) => (phone.startsWith('+91') && phone.length === 13 ? `+91 ${phone.slice(3, 8)} ${phone.slice(8)}` : phone);

export const WhatsAppSettings: React.FC = () => {
  const [data, setData] = useState<WhatsApp | null>(null);
  const [phone, setPhone] = useState('+91 ');
  const [pending, setPending] = useState<{ phone: string; token: string } | null>(null);
  const [code, setCode] = useState('');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { api<WhatsApp>('/whatsapp').then(setData, e => setError(e.message)); }, []);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError('');
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run('send', async () => {
      setPending(await api<{ phone: string; token: string }>('/whatsapp/phone', { body: { phone } }));
      setCode('');
    });
  };
  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    void run('verify', async () => {
      setData(await api<WhatsApp>('/whatsapp/verify', { body: { token: pending!.token, code } }));
      setPending(null);
      setChanging(false);
    });
  };
  const toggle = (key: 'reminders' | 'daily') => run(key, async () => {
    setData(await api<WhatsApp>('/whatsapp', { method: 'PATCH', body: { [key]: !data![key] } }));
  });
  const remove = () => {
    if (!window.confirm('Remove your WhatsApp number? Reminders and the daily question on WhatsApp stop.')) return;
    void run('remove', async () => { setData(await api<WhatsApp>('/whatsapp/phone', { method: 'DELETE' })); });
  };

  if (!data) return error ? <Card className="md:col-span-2"><ErrorText>{error}</ErrorText></Card> : null;

  const askNumber = !data.phone || changing;
  return (
    <Card className="md:col-span-2">
      <h2 id="whatsapp" className="flex items-center gap-2 font-semibold text-slate-100"><MessageCircle className="h-4 w-4 text-emerald-400" /> WhatsApp</h2>
      <p className="mt-1 text-sm text-slate-400">Interview reminders and the question of the day on WhatsApp. Only what you turn on below, and you can stop any time.</p>

      {!data.available && !data.phone && <p className="mt-3 text-sm text-slate-500">WhatsApp messages aren’t available yet.</p>}

      {data.available && askNumber && !pending && (
        <form onSubmit={sendCode} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="w-64">
            <Field label="Your WhatsApp number" hint="With the country code. India (+91) if you leave it out.">
              <Input type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </Field>
          </div>
          <Button variant="primary" loading={busy === 'send'} disabled={phone.replace(/\D/g, '').length < 10} className="mb-5">Send me a code</Button>
          {changing && <Button type="button" variant="ghost" className="mb-5" onClick={() => setChanging(false)}>Cancel</Button>}
        </form>
      )}

      {pending && (
        <form onSubmit={verify} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="w-48">
            <Field label="Code from WhatsApp" hint={`Sent to ${pretty(pending.phone)}. It works for 10 minutes.`}>
              <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
            </Field>
          </div>
          <Button variant="primary" loading={busy === 'verify'} disabled={code.length !== 6} className="mb-5">Verify</Button>
          <Button type="button" variant="ghost" className="mb-5" onClick={() => setPending(null)}>Use another number</Button>
        </form>
      )}

      {data.phone && !changing && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-300">Number: <strong className="text-slate-100">{pretty(data.phone)}</strong> <span className="text-emerald-300">(verified)</span></span>
          {data.available && <Button size="sm" variant="ghost" onClick={() => { setChanging(true); setPhone('+91 '); }}>Change</Button>}
          <Button size="sm" variant="ghost" loading={busy === 'remove'} onClick={remove}>Remove</Button>
        </div>
      )}

      {data.phone && (
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={data.reminders} disabled={!!busy} onChange={() => toggle('reminders')} className="mt-1 accent-blue-500" />
            <span className="text-sm text-slate-300">
              <span className="font-medium text-slate-100">Interview reminders on WhatsApp</span>
              <span className="block text-slate-400">The evening before, and about an hour before, each interview in the app’s calendar.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={data.daily} disabled={!!busy} onChange={() => toggle('daily')} className="mt-1 accent-blue-500" />
            <span className="text-sm text-slate-300">
              <span className="font-medium text-slate-100">Question of the day on WhatsApp</span>
              <span className="block text-slate-400">One interview question every morning at about 9:00, with a link to answer it and get feedback.</span>
            </span>
          </label>
        </div>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </Card>
  );
};
