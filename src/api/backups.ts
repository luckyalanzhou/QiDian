import { requestJson } from './client';

export function listBackups() {
  return requestJson('/backups', 'backupSummaries');
}

export function createBackupSnapshot() {
  return requestJson('/backups', 'backupCreated', { method: 'POST' });
}

export function getBackupSnapshot(revision: number | string) {
  return requestJson(`/backups/${encodeURIComponent(String(revision))}`, 'backupSnapshot');
}
