import React, { useEffect, useState } from 'react';
import { X, Search, Trash2, MessagesSquare, ClipboardCheck, FileText, FileDown } from 'lucide-react';
import { deleteSession, listSessions, loadSession, type SessionSummary } from '../services/sessions';
import { exportSession } from '../services/exportSession';
import { IconButton, TextInput } from './ui';

interface Props {
  currentId: string;
  canOpen: boolean; // Opening another conversation isn't allowed while listening
  onOpen: (id: string) => void;
  onReview: (id: string) => void;
  onClose: () => void;
  refreshKey?: unknown; // Reload the list when this changes (e.g. after a review was written)
}

const SEARCH_DELAY_MS = 200;

const formatDate = (time: number) => new Date(time).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

// Past conversations: search, reopen or delete
export const HistoryPanel: React.FC<Props> = ({ currentId, canOpen, onOpen, onReview, onClose, refreshKey }) => {
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [notice, setNotice] = useState('');

  const showNotice = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 2500);
  };

  const exportAs = async (id: string, kind: 'md' | 'pdf') => {
    try {
      const saved = await loadSession(id);
      if (!saved) throw new Error('missing');
      if (await exportSession(saved, kind)) showNotice(`Saved as ${kind === 'pdf' ? 'PDF' : 'Markdown'}.`);
    } catch (error) {
      console.error('Export error:', error);
      showNotice('Could not export this conversation.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      listSessions(query).then(list => !cancelled && setSessions(list), () => !cancelled && setSessions([]));
    }, query ? SEARCH_DELAY_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, reloadCount, refreshKey]);

  const remove = async (session: SessionSummary) => {
    if (!window.confirm(`Delete "${session.title}"? This can't be undone.`)) return;
    await deleteSession(session.id);
    setReloadCount(n => n + 1);
  };

  return (
    <div className="panel-in absolute inset-0 z-50 flex flex-col bg-slate-900">
      <div className="drag-area flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <h2 className="text-sm font-semibold text-slate-100">History</h2>
        <IconButton onClick={onClose} title="Close">
          <X className="w-4 h-4" />
        </IconButton>
      </div>

      <div className="px-3 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <TextInput
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search questions and answers..."
            className="!pl-8 !py-1.5 text-xs"
          />
        </div>
        {!canOpen && <p className="mt-2 text-[11px] text-amber-300">Stop listening to open another conversation.</p>}
        {notice && <p className="mt-2 text-[11px] text-emerald-300">{notice}</p>}
      </div>

      <div className="scrollable flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {sessions?.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-12 text-center">
            <MessagesSquare className="w-6 h-6 text-slate-600" />
            <p className="text-xs text-slate-400">
              {query ? 'No conversations match your search.' : 'Conversations are saved here once they have an answer.'}
            </p>
          </div>
        )}
        {sessions?.map(session => {
          const isCurrent = session.id === currentId;
          return (
            <div
              key={session.id}
              className={`group flex items-start gap-2 rounded-lg border px-3 py-2 ${
                isCurrent ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <button
                className="min-w-0 flex-1 text-left disabled:cursor-default"
                disabled={isCurrent || !canOpen}
                onClick={() => onOpen(session.id)}
                title={isCurrent ? 'This is the current conversation' : 'Open this conversation'}
              >
                <div className="truncate text-xs font-medium text-slate-200">{session.title}</div>
                <div className="mt-0.5 truncate text-[10px] text-slate-500">
                  {formatDate(session.updatedAt)} · {session.questionCount} {session.questionCount === 1 ? 'answer' : 'answers'}
                  {session.profileName && ` · ${session.profileName}`}
                </div>
              </button>
              <div className="flex shrink-0 items-center">
                {isCurrent && (
                  <span className="mr-1 rounded-full bg-blue-500/15 px-1.5 py-px text-[10px] font-medium text-blue-300">Current</span>
                )}
                <div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton title={session.hasReview ? 'See the review' : 'Review this interview'} onClick={() => onReview(session.id)}>
                    <ClipboardCheck className={`w-3.5 h-3.5 ${session.hasReview ? 'text-emerald-400' : ''}`} />
                  </IconButton>
                  <IconButton title="Export as Markdown" onClick={() => exportAs(session.id, 'md')}>
                    <FileText className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton title="Export as PDF" onClick={() => exportAs(session.id, 'pdf')}>
                    <FileDown className="w-3.5 h-3.5" />
                  </IconButton>
                  {!isCurrent && (
                    <IconButton tone="danger" title="Delete" onClick={() => remove(session)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
