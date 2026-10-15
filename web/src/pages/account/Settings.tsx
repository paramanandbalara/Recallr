import React, { useState } from 'react';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import { AccountPage } from '../../components/AccountNav';
import { Button, Card, ErrorText, Field, Input } from '../../components/ui';

const Saved: React.FC<{ show: boolean; children: React.ReactNode }> = ({ show, children }) =>
  show ? <p className="text-sm text-emerald-300">{children}</p> : null;

// Emails the user can turn off (payment and account emails always go out)
const EmailChoices: React.FC = () => {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const on = user?.weeklyEmail !== false;
  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/auth/me', { method: 'PATCH', body: { weeklyEmail: !on } });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="md:col-span-2">
      <h2 className="font-semibold text-slate-100">Emails</h2>
      <label className="mt-3 flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={on} disabled={busy} onChange={toggle} className="mt-1 accent-blue-500" />
        <span className="text-sm text-slate-300">
          <span className="font-medium text-slate-100">Weekly practice email</span>
          <span className="block text-slate-400">Every Monday: your mock interview scores, pace and filler words, and one tip for the week.</span>
        </span>
      </label>
      <p className="mt-2 text-xs text-slate-500">Emails about payments, your plan and your account always come.</p>
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </Card>
  );
};

// The copy of the app's profiles kept on the account; turning it off deletes the copy
const ProfileCopy: React.FC = () => {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const on = user?.profileSync !== false;
  const toggle = async () => {
    if (on && !window.confirm('Turn this off? The copy of your profiles on your Recallr account is deleted. Your profiles in the app stay.')) return;
    setBusy(true);
    setError('');
    try {
      await api('/auth/me', { method: 'PATCH', body: { profileSync: !on } });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 border-t border-slate-800 pt-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={on} disabled={busy} onChange={toggle} className="mt-1 accent-blue-500" />
        <span className="text-sm text-slate-300">
          <span className="font-medium text-slate-100">Keep a copy of my profiles in my Recallr account</span>
          <span className="block text-slate-400">
            Your resume (and its original file), job details, company notes, prepared answers and stories from the app, stored encrypted and
            updated in the background, so they can be restored and we can improve Recallr. Turning it off deletes the copy.
          </span>
        </span>
      </label>
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </div>
  );
};

// Download everything we keep, or close the account
const YourData: React.FC = () => {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [password, setPassword] = useState('');

  const download = async () => {
    setBusy('download');
    setError('');
    try {
      await downloadFile('/auth/me/export', `recallr-my-data-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const close = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('close');
    setError('');
    try {
      await api('/auth/me/delete', { body: { password } });
      signOut();
      window.location.href = '/?account=closed';
    } catch (err) {
      setError((err as Error).message);
      setBusy('');
    }
  };

  return (
    <Card className="md:col-span-2">
      <h2 className="font-semibold text-slate-100">Your data</h2>
      <p className="mt-1 text-sm text-slate-400">
        Download everything Recallr keeps about you (account, profiles, plans, payments, saved questions and answers, mock interview results) as one file.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={busy === 'download'} onClick={download}>Download my data</Button>
        {!closing && <Button variant="ghost" onClick={() => setClosing(true)}>Close my account</Button>}
      </div>
      {closing && (
        <form onSubmit={close} className="mt-4 max-w-md space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-100">
            This deletes your profiles, saved questions and answers, mock interview results, cloud backup and computers, and signs you out everywhere.
            Payment records are kept without your name, as the law requires. It can’t be undone.
          </p>
          <Field label="Your password"><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={busy === 'close'}>Close my account</Button>
            <Button type="button" variant="ghost" onClick={() => setClosing(false)}>Keep it</Button>
          </div>
        </form>
      )}
      <div className="mt-3"><ErrorText>{error}</ErrorText></div>
      <ProfileCopy />
    </Card>
  );
};

export const AccountSettings: React.FC = () => {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user!.name);
  const [nameState, setNameState] = useState({ busy: false, error: '', saved: false });
  const [passwords, setPasswords] = useState({ current: '', password: '', confirm: '' });
  const [passState, setPassState] = useState({ busy: false, error: '', saved: false });

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameState({ busy: true, error: '', saved: false });
    try {
      await api('/auth/me', { method: 'PATCH', body: { name } });
      await refresh();
      setNameState({ busy: false, error: '', saved: true });
    } catch (err) {
      setNameState({ busy: false, error: (err as Error).message, saved: false });
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.password !== passwords.confirm) {
      setPassState({ busy: false, error: "The new passwords don't match.", saved: false });
      return;
    }
    setPassState({ busy: true, error: '', saved: false });
    try {
      await api('/auth/password', { body: { current: passwords.current, password: passwords.password } });
      setPasswords({ current: '', password: '', confirm: '' });
      setPassState({ busy: false, error: '', saved: true });
    } catch (err) {
      setPassState({ busy: false, error: (err as Error).message, saved: false });
    }
  };

  const setPass = (field: keyof typeof passwords) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPasswords({ ...passwords, [field]: e.target.value });

  return (
    <AccountPage title="Settings">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-100">Profile</h2>
          <form onSubmit={saveName} className="mt-4 space-y-4">
            <Field label="Email" hint="Contact us to change your email."><Input value={user!.email} disabled /></Field>
            <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} required /></Field>
            <ErrorText>{nameState.error}</ErrorText>
            <Saved show={nameState.saved}>Saved.</Saved>
            <Button variant="primary" loading={nameState.busy} disabled={name.trim() === user!.name}>Save</Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-100">Password</h2>
          <form onSubmit={savePassword} className="mt-4 space-y-4">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={passwords.current} onChange={setPass('current')} required /></Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input type="password" autoComplete="new-password" minLength={8} value={passwords.password} onChange={setPass('password')} required />
            </Field>
            <Field label="New password again"><Input type="password" autoComplete="new-password" value={passwords.confirm} onChange={setPass('confirm')} required /></Field>
            <ErrorText>{passState.error}</ErrorText>
            <Saved show={passState.saved}>Password changed. Use the new one in the app next time you sign in.</Saved>
            <Button variant="primary" loading={passState.busy}>Change password</Button>
          </form>
        </Card>

        <EmailChoices />
        <YourData />
      </div>
    </AccountPage>
  );
};
