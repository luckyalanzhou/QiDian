import * as backupRepository from '../repositories/backup-repository.js';
import { createBackupService } from '../application/backup-service.js';

const backupService = createBackupService(backupRepository);

export async function handleBackupRoute({ request, env, accountId, path, json }) {
  if (path === '/api/backups' && request.method === 'GET') {
    return json(await backupService.list(env.DB, accountId), 200, {}, 'backupSummaries');
  }
  if (path === '/api/backups' && request.method === 'POST') {
    return json(await backupService.create(env.DB, accountId), 201, {}, 'backupCreated');
  }
  const backup = path.match(/^\/api\/backups\/(\d+)$/);
  if (backup && request.method === 'GET') {
    return json(await backupService.read(env.DB, accountId, Number(backup[1])), 200, {}, 'backupSnapshot');
  }
  return null;
}
