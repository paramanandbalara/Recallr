import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, dateTime, type Ticket, type TicketStatus } from '../../api';
import { TicketThread } from '../../components/TicketThread';
import { Badge, Button, Card, ErrorText } from '../../components/ui';
import { AdminTitle } from './AdminLayout';

const FILTERS: { id: TicketStatus | ''; label: string }[] = [
  { id: 'OPEN', label: 'Needs a reply' },
  { id: 'ANSWERED', label: 'Answered' },
  { id: 'CLOSED', label: 'Closed' },
  { id: '', label: 'All' },
];
const TONE = { OPEN: 'amber', ANSWERED: 'blue', CLOSED: 'slate' } as const;
const LABEL = { OPEN: 'Needs a reply', ANSWERED: 'Answered', CLOSED: 'Closed' } as const;

export const AdminSupport: React.FC = () => {
  const { id } = useParams();
  const [status, setStatus] = useState<TicketStatus | ''>('OPEN');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (id) api<{ ticket: Ticket }>(`/admin/support/${id}`).then(r => setTicket(r.ticket), e => setError(e.message));
    else api<{ tickets: Ticket[] }>(`/admin/support${status ? `?status=${status}` : ''}`).then(r => setTickets(r.tickets), e => setError(e.message));
  }, [id, status]);
  useEffect(load, [load]);

  if (id) {
    return (
      <>
        <Link to="/admin/support" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Support</Link>
        <ErrorText>{error}</ErrorText>
        {ticket && (
          <Card>
            <TicketThread
              admin
              ticket={ticket}
              onReply={async (body, close) => setTicket((await api<{ ticket: Ticket }>(`/admin/support/${ticket.id}/messages`, { body: { body, close } })).ticket)}
              actions={
                <div className="flex gap-1">
                  {ticket.user && <Link to={`/admin/users/${ticket.user.id}`} className="rounded-lg px-2.5 py-1 text-xs text-blue-300 hover:bg-slate-800">Open user</Link>}
                  <Button size="sm" variant="ghost" onClick={async () => setTicket((await api<{ ticket: Ticket }>(`/admin/support/${ticket.id}/status`, { body: { status: ticket.status === 'CLOSED' ? 'OPEN' : 'CLOSED' } })).ticket)}>
                    {ticket.status === 'CLOSED' ? 'Reopen' : 'Close'}
                  </Button>
                </div>
              }
            />
          </Card>
        )}
      </>
    );
  }

  return (
    <>
      <AdminTitle title="Support">
        <div className="flex rounded-lg border border-slate-700 p-0.5">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setStatus(f.id)}
              className={`rounded-md px-3 py-1 text-sm ${status === f.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{f.label}</button>
          ))}
        </div>
      </AdminTitle>
      <p className="mb-4 text-sm text-slate-400">Requests from users. Your reply is emailed to them. New requests are emailed to the support email in Settings.</p>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-2">
        {tickets?.map(t => (
          <Link key={t.id} to={`/admin/support/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 px-4 py-3 hover:border-slate-600">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-100">{t.subject}</div>
              <div className="text-xs text-slate-500">{t.user?.email} · {dateTime(t.updatedAt)} · {t._count?.messages} messages</div>
            </div>
            <Badge tone={TONE[t.status]}>{LABEL[t.status]}</Badge>
          </Link>
        ))}
        {tickets?.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
      </div>
    </>
  );
};
