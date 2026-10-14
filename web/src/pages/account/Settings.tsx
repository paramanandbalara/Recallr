import React, { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { AccountPage } from '../../components/AccountNav';
import { Button, Card, ErrorText, Field, Input } from '../../components/ui';

const Saved: React.FC<{ show: boolean; children: React.ReactNode }> = ({ show, children }) =>
  show ? <p className="text-sm text-emerald-300">{children}</p> : null;

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
      </div>
    </AccountPage>
  );
};
