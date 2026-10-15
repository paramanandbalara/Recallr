import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, GraduationCap, Users } from 'lucide-react';
import { api, date, hours, inviteLink, ORGANIZATION_KINDS, type OrganizationDetail, type OrganizationKind } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Badge, Button, Card, ErrorText } from '../../components/ui';

interface Membership {
  role: 'COACH' | 'STUDENT';
  joinedAt: string;
  organization: { id: string; name: string; kind: OrganizationKind };
}

const scoreTone = (score: number | null) => (score === null ? 'slate' : score >= 7 ? 'green' : score >= 5 ? 'amber' : 'red');

// A coach's view of one organization: seats, invite link, and each student's practice progress
export const OrganizationDashboard: React.FC<{ id: string; adminActions?: (detail: OrganizationDetail, reload: () => void) => React.ReactNode; base?: string }> = ({ id, adminActions, base = `/organizations/${id}` }) => {
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => { api<OrganizationDetail>(base).then(setDetail, e => setError(e.message)); }, [base]);
  useEffect(load, [load]);

  if (!detail) return <ErrorText>{error}</ErrorText>;
  const { organization: org, students } = detail;
  const link = inviteLink(org.inviteCode);

  const remove = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name}? Their Recallr pack from ${org.name} ends now, and the seat is free for someone else.`)) return;
    setBusy(userId);
    try {
      await api(`${base}/students/${userId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const practising = students.filter(s => s.mockInterviews > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="!p-4">
          <div className="text-xs text-slate-400">Seats used</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">{org.seatsUsed} / {org.seats}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, (org.seatsUsed / org.seats) * 100)}%` }} />
          </div>
        </Card>
        <Card className="!p-4">
          <div className="text-xs text-slate-400">Practising</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">{practising}</div>
          <div className="mt-1 text-xs text-slate-500">students with at least one mock interview</div>
        </Card>
        <Card className="!p-4">
          <div className="text-xs text-slate-400">Each student gets</div>
          <div className="mt-1 text-lg font-semibold text-white">{org.memberMinutes === null ? 'Unlimited listening' : `${hours(org.memberMinutes)} of listening`}</div>
          <div className="mt-1 text-xs text-slate-500">for {org.memberDays} days from joining</div>
        </Card>
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-200">Invite link</div>
            <div className="mt-0.5 truncate font-mono text-xs text-slate-400">{link}</div>
            <div className="mt-1 text-xs text-slate-500">
              {org.open ? 'Share it with your students. Anyone with the link can join while seats are left.' : 'Not taking new students: all seats are used, or it was closed.'}
            </div>
          </div>
          <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      </Card>

      {adminActions?.(detail, load)}
      <ErrorText>{error}</ErrorText>

      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-800 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 text-right font-medium">Mock interviews</th>
              <th className="px-4 py-2.5 text-right font-medium">Recent score</th>
              <th className="px-4 py-2.5 text-right font-medium">Pace</th>
              <th className="px-4 py-2.5 text-right font-medium">Fillers</th>
              <th className="px-4 py-2.5 text-right font-medium">Listening used</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-slate-300">
            {students.map(s => (
              <tr key={s.userId}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-100">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.email}</div>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-xs">{date(s.joinedAt)}<div className="text-slate-500">last seen {date(s.lastSeenAt)}</div></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{s.mockInterviews}<div className="text-xs text-slate-500">{s.lastPracticeAt ? date(s.lastPracticeAt) : 'none yet'}</div></td>
                <td className="px-4 py-2.5 text-right">
                  {s.recentScore === null ? '–' : <Badge tone={scoreTone(s.recentScore)}>{s.recentScore} / 10</Badge>}
                  {s.recentScore !== null && s.firstScore !== null && s.mockInterviews > 1 && (
                    <div className="mt-0.5 text-xs tabular-nums text-slate-500">from {s.firstScore}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{s.wordsPerMinute === null ? '–' : `${Math.round(s.wordsPerMinute)} wpm`}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{s.fillersPerMinute === null ? '–' : `${s.fillersPerMinute}/min`}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{hours(s.listeningMinutesUsed)}</td>
                <td className="px-4 py-2.5 text-right"><Button size="sm" variant="ghost" loading={busy === s.userId} onClick={() => remove(s.userId, s.name)}>Remove</Button></td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No students yet. Share the invite link to get started.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">You see scores and speaking feedback from mock interviews, never students’ interview questions or answers.</p>
    </div>
  );
};

// The organizations the user belongs to; coaches get the dashboard
export const AccountOrganization: React.FC = () => {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<{ memberships: Membership[] }>('/organizations/mine').then(r => setMemberships(r.memberships), e => setError(e.message)); }, []);
  const coached = memberships?.filter(m => m.role === 'COACH') ?? [];
  const studying = memberships?.filter(m => m.role === 'STUDENT') ?? [];

  return (
    <AccountPage title="College or bootcamp">
      <ErrorText>{error}</ErrorText>
      {memberships && memberships.length === 0 && (
        <Card className="flex flex-col items-start gap-3 text-sm text-slate-400">
          <GraduationCap className="h-6 w-6 text-blue-400" />
          <p>You’re not part of a college or bootcamp group. If your college gave you an invite link, open it to join.</p>
          <Link to="/colleges" className="text-blue-400 hover:text-blue-300">Recallr for colleges and bootcamps →</Link>
        </Card>
      )}
      {studying.map(m => (
        <Card key={m.organization.id} className="mb-4 flex items-center gap-3 !p-4">
          <Users className="h-5 w-5 text-blue-400" />
          <div className="text-sm text-slate-300">
            You joined <strong className="text-white">{m.organization.name}</strong> ({ORGANIZATION_KINDS[m.organization.kind].toLowerCase()}) on {date(m.joinedAt)}.
            Your coach sees your mock interview scores, never your answers.
          </div>
        </Card>
      ))}
      {coached.map(m => (
        <section key={m.organization.id} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-white">{m.organization.name} <span className="text-sm font-normal text-slate-500">· you’re a coach</span></h2>
          <OrganizationDashboard id={m.organization.id} />
        </section>
      ))}
    </AccountPage>
  );
};
