import React, { useCallback, useEffect, useState } from 'react';
import { X, Minus, MessageSquareQuote, Loader2, Ban, WifiOff, CreditCard, ExternalLink, Laptop, Download } from 'lucide-react';
import { ApiError, appVersion, downloadUrl, fetchAccount, fetchVersionInfo, isOlder, isSignedIn, openUrl, openWebsite, PLAN_EVENT, signIn, signOut, takeSignedOutNotice, type Allowance, type SignedInDevice, type TrialResult, type User, type VersionInfo } from '../services/account';
import { AccountContext } from '../hooks/useAccount';
import { Button, IconButton, Label, TextInput } from './ui';

// The app opens only for a signed-in user with an active plan (a free trial counts).
// The plan is checked again every few minutes, and right away when the server says it ran out.

const RECHECK_MS = 2 * 60 * 1000; // Keeps the listening time shown in the app close to what's left

type Gate =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'blocked'; message: string }
  | { state: 'offline'; message: string }
  | { state: 'update'; info: VersionInfo }
  | { state: 'ready'; user: User; allowance: Allowance; lowMinutesWarning: number };

const sendIpc = (channel: string) => {
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.send(channel);
};

// Frameless window: a draggable header with hide and quit
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div data-interactive className="flex h-screen w-full flex-col">
    <div className="drag-area flex items-center justify-between px-3 py-2.5 border-b border-slate-800 shrink-0">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
        <MessageSquareQuote className="w-3.5 h-3.5 text-blue-400" /> Recallr
      </span>
      <div className="flex items-center gap-0.5">
        <IconButton onClick={() => sendIpc('hide-app')} title="Hide"><Minus className="w-4 h-4" /></IconButton>
        <IconButton onClick={() => sendIpc('quit-app')} title="Quit" tone="danger"><X className="w-4 h-4" /></IconButton>
      </div>
    </div>
    <div className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-6">{children}</div>
  </div>
);

