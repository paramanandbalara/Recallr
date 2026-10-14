import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Plus } from 'lucide-react';
import { api, date, hours, ORGANIZATION_KINDS, type Organization, type OrganizationDetail, type OrganizationKind } from '../../api';
import { Badge, Button, Card, ErrorText, Field, Input, Select, TextArea } from '../../components/ui';
import { OrganizationDashboard } from '../account/Organization';
import { AdminTitle } from './AdminLayout';

interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  size: number | null;
  message: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: string;
}

const EMPTY = { name: '', kind: 'COLLEGE' as OrganizationKind, seats: '50', memberMinutes: '600', memberDays: '90', contactEmail: '', notes: '' };

// Colleges, bootcamps and companies with seats, plus the enquiries from the website
export const AdminOrganizations: React.FC = () => {
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ organizations: Organization[] }>('/admin/organizations').then(r => setOrgs(r.organizations), e => setError(e.message));
    api<{ enquiries: Enquiry[] }>('/admin/enquiries').then(r => setEnquiries(r.enquiries), () => {});
  }, []);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      await api('/admin/organizations', {
        body: {
          name: form.name, kind: form.kind, seats: Number(form.seats), memberDays: Number(form.memberDays),
          memberMinutes: form.memberMinutes ? Number(form.memberMinutes) : null, memberTokens: null,
          contactEmail: form.contactEmail, notes: form.notes,
        },
      });
      setForm(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: Enquiry['status']) => {
    await api(`/admin/enquiries/${id}`, { method: 'PATCH', body: { status } });
    setEnquiries(list => list.map(x => (x.id === id ? { ...x, status } : x)));
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => f && { ...f, [key]: e.target.value });

  return (
    <>
      <AdminTitle title="Colleges and bootcamps">
        {!form && <Button variant="primary" onClick={() => setForm(EMPTY)}><Plus className="h-4 w-4" /> New organization</Button>}
      </AdminTitle>
      {form && (
        <Card className="mb-6">
          <form onSubmit={create} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name"><Input required value={form.name} onChange={set('name')} /></Field>
              <Field label="Type">
                <Select value={form.kind} onChange={set('kind')}>
                  {(Object.keys(ORGANIZATION_KINDS) as OrganizationKind[]).map(k => <option key={k} value={k}>{ORGANIZATION_KINDS[k]}</option>)}
                </Select>
              </Field>
              <Field label="Contact email"><Input type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field>
              <Field label="Seats (students)"><Input required type="number" min={1} value={form.seats} onChange={set('seats')} /></Field>
              <Field label="Listening per student (minutes)" hint="Empty = unlimited"><Input type="number" min={1} value={form.memberMinutes} onChange={set('memberMinutes')} /></Field>
              <Field label="Days each student's pack lasts"><Input required type="number" min={1} value={form.memberDays} onChange={set('memberDays')} /></Field>
            </div>
            <Field label="Notes (only admins see them)"><TextArea rows={2} value={form.notes} onChange={set('notes')} placeholder="Price agreed, invoice number…" /></Field>
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={busy}>Create</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            </div>
            <p className="text-xs text-slate-500">After creating it, add the coach (they need an account) and send them the invite link.</p>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {orgs?.map(o => (
          <Link key={o.id} to={`/admin/organizations/${o.id}`} className="block">
            <Card className="flex flex-wrap items-center justify-between gap-3 !p-4 hover:border-slate-700">
              <div>
                <div className="font-medium text-slate-100">{o.name} <span className="text-xs text-slate-500">· {ORGANIZATION_KINDS[o.kind]}</span></div>
                <div className="text-xs text-slate-500">
                  {o.memberMinutes === null ? 'Unlimited' : hours(o.memberMinutes)} for {o.memberDays} days per student · {o.coaches ?? 0} {o.coaches === 1 ? 'coach' : 'coaches'} · since {date(o.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-slate-300">{o.seatsUsed} / {o.seats} seats</span>
                {o.open ? <Badge tone="green">Open</Badge> : <Badge>Closed</Badge>}
              </div>
            </Card>
          </Link>
        ))}
        {orgs && orgs.length === 0 && !form && <p className="text-sm text-slate-500">No organizations yet.</p>}
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold text-white">Enquiries from the website</h2>
      <div className="space-y-2">
        {enquiries.map(e => (
          <Card key={e.id} className="!p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-slate-100">{e.organization}{e.size ? <span className="text-sm text-slate-400"> · {e.size} students</span> : null}</div>
                <div className="text-sm text-slate-400">{e.name} · <a href={`mailto:${e.email}`} className="text-blue-400">{e.email}</a>{e.phone && ` · ${e.phone}`}</div>
                {e.message && <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{e.message}</p>}
                <div className="mt-1 text-xs text-slate-500">{date(e.createdAt)}</div>
              </div>
              <Select value={e.status} onChange={ev => setStatus(e.id, ev.target.value as Enquiry['status'])} className="!w-auto">
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="CLOSED">Closed</option>
              </Select>
            </div>
          </Card>
        ))}
        {enquiries.length === 0 && <p className="text-sm text-slate-500">No enquiries yet. They come from the website’s “For colleges” page.</p>}
      </div>
    </>
  );
};

// One organization: the coach's dashboard plus coaches, seats and closing it
export const AdminOrganizationDetail: React.FC = () => {
  const { id = '' } = useParams();
  const [name, setName] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [error, setError] = useState('');

  return (
    <>
      <Link to="/admin/organizations" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ChevronLeft className="h-4 w-4" /> All organizations</Link>
      <AdminTitle title={name || 'Organization'} />
      <OrganizationDashboard
        id={id}
        base={`/admin/organizations/${id}`}
        adminActions={(detail: OrganizationDetail, reload) => {
          if (detail.organization.name !== name) setTimeout(() => setName(detail.organization.name));
          const org = detail.organization;
          const patch = async (body: object) => {
            setError('');
            try {
              await api(`/admin/organizations/${id}`, { method: 'PATCH', body });
              reload();
            } catch (err) {
              setError((err as Error).message);
            }
          };
          return (
            <Card className="space-y-4 !p-4">
              <div>
                <div className="text-sm font-semibold text-slate-200">Coaches</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.coaches.map(c => (
                    <span key={c.userId} className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                      {c.name} · {c.email}
                      <button className="text-slate-500 hover:text-red-300" title="Remove coach" onClick={async () => { await api(`/admin/organizations/${id}/coaches/${c.userId}`, { method: 'DELETE' }); reload(); }}>×</button>
                    </span>
                  ))}
                  {detail.coaches.length === 0 && <span className="text-xs text-slate-500">No coach yet.</span>}
                </div>
                <form className="mt-2 flex gap-2" onSubmit={async e => {
                  e.preventDefault();
                  setError('');
                  try {
                    await api(`/admin/organizations/${id}/coaches`, { body: { email: coachEmail } });
                    setCoachEmail('');
                    reload();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}>
                  <Input type="email" required value={coachEmail} onChange={e => setCoachEmail(e.target.value)} placeholder="coach@college.edu" className="!w-64" />
                  <Button type="submit" size="sm">Add coach</Button>
                </form>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                <Button size="sm" onClick={() => { const seats = window.prompt('Number of seats', String(org.seats)); if (seats) patch({ seats: Number(seats) }); }}>Change seats</Button>
                <Button size="sm" onClick={() => patch({ active: !org.active })}>{org.active ? 'Close to new students' : 'Open to new students'}</Button>
                <Button size="sm" variant="ghost" onClick={() => window.confirm('Make a new invite link? The old one stops working.') && patch({ newInviteCode: true })}>New invite link</Button>
              </div>
              {org.notes && <p className="text-xs text-slate-500">Notes: {org.notes}</p>}
              <ErrorText>{error}</ErrorText>
            </Card>
          );
        }}
      />
    </>
  );
};
