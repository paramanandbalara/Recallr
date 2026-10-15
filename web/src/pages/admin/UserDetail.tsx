import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, date, dateTime, hours, platformName, rupees, tokens, type Allowance, type Device, type Payment, type Plan, type PurchaseSource, type User } from '../../api';
import { PaymentTable } from '../../components/PaymentTable';
import { Badge, Button, Card, ErrorText, Field, Input, Select } from '../../components/ui';
import { AdminTitle } from './AdminLayout';
import { PlanBadge } from './Users';

interface Purchase {
  id: string;
  planName: string;
  source: PurchaseSource;
  startsAt: string;
  expiresAt: string;
  listeningMinutes: number | null;
  tokenLimit: number | null;
  usedSeconds: number;
  usedTokens: number;
}

interface UsageEvent {
  id: string;
  kind: 'CHAT' | 'TRANSCRIBE';
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  createdAt: string;
}

interface EmailEntry {
  id: string;
  kind: string;
  subject: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error: string | null;
  createdAt: string;
}

interface Detail {
  user: User;
  allowance: Allowance;
  purchases: Purchase[];
  payments: Payment[];
  usage: UsageEvent[];
  devices: Device[];
  emails: EmailEntry[];
  referral: { referredBy: { id: string; email: string } | null; invited: number; rewardedAt: string | null };
  backup: { sizeBytes: number; updatedAt: string; deviceName: string } | null;
  practice: { id: string; role: string; questionCount: number; averageScore: number | null; wordsPerMinute: number | null; fillersPerMinute: number | null; createdAt: string }[];
  savedAnswers: number;
  memberships: { role: 'COACH' | 'STUDENT'; organization: { id: string; name: string } }[];
  profiles: ProfileRow[];
}

// A copy of one of the app's profiles, kept on the account
interface ProfileRow {
  id: string;
  name: string;
  company: string;
  jobTitle: string;
  resumeFileName: string;
  resumeChars: number;
  answersCount: number;
  storiesCount: number;
  storage: 'DATABASE' | 'S3';
  sizeBytes: number;
  hasResumeFile: boolean;
  deviceName: string;
  updatedAt: string;
}

// The profile as the app sent it (fields may be missing in older apps)
interface ProfileData {
  cv?: string;
  job?: string;
  company?: string;
  companyNotes?: string;
  interviewer?: string;
  knowledge?: { name?: string; text?: string }[];
  answers?: { question?: string; answer?: string; notes?: string }[];
  stories?: { title?: string; situation?: string; action?: string; result?: string; themes?: string[] }[];
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

const Block: React.FC<{ title: string; text?: string }> = ({ title, text }) => (text?.trim() ? (
  <div>
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-sans text-xs text-slate-300">{text}</pre>
  </div>
) : null);

const ProfileView: React.FC<{ data: ProfileData }> = ({ data }) => (
  <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
    <Block title="Resume" text={data.cv} />
    <Block title="Job description" text={data.job} />
    <Block title="Company notes" text={data.companyNotes} />
    <Block title="Interviewer" text={data.interviewer} />
    {(data.knowledge ?? []).map((k, i) => <Block key={`k${i}`} title={`Notes: ${k.name ?? ''}`} text={k.text} />)}
    <Block title={`Prepared answers (${data.answers?.length ?? 0})`}
      text={(data.answers ?? []).map(a => `Q: ${a.question ?? ''}\n${a.answer ?? ''}${a.notes ? `\n(${a.notes})` : ''}`).join('\n\n')} />
    <Block title={`Stories (${data.stories?.length ?? 0})`}
      text={(data.stories ?? []).map(st => `${st.title ?? ''}${st.themes?.length ? ` [${st.themes.join(', ')}]` : ''}\nSituation: ${st.situation ?? ''}\nAction: ${st.action ?? ''}\nResult: ${st.result ?? ''}`).join('\n\n')} />
  </div>
);

// Each view and download is recorded in the activity log
const Profiles: React.FC<{ userId: string; profiles: ProfileRow[] }> = ({ userId, profiles }) => {
  const [open, setOpen] = useState<{ id: string; data: ProfileData } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const act = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };
  const view = (p: ProfileRow) => (open?.id === p.id ? setOpen(null) : act(`view-${p.id}`, async () => {
    const res = await api<{ profile: ProfileData | null }>(`/admin/users/${userId}/profiles/${p.id}`);
    setOpen({ id: p.id, data: res.profile ?? {} });
  }));
  const download = (p: ProfileRow) => act(`file-${p.id}`, async () => {
    const { url } = await api<{ url: string }>(`/admin/users/${userId}/profiles/${p.id}/resume-file`);
    window.open(url, '_blank', 'noopener');
  });

