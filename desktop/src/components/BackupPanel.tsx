import React, { useEffect, useState } from 'react';
import { Download, Upload, AlertCircle, CloudUpload, CloudDownload } from 'lucide-react';
import { fetchCloudBackup, type CloudBackup } from '../services/account';
import { exportBackup, fetchBackupFromAccount, parseBackup, restoreBackup, uploadBackup } from '../services/backup';
import { t } from '../i18n';
import { Button } from './ui';

const openBackupFile = async (): Promise<string | null> =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  (await window.ipcRenderer?.invoke('backup:open')) ?? null;

// Export everything to one file, or restore from one
export const BackupPanel: React.FC = () => {
  const [busy, setBusy] = useState<'export' | 'restore' | 'upload' | 'download' | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [cloud, setCloud] = useState<CloudBackup | null | undefined>(undefined); // undefined: still loading

  useEffect(() => {
    fetchCloudBackup().then(setCloud, () => setCloud(null));
  }, []);

  const runUpload = async () => {
    if (cloud && !window.confirm(t("Replace the backup on your account (from {date}) with this computer's data?", { date: new Date(cloud.updatedAt).toLocaleString() }))) return;
    setBusy('upload');
    setMessage(null);
    try {
      setCloud(await uploadBackup());
      setMessage({ text: t('Backed up to your account.') });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : t('Could not back up.'), error: true });
    } finally {
      setBusy(null);
    }
  };

  const runDownload = async () => {
    setBusy('download');
    setMessage(null);
    try {
      const backup = await fetchBackupFromAccount();
      const date = new Date(backup.exportedAt).toLocaleString();
      const question = cloud?.deviceName
        ? t('Restore the backup from {date} (made on {device})?', { date, device: cloud.deviceName })
        : t('Restore the backup from {date}?', { date });
      if (!window.confirm(`${question}\n\n${t('Your profiles, prepared answers and settings on this computer are replaced. History is merged.')}`)) return;
      await restoreBackup(backup);
      window.location.reload();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : t('Could not restore.'), error: true });
    } finally {
      setBusy(null);
    }
  };

  const runExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      if (await exportBackup()) setMessage({ text: t('Backup saved.') });
    } catch (error) {
      console.error('Backup error:', error);
      setMessage({ text: t('Could not save the backup.'), error: true });
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
      if (!window.confirm(`${t('Restore the backup from {date}?', { date })}\n\n${t('Your profiles, prepared answers and settings are replaced by the ones in the backup. History is merged. You stay signed in.')}`)) return;
      await restoreBackup(backup);
      window.location.reload();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : t('Could not restore this backup.'), error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-xs font-semibold text-slate-300">{t('Backup on your account')}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {t('Your profiles (resume, job, notes, prepared answers), settings and History, kept encrypted on your Recallr account, so you can restore them on another computer.')}{' '}
          {cloud === undefined ? '' : cloud
            ? (cloud.deviceName
              ? t('Last backup: {date} from {device} ({size} KB).', { date: new Date(cloud.updatedAt).toLocaleString(), device: cloud.deviceName, size: Math.max(1, Math.round(cloud.sizeBytes / 1024)) })
              : t('Last backup: {date} ({size} KB).', { date: new Date(cloud.updatedAt).toLocaleString(), size: Math.max(1, Math.round(cloud.sizeBytes / 1024)) }))
            : t('Nothing backed up yet.')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="primary" icon={<CloudUpload className="w-3.5 h-3.5" />} onClick={runUpload} loading={busy === 'upload'} disabled={!!busy}>
          {t('Back up now')}
        </Button>
        <Button size="sm" icon={<CloudDownload className="w-3.5 h-3.5" />} onClick={runDownload} loading={busy === 'download'} disabled={!!busy || !cloud}>
          {t('Restore from account')}
        </Button>
      </div>

      <div className="pt-2">
        <div className="text-xs font-semibold text-slate-300">{t('Backup file')}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {t("The same, as one file you keep yourself. Your sign-in isn't included.")}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={runExport} loading={busy === 'export'} disabled={!!busy}>
          {t('Export backup')}
        </Button>
        <Button size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={runRestore} loading={busy === 'restore'} disabled={!!busy}>
          {t('Restore')}
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
