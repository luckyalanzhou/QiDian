import * as accountRepository from '../repositories/account-repository.js';
import { createSystemUpdateService } from '../application/system-update-service.js';

const systemUpdateService = createSystemUpdateService(accountRepository);

/** Maps device update HTTP requests to the application service. */
export async function handleSystemUpdateRoute({ request, env, accountId, path, json, readJson }) {
  if (path === '/api/system/version' && request.method === 'GET') {
    const installedOnly = new URL(request.url).searchParams.get('installed') === '1';
    return json(await systemUpdateService.version(env, accountId, { installedOnly }), 200, {}, 'systemVersion');
  }

  if (path === '/api/system/update' && request.method === 'POST') {
    await systemUpdateService.assertUpdateAllowed(env, accountId);
    await readJson(request, 1024, 'systemUpdateRequest');
    return json(await systemUpdateService.update(env, accountId), 202, {}, 'updateAcceptance');
  }

  if (path === '/api/system/update-status' && request.method === 'GET') {
    return json(await systemUpdateService.status(env), 200, {}, 'updateStatus');
  }

  return null;
}