  return (
    <div className="space-y-2">
      <ErrorText>{error}</ErrorText>
      {profiles.map(p => (
        <Card key={p.id} className="!p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-medium text-slate-100">{p.name}</span>{' '}
              <span className="text-xs text-slate-500">{[p.company, p.jobTitle].filter(Boolean).join(' · ') || 'No job details'}</span>
              <div className="mt-0.5 text-xs text-slate-500">
                {p.resumeChars ? `Resume ${p.resumeFileName || '(pasted)'}, ${p.resumeChars.toLocaleString('en-IN')} characters` : 'No resume'}
                {` · ${p.answersCount} answers · ${p.storiesCount} stories · ${kb(p.sizeBytes)} in ${p.storage === 'S3' ? 'S3' : 'the database'}`}
                {` · updated ${dateTime(p.updatedAt)}${p.deviceName ? ` from ${p.deviceName}` : ''}`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" loading={busy === `view-${p.id}`} onClick={() => view(p)}>{open?.id === p.id ? 'Close' : 'View'}</Button>
              {p.hasResumeFile && <Button size="sm" variant="ghost" loading={busy === `file-${p.id}`} onClick={() => download(p)}>Resume file</Button>}
            </div>
          </div>
          {open?.id === p.id && <ProfileView data={open.data} />}
        </Card>
      ))}
      {profiles.length === 0 && <p className="text-sm text-slate-500">No profiles kept on the account.</p>}
    </div>
  );
};

const EMAIL_STATUS = { SENT: 'green', FAILED: 'red', SKIPPED: 'slate' } as const;

const SOURCE = { TRIAL: 'Trial', RAZORPAY: 'Online', OFFLINE: 'Offline', ADMIN_GRANT: 'Given', REFERRAL: 'Invite bonus', COUPON: 'Coupon', ORGANIZATION: 'College' } as const;
const toDateInput = (iso: string) => iso.slice(0, 10);
const blankToNull = (value: string) => (value.trim() === '' ? null : Number(value));

// Change what's left on a pack: its end date and limits (empty = unlimited)
const PackEditor: React.FC<{ purchase: Purchase; onDone: () => void }> = ({ purchase, onDone }) => {
  const [form, setForm] = useState({
    expiresAt: toDateInput(purchase.expiresAt),
    listeningMinutes: purchase.listeningMinutes?.toString() ?? '',
    tokenLimit: purchase.tokenLimit?.toString() ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/purchases/${purchase.id}`, {
        method: 'PATCH',
        body: {
          expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString(),
          listeningMinutes: blankToNull(form.listeningMinutes),
          tokenLimit: blankToNull(form.tokenLimit),
        },
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-3 grid gap-3 border-t border-slate-800 pt-3 sm:grid-cols-4">
      <Field label="Ends on"><Input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} required /></Field>
      <Field label="Listening (total min)" hint={`Used ${Math.round(purchase.usedSeconds / 60)}`}>
        <Input type="number" min={0} value={form.listeningMinutes} onChange={e => setForm({ ...form, listeningMinutes: e.target.value })} placeholder="Unlimited" />
      </Field>
      <Field label="Tokens (total)" hint={`Used ${tokens(purchase.usedTokens)}`}>
        <Input type="number" min={0} value={form.tokenLimit} onChange={e => setForm({ ...form, tokenLimit: e.target.value })} placeholder="Unlimited" />
      </Field>
      <div className="flex items-end gap-2">
        <Button variant="primary" size="sm" loading={busy}>Save</Button>
      </div>
      <div className="sm:col-span-4"><ErrorText>{error}</ErrorText></div>
    </form>
  );
};

export const AdminUserDetail: React.FC = () => {
  const { id } = useParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [grant, setGrant] = useState({ planId: '', mode: 'grant' as 'grant' | 'payment', reference: '', amount: '' });
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api<Detail>(`/admin/users/${id}`).then(setDetail, e => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
    api<{ plans: Plan[] }>('/admin/plans').then(r => setPlans(r.plans));
  }, [load]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await action();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!detail) return <ErrorText>{error}</ErrorText>;
  const { user, allowance } = detail;
  const selectedPlan = plans.find(p => p.id === grant.planId);

  const patchUser = (data: Partial<Pick<User, 'status' | 'role'>>, confirmText: string) =>
    window.confirm(confirmText) && run(JSON.stringify(data), () => api(`/admin/users/${user.id}`, { method: 'PATCH', body: data }));

  const resetPassword = () => {
    if (!window.confirm(`Set a new temporary password for ${user.email}? Their current password stops working.`)) return;
    run('password', async () => {
      const { password } = await api<{ password: string }>(`/admin/users/${user.id}/password`, { body: {} });
      window.prompt(`New password for ${user.email}. Copy it and send it to them; it won't be shown again.`, password);
    });
  };

