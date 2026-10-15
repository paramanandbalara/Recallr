import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Flame, RotateCcw } from 'lucide-react';
import { ApiError, api, CATEGORIES, type QuestionCategory } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Button, Card, ErrorText, TextArea } from '../../components/ui';

// Account → Daily practice: the question of the day, an answer box with AI feedback, the streak and the last 14 days

interface DailyAnswer {
  answer: string;
  score: number | null;
  feedback: { good: string; improve: string; better: string } | null;
  updatedAt: string;
}

interface Daily {
  question: { id: string; date: string; text: string; category: QuestionCategory } | null;
  answer: DailyAnswer | null;
  streak: number;
  days: { date: string; done: boolean }[];
  history: { date: string; text: string; category: QuestionCategory; answered: boolean; score: number | null }[];
}

const scoreColor = (score: number) => (score >= 8 ? 'text-emerald-300' : score >= 5 ? 'text-amber-300' : 'text-red-300');
const dayLabel = (day: string, style: 'short' | 'long' = 'short') =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', style === 'short' ? { day: 'numeric', timeZone: 'UTC' } : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const AccountDaily: React.FC = () => {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api<Daily>('/daily').then(setDaily, e => setError(e.message));
  useEffect(() => { void load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!daily?.question) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ answer: DailyAnswer; streak: number }>('/daily/answer', { body: { answer: text, questionId: daily.question.id } });
      setDaily({ ...daily, answer: r.answer, streak: r.streak, days: daily.days.map((d, i) => (i === daily.days.length - 1 ? { ...d, done: true } : d)) });
      setEditing(false);
      setText('');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 402 ? `${err.message} You can buy a top-up under Buy a plan.` : (err as Error).message);
      if (err instanceof ApiError && err.code === 'NEW_DAY') void load();
    } finally {
      setBusy(false);
    }
  };

  const answer = daily?.answer;
  const showForm = !!daily?.question && (!answer || editing);

  return (
    <AccountPage title="Daily practice">
      <ErrorText>{error}</ErrorText>
      {daily && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <CalendarCheck className="h-4 w-4 text-blue-400" /> Question of the day
                </span>
                {daily.question && <span className="text-xs text-slate-500">{CATEGORIES[daily.question.category]?.label} · {dayLabel(daily.question.date, 'long')}</span>}
              </div>
              {daily.question
                ? <p className="mt-3 text-lg font-semibold leading-snug text-white">{daily.question.text}</p>
                : <p className="mt-3 text-sm text-slate-400">Today’s question is being prepared. Check back in a minute.</p>}

              {showForm && (
                <form onSubmit={submit} className="mt-4 space-y-3">
                  <TextArea rows={7} value={text} onChange={e => setText(e.target.value)} maxLength={6000}
                    placeholder="Write your answer the way you’d say it in the interview. In the Recallr app you can also answer out loud." />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" loading={busy} disabled={!text.trim()}>Get feedback</Button>
                    {editing && <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
                    <span className="text-xs text-slate-500">The AI feedback uses a little of your plan.</span>
                  </div>
                </form>
              )}

              {answer && !editing && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{answer.answer}</div>
                  {answer.score !== null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-3xl font-bold tabular-nums ${scoreColor(answer.score)}`}>{answer.score}</span>
                      <span className="text-sm text-slate-500">/ 10</span>
                    </div>
                  )}
                  {answer.feedback?.good && <p className="text-sm text-slate-300"><span className="font-semibold text-emerald-300">What worked: </span>{answer.feedback.good}</p>}
                  {answer.feedback?.improve && <p className="text-sm text-slate-300"><span className="font-semibold text-amber-300">To improve: </span>{answer.feedback.improve}</p>}
                  {answer.feedback?.better && (
                    <div className="rounded-lg border border-slate-800 p-3">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">A stronger answer</div>
                      <p className="text-sm leading-relaxed text-slate-200">{answer.feedback.better}</p>
                    </div>
                  )}
                  <Button size="sm" onClick={() => { setText(answer.answer); setEditing(true); }}><RotateCcw className="h-3.5 w-3.5" /> Try again</Button>
                </div>
              )}
            </Card>

            {daily.history.length > 0 && (
              <Card>
                <h2 className="font-semibold text-slate-100">Earlier questions</h2>
                <ul className="mt-3 divide-y divide-slate-800">
                  {daily.history.map(h => (
                    <li key={h.date} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">{dayLabel(h.date, 'long')} · {CATEGORIES[h.category]?.label}</div>
                        <div className="text-slate-300">{h.text}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {h.answered ? <span className={h.score !== null ? scoreColor(h.score) : 'text-slate-300'}>{h.score !== null ? `${h.score} / 10` : 'Answered'}</span> : <span className="text-slate-600">Missed</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-2 text-xs text-slate-400"><Flame className="h-4 w-4 text-amber-400" /> Streak</div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-white">{daily.streak} {daily.streak === 1 ? 'day' : 'days'}</div>
              <p className="mt-1 text-xs text-slate-500">Days in a row with the question of the day, a mock interview or practice with a friend.</p>
              <div className="mt-4 grid grid-cols-7 gap-1.5">
                {daily.days.map(d => (
                  <div key={d.date} title={dayLabel(d.date, 'long')}
                    className={`flex aspect-square items-center justify-center rounded-md text-[10px] tabular-nums ${d.done ? 'bg-emerald-500/25 text-emerald-200' : 'bg-slate-800/60 text-slate-500'}`}>
                    {dayLabel(d.date)}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-600">The last 14 days</p>
            </Card>
            <Card className="text-xs leading-relaxed text-slate-400">
              Want the question on WhatsApp every morning? Turn it on under <Link to="/account/settings#whatsapp" className="text-blue-400 hover:text-blue-300">Settings → WhatsApp</Link>.
            </Card>
          </div>
        </div>
      )}
    </AccountPage>
  );
};
