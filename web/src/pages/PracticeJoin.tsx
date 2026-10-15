import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Loader2, MessageSquarePlus, SkipForward, Star, Users } from 'lucide-react';
import { ApiError, api, getToken } from '../api';
import { useAuth } from '../auth';
import { Button, Card, ErrorText, Input } from '../components/ui';

// /practice/join/:code — the link to a "Practise with a friend" room. The candidate answers in the Recallr app (it
// listens to their microphone); the interviewer can join right here and run the interview from the browser.

interface PeerQuestion { id: string; text: string; source: 'resume' | 'common' | 'own'; kind?: string }
interface PeerTurn {
  id: string;
  question: string;
  status: 'asked' | 'answering' | 'scoring' | 'scored' | 'failed' | 'skipped';
  transcript: string;
  ai?: { score: number | null; good: string; improve: string; better: string };
  aiError?: string;
  rating?: { stars: number; comment: string };
}
interface PeerRoom {
  code: string;
  status: 'WAITING' | 'ACTIVE' | 'ENDED';
  role: 'interviewer' | 'candidate';
  hostRole: 'interviewer' | 'candidate';
  host: { name: string; me: boolean };
  guest: { name: string; me: boolean } | null;
  candidate: { summary: string };
  questions: PeerQuestion[];
  turns: PeerTurn[];
  current: string | null;
  updatedAt: string;
  summary: { asked: number; answered: number; averageScore: number | null; averageRating: number | null } | null;
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const POLL_MS = 1500;
const KINDS: Record<string, string> = { 'about-you': 'About you', project: 'Project', skill: 'Skills', behavioural: 'Behavioural', situational: 'Situational' };

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-300' : score >= 5 ? 'text-amber-300' : 'text-red-300');

// The room, or null when it hasn't changed since `etag` (304)
const poll = async (code: string, etag: string) => {
  const token = getToken();
  const res = await fetch(`${BASE}/api/peer/${encodeURIComponent(code)}`, {
    cache: 'no-store',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(etag ? { 'If-None-Match': etag } : {}) },
  });
  if (res.status === 304) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong.', data.code);
  return { room: data.room as PeerRoom, etag: res.headers.get('ETag') ?? '' };
};

const Stars: React.FC<{ value: number; onChange?: (n: number) => void }> = ({ value, onChange }) => (
  <span className="inline-flex gap-0.5">
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} title={`${n} of 5`} className="disabled:cursor-default">
        <Star className={`h-5 w-5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
      </button>
    ))}
  </span>
);

const AiScore: React.FC<{ turn: PeerTurn }> = ({ turn }) => {
  if (turn.status === 'scoring') return <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> The AI is scoring the answer…</p>;
  if (turn.status === 'failed') return <p className="text-sm text-amber-300">{turn.aiError || 'The AI could not score this answer.'}</p>;
  if (!turn.ai) return null;
  return (
    <div className="space-y-2">
      {turn.ai.score !== null && (
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold tabular-nums ${scoreColor(turn.ai.score)}`}>{turn.ai.score}</span>
          <span className="text-sm text-slate-500">/ 10 · AI score</span>
        </div>
      )}
      {turn.ai.good && <p className="text-sm text-slate-300"><span className="font-semibold text-emerald-300">What worked: </span>{turn.ai.good}</p>}
      {turn.ai.improve && <p className="text-sm text-slate-300"><span className="font-semibold text-amber-300">To improve: </span>{turn.ai.improve}</p>}
      {turn.ai.better && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">A stronger answer</summary>
          <p className="mt-1 leading-relaxed text-slate-200">{turn.ai.better}</p>
        </details>
      )}
    </div>
  );
};

const OpenTheApp: React.FC<{ code: string }> = ({ code }) => (
  <p className="text-sm leading-relaxed text-slate-300">
    To answer as the candidate, open the <strong className="text-white">Recallr app</strong> → Display menu → <strong className="text-white">Practise with a friend</strong> → Join,
    and enter the code <strong className="font-mono tracking-widest text-white">{code}</strong>. The app listens to your microphone while you answer.
    {' '}<Link to="/download" className="text-blue-400 hover:text-blue-300">Download Recallr</Link>
  </p>
);