  const give = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grant.planId) return;
    run('grant', () => (grant.mode === 'grant'
      ? api(`/admin/users/${user.id}/grant`, { body: { planId: grant.planId } })
      : api('/admin/payments/offline', {
        body: {
          userId: user.id, planId: grant.planId, reference: grant.reference || undefined,
          amountPaise: grant.amount ? Math.round(Number(grant.amount) * 100) : undefined,
        },
      })).then(() => setGrant({ planId: '', mode: grant.mode, reference: '', amount: '' })));
  };

  return (
    <>
      <Link to="/admin/users" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Users</Link>
      <AdminTitle title={user.name}>
        {user.status === 'ACTIVE'
          ? <Button size="sm" variant="danger" loading={busy.includes('BLOCKED')} onClick={() => patchUser({ status: 'BLOCKED' }, `Block ${user.email}? They're signed out of the app right away.`)}>Block</Button>
          : <Button size="sm" variant="primary" loading={busy.includes('ACTIVE')} onClick={() => patchUser({ status: 'ACTIVE' }, `Unblock ${user.email}?`)}>Unblock</Button>}
        {user.role === 'USER'
          ? <Button size="sm" onClick={() => patchUser({ role: 'ADMIN' }, `Make ${user.email} an admin? They'll be able to see all users and approve payments.`)}>Make admin</Button>
          : <Button size="sm" onClick={() => patchUser({ role: 'USER' }, `Remove admin rights from ${user.email}?`)}>Remove admin</Button>}
        <Button size="sm" loading={busy === 'password'} onClick={resetPassword}>Reset password</Button>
      </AdminTitle>
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-slate-300">{user.email}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <PlanBadge allowance={allowance} />
            {user.role === 'ADMIN' && <Badge tone="amber">Admin</Badge>}
            {user.status === 'BLOCKED' && <Badge tone="red">Blocked</Badge>}
          </div>
          <div className="mt-3 text-xs text-slate-500">Joined {date(user.createdAt)} · last seen {date(user.lastSeenAt ?? null)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-500">Listening left</div>
          <div className="mt-1 text-2xl font-bold text-white">{allowance.active ? hours(allowance.minutesLeft) : '–'}</div>
          <div className="mt-1 text-xs text-slate-500">until {date(allowance.expiresAt)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-500">Tokens left</div>
          <div className="mt-1 text-2xl font-bold text-white">{allowance.active ? tokens(allowance.tokensLeft) : '–'}</div>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Give a plan</h2>
      <Card>
        <form onSubmit={give} className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-end">
          <Field label="As">
            <Select value={grant.mode} onChange={e => setGrant({ ...grant, mode: e.target.value as 'grant' | 'payment' })}>
              <option value="grant">Free (no payment)</option>
              <option value="payment">Record a payment</option>
            </Select>
          </Field>
          <Field label="Plan">
            <Select value={grant.planId} onChange={e => setGrant({ ...grant, planId: e.target.value })} required>
              <option value="">Choose...</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}{p.isTrial ? ' (trial)' : ` · ${rupees(p.pricePaise)}`}{p.active ? '' : ' · hidden'}</option>)}
            </Select>
          </Field>
          {grant.mode === 'payment' ? (
            <>
              <Field label="Amount received (₹)"><Input type="number" min={0} step="0.01" value={grant.amount} onChange={e => setGrant({ ...grant, amount: e.target.value })} placeholder={selectedPlan ? String(selectedPlan.pricePaise / 100) : ''} /></Field>
              <Field label="Reference"><Input value={grant.reference} onChange={e => setGrant({ ...grant, reference: e.target.value })} placeholder="UPI ref, cash..." /></Field>
            </>
          ) : <div className="hidden sm:col-span-2 sm:block" />}
          <Button variant="primary" loading={busy === 'grant'} disabled={!grant.planId}>{grant.mode === 'grant' ? 'Give plan' : 'Record & give'}</Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">The plan starts now and is added to what they have. Use “Record a payment” for money received outside the website, so it shows in revenue.</p>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Packs</h2>
      <div className="space-y-2">
        {detail.purchases.map(p => {
          const active = new Date(p.expiresAt) > new Date();
          return (
            <Card key={p.id} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-slate-100">{p.planName}</span>{' '}
                  <Badge tone={active ? 'green' : 'slate'}>{active ? 'Active' : 'Ended'}</Badge>{' '}
                  <span className="text-xs text-slate-500">{SOURCE[p.source]} · {date(p.startsAt)} → {date(p.expiresAt)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums text-slate-400">
                  <span>{Math.round(p.usedSeconds / 60)} / {p.listeningMinutes ?? '∞'} min</span>
                  <span>{tokens(p.usedTokens)} / {tokens(p.tokenLimit)} tokens</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? 'Close' : 'Edit'}</Button>
                </div>
              </div>
              {editing === p.id && <PackEditor purchase={p} onDone={() => { setEditing(null); load(); }} />}
            </Card>
          );
        })}
        {detail.purchases.length === 0 && <p className="text-sm text-slate-500">No packs yet.</p>}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Payments</h2>
      <PaymentTable payments={detail.payments} admin />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-100">Computers</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {detail.devices.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span className="text-slate-200">{d.name} <span className="text-xs text-slate-500">· {platformName(d.platform)} {d.appVersion} · {dateTime(d.lastSeenAt)}</span></span>
                <Button size="sm" variant="ghost" loading={busy === `device-${d.id}`}
                  onClick={() => window.confirm(`Sign out ${d.name}?`) && run(`device-${d.id}`, () => api(`/admin/devices/${d.id}`, { method: 'DELETE' }))}>Remove</Button>
              </li>
            ))}
            {detail.devices.length === 0 && <li className="text-slate-500">Not signed in to the app anywhere.</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold text-slate-100">Invites and backup</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            <li>Invited by: {detail.referral.referredBy
              ? <Link to={`/admin/users/${detail.referral.referredBy.id}`} className="text-blue-400">{detail.referral.referredBy.email}</Link>
              : <span className="text-slate-500">nobody</span>}
              {detail.referral.rewardedAt && <span className="text-xs text-slate-500"> · bonus given {date(detail.referral.rewardedAt)}</span>}</li>
            <li>Friends invited: {detail.referral.invited}</li>
            <li>Cloud backup: {detail.backup
              ? `${(detail.backup.sizeBytes / 1024).toFixed(0)} KB, ${dateTime(detail.backup.updatedAt)}${detail.backup.deviceName ? ` from ${detail.backup.deviceName}` : ''}`
              : <span className="text-slate-500">none</span>}</li>
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Profiles</h2>
      {user.profileSync === false && <p className="mb-2 text-xs text-slate-500">They turned off keeping a copy of their profiles.</p>}
      <Profiles userId={user.id} profiles={detail.profiles ?? []} />

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Emails</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[560px] text-left text-xs">
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {detail.emails.map(e => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{dateTime(e.createdAt)}</td>
                <td className="px-3 py-1.5">{e.subject}</td>
                <td className="px-3 py-1.5"><Badge tone={EMAIL_STATUS[e.status]}>{e.status === 'SKIPPED' ? 'Not sent (email not set up)' : e.status === 'SENT' ? 'Sent' : 'Failed'}</Badge>
                  {e.error && <div className="mt-0.5 text-red-300">{e.error}</div>}</td>
              </tr>
            ))}
            {detail.emails.length === 0 && <tr><td className="px-3 py-4 text-center text-slate-500">No emails yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Practice and questions</h2>
      <div className="mb-3 flex flex-wrap gap-2 text-sm text-slate-300">
        <Badge tone="blue">{detail.savedAnswers} saved answers</Badge>
        <Badge>{detail.user.saveAnswers === false ? 'Saving turned off' : 'Saving on'}</Badge>
        {detail.memberships.map(m => (
          <Link key={m.organization.id} to={`/admin/organizations/${m.organization.id}`}><Badge tone="green">{m.role === 'COACH' ? 'Coach' : 'Student'} · {m.organization.name}</Badge></Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Mock interview</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 text-right font-medium">Pace</th>
              <th className="px-3 py-2 text-right font-medium">Fillers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {detail.practice.map(p => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-3 py-1.5">{dateTime(p.createdAt)} · {p.questionCount} questions</td>
                <td className="px-3 py-1.5">{p.role || '–'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{p.averageScore ?? '–'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{p.wordsPerMinute === null ? '–' : `${Math.round(p.wordsPerMinute)} wpm`}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{p.fillersPerMinute ?? '–'}/min</td>
              </tr>
            ))}
            {detail.practice.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No mock interviews yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-100">Recent usage</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">What</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {detail.usage.map(u => (
              <tr key={u.id}>
                <td className="whitespace-nowrap px-3 py-1.5">{new Date(u.createdAt).toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5">{u.kind === 'CHAT' ? 'Answer' : 'Listening'}</td>
                <td className="px-3 py-1.5 text-slate-500">{u.provider} · {u.model}</td>
                <td className="px-3 py-1.5 tabular-nums">{u.kind === 'CHAT' ? `${tokens(u.inputTokens + u.outputTokens)} tokens` : `${Math.round(u.audioSeconds)} s`}</td>
              </tr>
            ))}
            {detail.usage.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
};
