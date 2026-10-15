import React, { useState } from 'react';
import { dateTime, type Ticket, type TicketStatus } from '../api';
import { Badge, Button, ErrorText, TextArea } from './ui';

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: 'amber' | 'blue' | 'slate' }> = {
  OPEN: { label: 'Waiting for us', tone: 'amber' },
  ANSWERED: { label: 'Answered', tone: 'blue' },
  CLOSED: { label: 'Closed', tone: 'slate' },
};

// One support conversation with a reply box. `admin`: the admin's view (their messages on the right).
export const TicketThread: React.FC<{
  ticket: Ticket;
  admin?: boolean;
  onReply: (body: string, close: boolean) => Promise<void>;
  actions?: React.ReactNode;
}> = ({ ticket, admin, onReply, actions }) => {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (close: boolean) => {
    setBusy(true);
    setError('');
    try {
      await onReply(body, close);
      setBody('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = admin && ticket.status === 'OPEN' ? { label: 'Needs a reply', tone: 'amber' as const } : TICKET_STATUS[ticket.status];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{ticket.subject}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Badge tone={status.tone}>{status.label}</Badge>
            {ticket.user && <span>{ticket.user.name} · {ticket.user.email}</span>}
          </div>
        </div>
        {actions}
      </div>

      <div className="mt-4 space-y-3">
        {ticket.messages?.map(m => {
          const mine = admin ? m.fromAdmin : !m.fromAdmin;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? 'bg-blue-600/20 text-blue-50' : 'bg-slate-800 text-slate-100'}`}>
                <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
                <div className="mt-1.5 text-[11px] text-slate-400">
                  {m.fromAdmin ? (admin ? m.author?.name ?? 'Admin' : 'Recallr support') : admin ? ticket.user?.name : 'You'} · {dateTime(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <TextArea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder={ticket.status === 'CLOSED' ? 'Write to open it again...' : 'Write a reply...'} />
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button variant="primary" loading={busy} disabled={!body.trim()} onClick={() => send(false)}>Send</Button>
          {admin && <Button loading={busy} disabled={!body.trim()} onClick={() => send(true)}>Send and close</Button>}
        </div>
      </div>
    </div>
  );
};
