import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GraduationCap, Loader2 } from 'lucide-react';
import { api, hours } from '../api';
import { useAuth } from '../auth';
import { Button, Card, ErrorText } from '../components/ui';

interface Invite {
  name: string;
  open: boolean;
  seatsLeft: number;
  memberDays: number;
  memberMinutes: number | null;
}

// /join/:code: a student joins their college's or bootcamp's group
export const Join: React.FC = () => {
  const { code = '' } = useParams();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<Invite>(`/organizations/invite/${encodeURIComponent(code)}`).then(setInvite, e => setError(e.message)); }, [code]);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/organizations/join', { body: { code } });
      await refresh();
      navigate('/account?joined=1');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const next = encodeURIComponent(`/join/${code}`);
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card className="text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-blue-400" />
        {!invite && !error && <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-blue-400" />}
        {invite && (
          <>
            <h1 className="mt-3 text-xl font-bold text-white">Join {invite.name} on Recallr</h1>
            <p className="mt-2 text-sm text-slate-400">
              {invite.name} gives you {invite.memberMinutes === null ? 'unlimited listening' : `${hours(invite.memberMinutes)} of listening`} for {invite.memberDays} days:
              mock interviews, prepared answers and help in your interviews. Your coach sees your practice scores, never your answers.
            </p>
            {!invite.open && <p className="mt-4 text-sm text-amber-200">This group isn’t taking new students right now. Ask your coach.</p>}
            {invite.open && (user ? (
              <Button variant="primary" className="mt-6 w-full" loading={busy} onClick={join}>Join as {user.email}</Button>
            ) : (
              <div className="mt-6 grid gap-2">
                <Link to={`/register?next=${next}`} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Create an account to join</Link>
                <Link to={`/login?next=${next}`} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">I have an account</Link>
              </div>
            ))}
          </>
        )}
        <div className="mt-4"><ErrorText>{error}</ErrorText></div>
      </Card>
    </div>
  );
};
