import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api, loadSite } from '../../api';
import { Badge, Button, Card, ErrorText, Field, Input, TextArea } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

interface Setting {
  key: string;
  label: string;
  group: 'ai' | 'razorpay' | 'payments' | 'email' | 'accounts' | 'referrals' | 'app' | 'website' | 'storage' | 'blog';
  hint: string;
  secret: boolean;
  source: 'database' | 'environment' | 'default' | 'unset';
  value: string; // Secrets come masked: "••••1234"
}

const GROUPS: { id: Setting['group']; title: string; text: string; test?: { what: 'groq' | 'openai' | 'claude' | 'razorpay' | 'email'; label: string }[] }[] = [
  {
    id: 'ai', title: 'AI providers', text: 'The keys every answer and transcription uses. Listening needs Groq or OpenAI; Claude can answer too. Users never see them.',
    test: [{ what: 'groq', label: 'Test Groq' }, { what: 'openai', label: 'Test OpenAI' }, { what: 'claude', label: 'Test Claude' }],
  },
  {
    id: 'razorpay', title: 'Razorpay (online payments)',
    text: 'Dashboard → Account & Settings → API Keys. Webhook URL: your-domain/api/billing/webhook (events payment.captured and order.paid). Without keys, only offline payment is offered.',
    test: [{ what: 'razorpay', label: 'Test Razorpay' }],
  },
  { id: 'payments', title: 'Offline payments', text: 'What users see when they pay by UPI or bank transfer.' },
  {
    id: 'email', title: 'Email',
    text: 'For password resets, payment confirmations, reminders and support replies. Any SMTP service works: Amazon SES, Zoho, Gmail (with an app password). Until it’s set, emails are logged but not sent.',
    test: [{ what: 'email', label: 'Send me a test email' }],
  },
  { id: 'accounts', title: 'Accounts', text: 'Limits that stop one paid account being shared, and when to warn about running low.' },
  { id: 'referrals', title: 'Invite friends', text: 'What both people get when an invited friend makes their first payment.' },
  { id: 'app', title: 'App versions', text: 'After you publish a new desktop build, set the latest version so older apps offer the update. Set the minimum to force it (e.g. after a breaking change).' },
  { id: 'website', title: 'Website', text: 'Shown in the footer, the legal pages, the guide and the Download page.' },
  { id: 'storage', title: 'File storage (S3)', text: 'Copies of users’ profiles and their resume files. Use a private bucket (Block all public access on). Without it, profiles are kept in the database.' },
  { id: 'blog', title: 'Blog', text: 'Posts are written in Admin → Blog. The AI can also draft one post a day.' },
];

const SOURCE: Record<Setting['source'], { label: string; tone: 'green' | 'blue' | 'slate' | 'amber' }> = {
  database: { label: 'Saved here', tone: 'green' },
  environment: { label: 'From .env', tone: 'blue' },
  default: { label: 'Default', tone: 'slate' },
  unset: { label: 'Not set', tone: 'amber' },
};

type TestResult = { ok: boolean; error: string } | 'testing';

export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({}); // Only the fields being changed
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [tests, setTests] = useState<Record<string, TestResult>>({});

  useEffect(() => {
    api<{ settings: Setting[] }>('/admin/settings').then(r => setSettings(r.settings), e => setError(e.message));
  }, []);

  const save = async (group: Setting['group'], changes: Record<string, string | null>) => {
    setBusy(group);
    setError('');
    setSaved('');
    try {
      const r = await api<{ settings: Setting[] }>('/admin/settings', { method: 'PATCH', body: changes });
      setSettings(r.settings);
      setEdits(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => !(key in changes))));
      setSaved(group);
      if (group === 'website' || group === 'payments') await loadSite();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const test = async (what: string) => {
    setTests(prev => ({ ...prev, [what]: 'testing' }));
    try {
      const result = what === 'email'
        ? await api<{ ok: boolean; error: string }>('/admin/emails/test', { body: {} })
        : await api<{ ok: boolean; error: string }>('/admin/settings/test', { body: { what } });
      setTests(prev => ({ ...prev, [what]: result }));
    } catch (err) {
      setTests(prev => ({ ...prev, [what]: { ok: false, error: (err as Error).message } }));
    }
  };

  if (!settings) return <><AdminTitle title="Settings" /><ErrorText>{error}</ErrorText></>;

  return (
    <>
      <AdminTitle title="Settings" />
      <p className="mb-6 text-sm text-slate-400">
        Saved in the database, secrets encrypted. Changes apply within a few seconds, without a restart.
        A value saved here wins over the server’s .env file.
      </p>
      <ErrorText>{error}</ErrorText>

      <div className="space-y-6">
        {GROUPS.map(group => {
          const fields = settings.filter(s => s.group === group.id);
          const changes = Object.fromEntries(fields.filter(f => f.key in edits).map(f => [f.key, edits[f.key]]));
          return (
            <Card key={group.id}>
              <h2 className="font-semibold text-slate-100">{group.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{group.text}</p>

              <form
                className="mt-4 space-y-4"
                onSubmit={e => { e.preventDefault(); save(group.id, changes); }}
              >
                {fields.map(field => {
                  const editing = field.key in edits;
                  const value = editing ? edits[field.key] : field.secret ? '' : field.value;
                  const set = (v: string) => setEdits(prev => ({ ...prev, [field.key]: v }));
                  return (
                    <Field key={field.key} label={field.label} hint={field.hint}>
                      <div className="flex items-start gap-2">
                        {field.key === 'offlinePaymentInfo' ? (
                          <TextArea rows={3} value={value} onChange={e => set(e.target.value)} placeholder={'UPI: yourname@okbank\nBank: A/C 1234567890, IFSC ABCD0001234'} />
                        ) : (
                          <Input
                            type={field.secret ? 'password' : 'text'}
                            autoComplete="off"
                            value={value}
                            onChange={e => set(e.target.value)}
                            placeholder={field.secret ? (field.value ? `${field.value} (type to replace)` : 'Not set') : ''}
                          />
                        )}
                        <span className="mt-2 shrink-0"><Badge tone={SOURCE[field.source].tone}>{SOURCE[field.source].label}</Badge></span>
                        {field.source === 'database' && (
                          <Button type="button" size="sm" variant="ghost" className="mt-1 shrink-0" title="Remove the saved value (the .env value or default is used again)"
                            onClick={() => window.confirm(`Remove the saved ${field.label}?`) && save(group.id, { [field.key]: null })}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </Field>
                  );
                })}

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" loading={busy === group.id} disabled={Object.keys(changes).length === 0}>Save</Button>
                  {group.test?.map(t => {
                    const result = tests[t.what];
                    return (
                      <span key={t.what} className="inline-flex items-center gap-1.5">
                        <Button type="button" loading={result === 'testing'} onClick={() => test(t.what)}>{t.label}</Button>
                        {result && result !== 'testing' && (result.ok
                          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Works</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-red-300"><XCircle className="h-3.5 w-3.5" /> {result.error}</span>)}
                      </span>
                    );
                  })}
                  {saved === group.id && <span className="text-sm text-emerald-300">Saved.</span>}
                </div>
                {group.test && <p className="text-xs text-slate-500">{group.id === 'email' ? 'Sent to your own email, with the saved settings: save first.' : 'Tests use the saved keys: save first.'}</p>}
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
};
