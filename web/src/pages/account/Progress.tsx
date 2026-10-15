import React, { useEffect, useState } from 'react';
import { Gauge, MessageCircleWarning, Target, TrendingUp } from 'lucide-react';
import { api, date, type PracticeSession } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Card, ErrorText } from '../../components/ui';
import { ScoreChart } from '../../components/ScoreChart';

const avg = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null;
};

// Comfortable speaking pace in an interview
const PACE = { low: 110, high: 160 };

const paceNote = (wpm: number | null) =>
  wpm === null ? '' : wpm < PACE.low ? 'A little slow: aim for 110–160' : wpm > PACE.high ? 'A little fast: aim for 110–160' : 'A comfortable pace';

const Tile: React.FC<{ icon: React.ElementType; label: string; value: string; note?: string }> = ({ icon: Icon, label, value, note }) => (
  <Card className="!p-4">
    <div className="flex items-center gap-2 text-xs text-slate-400"><Icon className="h-4 w-4 text-blue-400" /> {label}</div>
    <div className="mt-2 text-2xl font-bold tabular-nums text-white">{value}</div>
    {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
  </Card>
);

// Mock interview results over time: score, speaking pace and filler words
export const AccountProgress: React.FC = () => {
  const [sessions, setSessions] = useState<PracticeSession[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ sessions: PracticeSession[] }>('/practice').then(r => setSessions(r.sessions), e => setError(e.message));
  }, []);

  const recent = sessions?.slice(0, 5) ?? [];
  const first = sessions?.length ? sessions[sessions.length - 1].averageScore : null;
  const latest = avg(recent.map(s => s.averageScore));
  const wpm = avg(recent.map(s => s.wordsPerMinute));
  const fillers = avg(recent.map(s => s.fillersPerMinute));

  return (
    <AccountPage title="Practice progress">
      <ErrorText>{error}</ErrorText>
      {sessions && sessions.length === 0 && (
        <Card className="text-sm text-slate-400">
          No mock interviews yet. In the app, open <strong className="text-slate-200">Display → Mock interview</strong>: questions are read
          out loud, you answer by voice, and each answer gets a score with feedback on your pace and filler words.
        </Card>
      )}
      {sessions && sessions.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile icon={Target} label="Recent score" value={latest === null ? '–' : `${latest} / 10`} note="Average of your last 5 mock interviews" />
            <Tile icon={TrendingUp} label="Since your first" value={latest === null || first === null ? '–' : `${latest - first >= 0 ? '+' : ''}${Math.round((latest - first) * 10) / 10}`} note={`${sessions.length} mock ${sessions.length === 1 ? 'interview' : 'interviews'}`} />
            <Tile icon={Gauge} label="Speaking pace" value={wpm === null ? '–' : `${Math.round(wpm)} wpm`} note={paceNote(wpm)} />
            <Tile icon={MessageCircleWarning} label="Filler words" value={fillers === null ? '–' : `${fillers} / min`} note="“um”, “like”, “you know”… under 3 a minute is good" />
          </div>

          {sessions.filter(s => s.averageScore !== null).length >= 2 && (
            <Card className="mt-4">
              <h2 className="text-sm font-semibold text-slate-200">Score per mock interview</h2>
              <p className="mb-3 text-xs text-slate-500">Out of 10. Hover a point (or use the arrow keys) for its pace and filler words.</p>
              <ScoreChart sessions={sessions} />
            </Card>
          )}

          <Card className="mt-4 overflow-x-auto !p-0">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 text-right font-medium">Questions</th>
                  <th className="px-4 py-2.5 text-right font-medium">Score</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pace</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fillers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-300">
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{date(s.createdAt)}</td>
                    <td className="px-4 py-2.5">{s.role || '–'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.questionCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.averageScore ?? '–'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.wordsPerMinute === null ? '–' : `${Math.round(s.wordsPerMinute)} wpm`}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.fillersPerMinute === null ? '–' : `${s.fillersPerMinute}/min`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </AccountPage>
  );
};