export const PracticeJoin: React.FC = () => {
  const { code: rawCode = '' } = useParams();
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const { user, loading } = useAuth();
  const [room, setRoom] = useState<PeerRoom | null>(null);
  const [checked, setChecked] = useState(false); // Looked for the room as a member
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState('');
  const [own, setOwn] = useState('');
  const [draft, setDraft] = useState({ turnId: '', stars: 0, comment: '' });
  const etagRef = useRef('');

  const apply = useCallback((next: PeerRoom) => setRoom(prev => (!prev || next.updatedAt >= prev.updatedAt ? next : prev)), []);

  // Already in the room (e.g. the page was reloaded)?
  useEffect(() => {
    if (loading || !user) return;
    poll(code, '').then(r => { if (r) { etagRef.current = r.etag; apply(r.room); } }, () => {}).finally(() => setChecked(true));
  }, [code, user, loading, apply]);

  const scoring = room?.turns.some(t => t.status === 'scoring');
  const polling = !!room && (room.status !== 'ENDED' || scoring);
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await poll(code, etagRef.current);
        if (stopped) return;
        if (r) {
          etagRef.current = r.etag;
          apply(r.room);
        }
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410 || err.status === 401)) {
          setError(err.message);
          return;
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [polling, code, apply]);

  const act = async (name: string, path: string, body: object = {}) => {
    setBusy(name);
    setError('');
    setErrorCode('');
    try {
      apply((await api<{ room: PeerRoom }>(`/peer${path}`, { body })).room);
      return true;
    } catch (err) {
      setError((err as Error).message);
      setErrorCode(err instanceof ApiError ? err.code ?? '' : '');
      return false;
    } finally {
      setBusy('');
    }
  };

  const turns = room?.turns ?? [];
  const current = turns.length ? turns[turns.length - 1] : null;
  const asked = new Set(turns.map(t => t.question));
  const nextUnasked = room?.questions.find(q => !asked.has(q.text));
  const friend = room ? (room.host.me ? room.guest?.name : room.host.name) ?? '' : '';
  const stars = current && draft.turnId === current.id ? draft.stars : 0;
  const comment = current && draft.turnId === current.id ? draft.comment : '';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Users className="h-6 w-6 text-blue-400" /> Practise with a friend</h1>
      <p className="mt-1 text-sm text-slate-400">
        Code <span className="font-mono tracking-widest text-slate-200">{code}</span>. Talk on any call app (Meet, Zoom or a phone call); Recallr shows the
        questions, the answer as it’s said, and an AI score.
      </p>

      <div className="mt-6 space-y-4">
        <ErrorText>{error}</ErrorText>

        {!loading && !user && (
          <Card className="space-y-4">
            <OpenTheApp code={code} />
            <div className="border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-300">Asking the questions? You can be the interviewer right here in the browser.</p>
              <Link to={`/login?next=${encodeURIComponent(`/practice/join/${code}`)}`}><Button variant="primary" className="mt-3">Sign in to join as the interviewer</Button></Link>
            </div>
          </Card>
        )}

        {user && checked && !room && (
          <Card className="space-y-4">
            {errorCode === 'APP_NEEDED' ? <OpenTheApp code={code} /> : (
              <>
                <p className="text-sm text-slate-300">Join as the <strong className="text-white">interviewer</strong>: you read the questions to your friend and rate each answer. Your friend answers in the Recallr app.</p>
                <Button variant="primary" loading={busy === 'join'} onClick={() => act('join', '/join', { code })}>Join as the interviewer</Button>
                <div className="border-t border-slate-800 pt-4"><OpenTheApp code={code} /></div>
              </>
            )}
          </Card>
        )}

        {room && room.role === 'candidate' && room.status !== 'ENDED' && <Card><OpenTheApp code={code} /></Card>}

        {room && room.status === 'WAITING' && room.role === 'interviewer' && (
          <Card className="text-center">
            <p className="text-sm text-slate-300">Share the code <span className="font-mono tracking-widest text-white">{room.code}</span> with your friend. They join from the Recallr app.</p>
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for your friend…</p>
          </Card>
        )}

        {room && room.status === 'ACTIVE' && room.role === 'interviewer' && (
          <>
            {room.candidate.summary && <p className="text-sm text-slate-400"><span className="font-semibold text-slate-300">Candidate ({friend}): </span>{room.candidate.summary}</p>}
            {current ? (
              <Card className="space-y-3 !border-blue-500/40">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question {turns.length} · read it out loud</div>
                <p className="text-lg font-semibold leading-snug text-white">{current.question}</p>
                {current.status === 'asked' && <p className="text-sm text-slate-500">Waiting for the answer…</p>}
                {current.status === 'answering' && <p className="text-sm text-slate-500">Answering…</p>}
                {current.status === 'skipped' && <p className="text-sm text-slate-500">Skipped</p>}
                {current.transcript && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Their answer</div>
                    <p className="text-sm leading-relaxed text-slate-200">{current.transcript}</p>
                  </div>
                )}
                <AiScore turn={current} />
                {current.status !== 'skipped' && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <div className="flex items-center gap-2 text-sm text-slate-400">Your rating <Stars value={stars || current.rating?.stars || 0} onChange={n => setDraft({ turnId: current.id, stars: n, comment })} /></div>
                    {current.rating && !stars ? (current.rating.comment && <p className="text-sm italic text-slate-400">“{current.rating.comment}”</p>) : (
                      <div className="flex gap-2">
                        <Input value={comment} maxLength={1000} onChange={e => setDraft({ turnId: current.id, stars, comment: e.target.value })} placeholder="A comment for them (optional)" />
                        <Button disabled={!stars} loading={busy === 'rate'} onClick={() => act('rate', `/${room.code}/rate`, { turnId: current.id, stars, comment }).then(ok => { if (ok) setDraft({ turnId: '', stars: 0, comment: '' }); })}>Save</Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ) : <p className="text-sm text-slate-300">{friend} has joined. Ask the first question.</p>}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={busy === 'next'} disabled={!nextUnasked} onClick={() => act('next', `/${room.code}/ask`, { questionId: nextUnasked!.id })}>
                <SkipForward className="h-4 w-4" /> {current ? 'Next question' : 'Ask the first question'}
              </Button>
              <Button variant="ghost" loading={busy === 'end'} onClick={() => act('end', `/${room.code}/end`)}>End practice</Button>
            </div>
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); act('own', `/${room.code}/ask`, { text: own }).then(ok => { if (ok) setOwn(''); }); }}>
              <Input value={own} maxLength={400} onChange={e => setOwn(e.target.value)} placeholder="Ask your own question…" />
              <Button loading={busy === 'own'} disabled={own.trim().length < 3}><MessageSquarePlus className="h-4 w-4" /> Ask</Button>
            </form>

            {([['resume', 'From their resume'], ['own', 'Your questions'], ['common', 'Common questions']] as const).map(([source, title]) => {
              const list = room.questions.filter(q => q.source === source);
              if (!list.length) return null;
              return (
                <Card key={source} className="!p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
                  <ul className="space-y-1">
                    {list.map(q => (
                      <li key={q.id} className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-800/50">
                        <span className={`flex-1 text-sm ${asked.has(q.text) ? 'text-slate-600' : 'text-slate-300'}`}>
                          {q.text}{q.kind && KINDS[q.kind] && <span className="ml-1 text-xs text-slate-500">· {KINDS[q.kind]}</span>}
                        </span>
                        {asked.has(q.text) ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" /> : (
                          <button disabled={!!busy} onClick={() => act('ask', `/${room.code}/ask`, { questionId: q.id })} className="shrink-0 text-sm font-medium text-blue-400 hover:text-blue-300 disabled:opacity-40">Ask</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </>
        )}

        {room && room.status === 'ENDED' && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Card className="!p-4"><div className="text-2xl font-bold text-white">{room.summary?.answered ?? 0}/{room.summary?.asked ?? 0}</div><div className="text-xs text-slate-500">answered</div></Card>
              <Card className="!p-4"><div className={`text-2xl font-bold ${typeof room.summary?.averageScore === 'number' ? scoreColor(room.summary.averageScore) : 'text-slate-500'}`}>{room.summary?.averageScore ?? '–'}</div><div className="text-xs text-slate-500">AI score</div></Card>
              <Card className="!p-4"><div className="text-2xl font-bold text-amber-300">{room.summary?.averageRating ?? '–'}</div><div className="text-xs text-slate-500">rating (of 5)</div></Card>
            </div>
            {turns.map((turn, i) => (
              <Card key={turn.id} className="space-y-2 !p-4">
                <p className="font-medium text-slate-100">{i + 1}. {turn.question}</p>
                {turn.status === 'skipped' ? <p className="text-sm text-slate-500">Skipped</p> : (
                  <>
                    {turn.transcript && <p className="text-sm text-slate-400">{turn.transcript}</p>}
                    <AiScore turn={turn} />
                    {turn.rating && <div className="flex items-center gap-2 text-sm text-slate-400">Rating <Stars value={turn.rating.stars} />{turn.rating.comment && <span className="italic">“{turn.rating.comment}”</span>}</div>}
                  </>
                )}
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
