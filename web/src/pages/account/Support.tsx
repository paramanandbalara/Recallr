import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, dateTime, type Ticket } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { TICKET_STATUS, TicketThread } from '../../components/TicketThread';
import { Badge, Button, Card, ErrorText, Field, Input, TextArea } from '../../components/ui';

const NewRequest: React.FC<{ onCreated: (id: string) => void; onCancel: () => void }> = ({ onCreated, onCancel }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { ticket } = await api<{ ticket: Ticket }>('/support', { body: { subject, body } });
      onCreated(ticket.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Subject"><Input autoFocus value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Paid by UPI but the plan isn't active" required /></Field>
        <Field label="Message" hint="For payments, add the UPI reference. For app problems, say what you clicked and what happened.">
          <TextArea rows={5} value={body} onChange={e => setBody(e.target.value)} required />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button variant="primary" loading={busy}>Send</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
};

export const AccountSupport: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (id) api<{ ticket: Ticket }>(`/support/${id}`).then(r => setTicket(r.ticket), e => setError(e.message));
    else api<{ tickets: Ticket[] }>('/support').then(r => setTickets(r.tickets), e => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (id) {
    return (
      <AccountPage title="Support">
        <Link to="/account/support" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> All requests</Link>
        <ErrorText>{error}</ErrorText>
        {ticket && (
          <Card>
            <TicketThread
              ticket={ticket}
              onReply={async body => setTicket((await api<{ ticket: Ticket }>(`/support/${ticket.id}/messages`, { body: { body } })).ticket)}
              actions={ticket.status !== 'CLOSED' && (
                <Button size="sm" variant="ghost" onClick={async () => { await api(`/support/${ticket.id}/close`, { body: {} }); load(); }}>Mark as solved</Button>
              )}
            />
          </Card>
        )}
      </AccountPage>
    );
  }

  return (
    <AccountPage title="Support">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Ask us anything about your account, payments or the app. We usually reply within a working day, and email you when we do.</p>
        {!creating && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New request</Button>}
      </div>
      {creating && <NewRequest onCreated={newId => navigate(`/account/support/${newId}`)} onCancel={() => setCreating(false)} />}
      <ErrorText>{error}</ErrorText>
      <div className="space-y-2">
        {tickets?.map(t => (
          <Link key={t.id} to={`/account/support/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 px-4 py-3 hover:border-slate-600">
            <div>
              <div className="text-sm font-medium text-slate-100">{t.subject}</div>
              <div className="text-xs text-slate-500">Updated {dateTime(t.updatedAt)} · {t._count?.messages} {t._count?.messages === 1 ? 'message' : 'messages'}</div>
            </div>
            <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
          </Link>
        ))}
        {tickets?.length === 0 && !creating && <p className="text-sm text-slate-500">No requests yet. Many answers are in the <Link to="/guide" className="text-blue-400">guide</Link>.</p>}
      </div>
    </AccountPage>
  );
};
