import React, { useCallback, useEffect, useState } from 'react';
import { Laptop } from 'lucide-react';
import { api, dateTime, platformName, type Device } from '../../api';
import { AccountPage } from '../../components/AccountNav';
import { Button, Card, ErrorText } from '../../components/ui';

// The computers this account's app is signed in on
export const AccountDevices: React.FC = () => {
  const [data, setData] = useState<{ devices: Device[]; maxDevices: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api<{ devices: Device[]; maxDevices: number }>('/auth/devices').then(setData, e => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const remove = async (device: Device) => {
    if (!window.confirm(`Sign out "${device.name}"? Recallr on that computer stops working until someone signs in there again.`)) return;
    setBusy(device.id);
    try {
      await api(`/auth/devices/${device.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <AccountPage title="Devices">
      <p className="mb-4 text-sm text-slate-400">
        Your account can be signed in to the app on {data?.maxDevices ? `${data.maxDevices} ${data.maxDevices === 1 ? 'computer' : 'computers'}` : 'a few computers'} at a time.
        Got a new computer? Remove the old one here, then sign in on the new one.
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-2">
        {data?.devices.map(d => (
          <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 !p-4">
            <div className="flex items-center gap-3">
              <Laptop className="h-5 w-5 text-blue-400" />
              <div>
                <div className="font-medium text-slate-100">{d.name}</div>
                <div className="text-xs text-slate-500">
                  {platformName(d.platform)}{d.appVersion && ` · app ${d.appVersion}`} · last used {dateTime(d.lastSeenAt)} · added {dateTime(d.createdAt)}
                </div>
              </div>
            </div>
            <Button size="sm" variant="ghost" loading={busy === d.id} onClick={() => remove(d)}>Remove</Button>
          </Card>
        ))}
        {data && data.devices.length === 0 && <p className="text-sm text-slate-500">The app isn’t signed in on any computer yet.</p>}
      </div>
    </AccountPage>
  );
};
