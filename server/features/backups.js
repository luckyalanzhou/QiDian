import * as backupRepository from '../repositories/backup-repository.js';
import { createBackupService } from '../application/backup-service.js';

const backupService = createBackupService(backupRepository);

export async function handleBackupRoute({ request, env, accountId, path, json }) {
  if (path === '/api/backups/full' && request.method === 'GET') {
    const date = new Date().toISOString().slice(0, 10);
    const stream = await backupService.exportFull(env.DB, accountId);
    return new Response(stream, { headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`栖点-完整备份-${date}.zip`)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    } });
  }
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