const Notice: React.FC<{ icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }> = ({ icon, title, text, children }) => (
  <div className="flex flex-col items-center gap-2 text-center">
    {icon}
    <h1 className="text-sm font-semibold text-slate-100">{title}</h1>
    {text && <p className="max-w-[300px] whitespace-pre-line text-xs leading-relaxed text-slate-400">{text}</p>}
    {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
  </div>
);

const LoginForm: React.FC<{ onDone: (trial: TrialResult) => void; notice?: string }> = ({ onDone, notice }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null); // Over the computer limit

  const submit = async () => {
    setBusy(true);
    setMessage('');
    setDevices(null);
    try {
      onDone(await signIn(email, password));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign in.');
      if (error instanceof ApiError && error.code === 'DEVICE_LIMIT') setDevices(error.data.devices as SignedInDevice[]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-3">
      <div className="text-center">
        <h1 className="text-sm font-semibold text-slate-100">Sign in to Recallr</h1>
        <p className="mt-1 text-[11px] text-slate-500">Use the email and password of your Recallr account.</p>
      </div>
      {notice && <p className="rounded-md bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">{notice}</p>}
      <div>
        <Label>Email</Label>
        <TextInput type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div>
        <Label>Password</Label>
        <TextInput type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {message && <p className="text-[11px] text-amber-300">{message}</p>}
      {devices && (
        <div className="space-y-1.5 rounded-md border border-slate-700 p-2.5">
          {devices.map(d => (
            <div key={d.id} className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <Laptop className="w-3.5 h-3.5 text-slate-500" /> {d.name}
              <span className="text-slate-500">· last used {new Date(d.lastSeenAt).toLocaleDateString()}</span>
            </div>
          ))}
          <Button type="button" size="sm" className="w-full" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/devices')}>
            Remove one on the website
          </Button>
        </div>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!email.trim() || !password}>
        Sign in
      </Button>
      <div className="space-y-1 text-center text-[11px] text-slate-500">
        <p>
          No account yet?{' '}
          <button type="button" onClick={() => openWebsite('/register')} className="text-blue-400 hover:text-blue-300">
            Create one free
          </button>{' '}(your free trial starts on first sign-in)
        </p>
        <p>
          <button type="button" onClick={() => openWebsite('/forgot-password')} className="text-slate-400 hover:text-slate-300">
            Forgot your password?
          </button>
        </p>
      </div>
    </form>
  );
};

export const AccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gate, setGate] = useState<Gate>(() => (isSignedIn() ? { state: 'loading' } : { state: 'signed-out' }));
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState(''); // Why the user is signed out
  const [trial, setTrial] = useState<TrialResult | null>(null); // From the last sign-in

  const refresh = useCallback(async () => {
    // An app older than the minimum version must update first (checked even when signed out)
    const version = await fetchVersionInfo().catch(() => null);
    if (version && isOlder(appVersion(), version.minimum)) {
      setGate({ state: 'update', info: version });
      return;
    }
    if (!isSignedIn()) {
      const reason = takeSignedOutNotice();
      if (reason) setNotice(reason);
      setGate({ state: 'signed-out' });
      return;
    }
    setChecking(true);
    try {
      const { user, allowance, lowMinutesWarning } = await fetchAccount();
      setGate({ state: 'ready', user, allowance, lowMinutesWarning });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (error.code === 'DEVICE_REMOVED') setNotice('This computer was signed out from your account (on the website, or after a password change). Sign in again to continue.');
        setGate({ state: 'signed-out' });
      }
      else if (error instanceof ApiError && error.code === 'BLOCKED') setGate({ state: 'blocked', message: error.message });
      else {
        const message = error instanceof Error ? error.message : 'Could not check your account.';
        // A failed background check never interrupts someone already using the app
        setGate(previous => (previous.state === 'ready' ? previous : { state: 'offline', message }));
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh);
    const timer = setInterval(refresh, RECHECK_MS);
    window.addEventListener(PLAN_EVENT, refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener(PLAN_EVENT, refresh);
    };
  }, [refresh]);

  const leave = useCallback(() => {
    signOut();
    setGate({ state: 'signed-out' });
  }, []);

  if (gate.state === 'ready' && gate.allowance.active) {
    return (
      <AccountContext.Provider value={{ user: gate.user, allowance: gate.allowance, lowMinutesWarning: gate.lowMinutesWarning, refresh, signOut: leave }}>
        {children}
      </AccountContext.Provider>
    );
  }

  return (
    <Shell>
      {gate.state === 'loading' && <Notice icon={<Loader2 className="w-5 h-5 animate-spin text-blue-400" />} title="Checking your account..." text="" />}
      {gate.state === 'signed-out' && <LoginForm notice={notice} onDone={result => { setTrial(result); setNotice(''); refresh(); }} />}
      {gate.state === 'update' && (
        <Notice icon={<Download className="w-6 h-6 text-blue-400" />} title="Update Recallr to continue"
          text={`This version (${appVersion()}) is no longer supported. Install version ${gate.info.latest ?? gate.info.minimum} to keep using Recallr. Your profiles and history are kept.${gate.info.notes ? `\n\nWhat's new: ${gate.info.notes}` : ''}`}>
          <Button size="sm" variant="primary" icon={<Download className="w-3.5 h-3.5" />} onClick={() => openUrl(downloadUrl(gate.info))}>Download the update</Button>
        </Notice>
      )}
      {gate.state === 'offline' && (
        <Notice icon={<WifiOff className="w-6 h-6 text-amber-400" />} title="Can't check your account" text={gate.message}>
          <Button size="sm" variant="primary" onClick={refresh} loading={checking}>Try again</Button>
          <Button size="sm" variant="ghost" onClick={leave}>Sign out</Button>
        </Notice>
      )}
      {gate.state === 'blocked' && (
        <Notice icon={<Ban className="w-6 h-6 text-red-400" />} title="Access turned off" text={`${gate.message} Contact support if you think this is a mistake.`}>
          <Button size="sm" variant="ghost" onClick={leave}>Sign out</Button>
        </Notice>
      )}
      {gate.state === 'ready' && (
        <Notice
          icon={<CreditCard className="w-6 h-6 text-blue-400" />}
          title="Choose a plan to continue"
          text={`${trial === 'computer_used'
            ? 'This computer has already used a free trial (with another account), so there is no trial for this one. '
            : ''}${gate.user.email} has no active plan${trial === 'had_trial' ? ': the free trial is over' : ' (or it has ended)'}. Buy one on the website: Recallr opens as soon as it's paid, or once an offline payment is confirmed.`}
        >
          <Button size="sm" variant="primary" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={() => openWebsite('/account/buy')}>See plans</Button>
          <Button size="sm" onClick={refresh} loading={checking}>I've paid, check again</Button>
          <Button size="sm" variant="ghost" onClick={leave}>Sign out</Button>
        </Notice>
      )}
    </Shell>
  );
};
