import React from 'react';
import { Link } from 'react-router-dom';
import { Apple, Download as DownloadIcon, MonitorSmartphone } from 'lucide-react';
import { SITE } from '../api';
import { useAuth } from '../auth';
import { Card } from '../components/ui';

export const Download: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold text-white">Download Recallr</h1>
      <p className="mt-3 text-slate-400">Install the app, then sign in with your Recallr account{user ? ` (${user.email})` : ''}.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { name: 'Windows', detail: 'Windows 10 or 11 · .exe installer', icon: MonitorSmartphone, url: SITE.downloadUrlWindows },
          { name: 'macOS', detail: 'macOS 13 or newer · .dmg', icon: Apple, url: SITE.downloadUrlMac },
        ].map(({ name, detail, icon: Icon, url }) => (
          <Card key={name}>
            <Icon className="h-6 w-6 text-blue-400" />
            <h2 className="mt-3 font-semibold text-slate-100">{name}</h2>
            <p className="mt-1 text-sm text-slate-400">{detail}</p>
            {url ? (
              <a href={url} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                <DownloadIcon className="h-4 w-4" /> Download for {name}
              </a>
            ) : (
              <p className="mt-4 text-sm text-amber-200">Not available yet. Contact us and we’ll send you the installer.</p>
            )}
          </Card>
        ))}
      </div>

      <p className="mt-8 text-sm text-slate-400">
        Installation help, permissions and first steps are in the <Link to="/guide#install" className="text-blue-400">guide</Link>.
        {!user && <> No account yet? <Link to="/register" className="text-blue-400">Create one free</Link>: it includes a free trial.</>}
      </p>
    </div>
  );
};
