import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Card, ErrorText, Field, Input } from '../components/ui';

// Only go back to pages on this site after signing in
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/account');

const AuthCard: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="mx-auto max-w-md px-4 py-16">
    <h1 className="text-center text-2xl font-bold text-white">{title}</h1>
    <p className="mt-2 text-center text-sm text-slate-400">{subtitle}</p>
    <Card className="mt-8">{children}</Card>
  </div>
);

export const Login: React.FC = () => {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = safeNext(params.get('next'));

  if (user) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>('/auth/login', { body: { email, password } });
      await signIn(token);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" subtitle="Welcome back.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
        <ErrorText>{error}</ErrorText>
        <Button variant="primary" className="w-full" loading={busy}>Sign in</Button>
        <div className="flex justify-between text-xs text-slate-400">
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-blue-400 hover:text-blue-300">Create an account</Link>
          <Link to="/forgot-password" className="hover:text-slate-200">Forgot password?</Link>
        </div>
      </form>
    </AuthCard>
  );
};

export const Register: React.FC = () => {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  // From an invite link (/register?ref=CODE): kept for this visit, so it survives going to the terms page and back
  const [ref] = useState(() => {
    const code = params.get('ref') ?? sessionStorage.getItem('recallr_ref') ?? '';
    if (code) sessionStorage.setItem('recallr_ref', code);
    return code;
  });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = safeNext(params.get('next'));

  if (user) return <Navigate to={next} replace />;

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>('/auth/register', { body: { ...form, ref: ref || undefined } });
      await signIn(token);
      navigate(next === '/account' ? '/account?welcome=1' : next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create your account" subtitle="No card needed. Your free trial starts when you first sign in to the app.">
      <form onSubmit={submit} className="space-y-4">
        {ref && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">You were invited by a friend: you’ll both get bonus listening time after your first purchase.</p>}
        <Field label="Your name"><Input autoFocus autoComplete="name" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Email"><Input type="email" autoComplete="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Password" hint="At least 8 characters. You'll use it to sign in to the app too.">
          <Input type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} required />
        </Field>
        <label className="flex items-start gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5" />
          <span>
            I agree to the <Link to="/terms" target="_blank" className="text-blue-400">terms</Link> and{' '}
            <Link to="/privacy" target="_blank" className="text-blue-400">privacy policy</Link>.
          </span>
        </label>
        <ErrorText>{error}</ErrorText>
        <Button variant="primary" className="w-full" loading={busy} disabled={!agreed}>Create account</Button>
        <p className="text-center text-xs text-slate-400">
          Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-blue-400 hover:text-blue-300">Sign in</Link>
        </p>
      </form>
    </AuthCard>
  );
};

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/forgot', { body: { email } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Forgot your password?" subtitle="We’ll email you a link to choose a new one.">
      {done ? (
        <div className="space-y-3 text-sm text-slate-300">
          <p>If <strong className="text-white">{email}</strong> has a Recallr account, the email is on its way. The link works for 1 hour.</p>
          <p className="text-slate-400">Nothing after a few minutes? Check your spam folder, or <Link to="/contact" className="text-blue-400">contact us</Link>.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input type="email" autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" className="w-full" loading={busy}>Send the link</Button>
          <p className="text-center text-xs text-slate-400"><Link to="/login" className="text-blue-400">Back to sign in</Link></p>
        </form>
      )}
    </AuthCard>
  );
};

export const ResetPassword: React.FC = () => {
  const { signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const token = params.get('token') ?? '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token: string }>('/auth/reset', { body: { token, password } });
      await signIn(result.token);
      navigate('/account?reset=1', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Choose a new password" subtitle="You’ll be signed out of the app on every computer: sign in again there with the new one.">
      {!token ? (
        <p className="text-sm text-slate-300">This link is incomplete. <Link to="/forgot-password" className="text-blue-400">Ask for a new one</Link>.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" hint="At least 8 characters.">
            <Input type="password" autoFocus autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required />
          </Field>
          <Field label="New password again"><Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></Field>
          <ErrorText>{error}</ErrorText>
          {error && <p className="text-xs"><Link to="/forgot-password" className="text-blue-400">Send a new link</Link></p>}
          <Button variant="primary" className="w-full" loading={busy}>Save the new password</Button>
        </form>
      )}
    </AuthCard>
  );
};
