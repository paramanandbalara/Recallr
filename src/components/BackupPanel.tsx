import React, { useState } from 'react';
import { Download, Upload, AlertCircle } from 'lucide-react';
import { exportBackup, parseBackup, restoreBackup } from '../services/backup';
import { Button } from './ui';

const openBackupFile = async (): Promise<string | null> =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  (await window.ipcRenderer?.invoke('backup:open')) ?? null;

// Export everything to one file, or restore from one
export const BackupPanel: React.FC = () => {
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const runExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      if (await exportBackup()) setMessage({ text: 'Backup saved.' });
    } catch (error) {
      console.error('Backup error:', error);
      setMessage({ text: 'Could not save the backup.', error: true });
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async () => {
    setBusy('restore');
    setMessage(null);
    try {
      const text = await openBackupFile();
      if (!text) return;
      const backup = parseBackup(text);
      const date = new Date(backup.exportedAt).toLocaleDateString();
      if (!window.confirm(`Restore the backup from ${date}?\n\nYour profiles, prepared answers and settings are replaced by the ones in the backup. History is merged. API keys stay as they are.`)) return;
      await restoreBackup(backup);
      window.location.reload();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not restore this backup.', error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-xs font-semibold text-slate-300">Backup</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          One file with all profiles (resume, job, notes, prepared answers), settings and History.
          API keys are not included, so the file is safe to keep in cloud storage.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={runExport} loading={busy === 'export'} disabled={!!busy}>
          Export backup
        </Button>
        <Button size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={runRestore} loading={busy === 'restore'} disabled={!!busy}>
          Restore
        </Button>
      </div>
      {message && (
        <p className={`flex items-start gap-1.5 text-[11px] ${message.error ? 'text-red-300' : 'text-emerald-300'}`}>
          {message.error && <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />} {message.text}
        </p>
      )}
    </div>
  );
};
