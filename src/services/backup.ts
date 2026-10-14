import { backupStorage, restoreStorage } from './storage';
import { exportFile, listSessions, loadSession, saveSession, type Session } from './sessions';

// One file with all profiles, settings and History. API keys are left out on purpose.

interface Backup {
  app: 'recallr';
  version: 1;
  exportedAt: string;
  storage: Record<string, string>;
  sessions: Session[];
}

export const createBackup = async (): Promise<Backup> => {
  const summaries = await listSessions();
  const sessions = (await Promise.all(summaries.map(s => loadSession(s.id)))).filter((s): s is Session => !!s);
  return { app: 'recallr', version: 1, exportedAt: new Date().toISOString(), storage: backupStorage(), sessions };
};

// Asks where to save; false if cancelled
export const exportBackup = async () => {
  const backup = await createBackup();
  return exportFile(`Recallr backup ${backup.exportedAt.slice(0, 10)}`, 'json', JSON.stringify(backup));
};

// Checks the file before anything is changed
export const parseBackup = (text: string): Backup => {
  let parsed: Partial<Backup>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a Recallr backup.");
  }
  if (parsed?.app !== 'recallr' || typeof parsed.storage !== 'object' || !Array.isArray(parsed.sessions)) {
    throw new Error("This file isn't a Recallr backup.");
  }
  if (parsed.version !== 1) throw new Error('This backup is from a newer version of Recallr.');
  return parsed as Backup;
};

// History is merged (same conversations are replaced); profiles and settings are replaced
export const restoreBackup = async (backup: Backup) => {
  for (const session of backup.sessions) {
    if (session?.id && Array.isArray(session.turns)) await saveSession(session);
  }
  restoreStorage(backup.storage);
};
