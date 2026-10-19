import { createVaultService } from '../application/vault-service.js';
import * as vaultRepository from '../repositories/vault-repository.js';

const vaultService = createVaultService(vaultRepository);

export async function handleVaultRoute({ request, env, accountId, path, json, readJson }) {
  if (path === '/api/vault' && request.method === 'GET') {
    return json(await vaultService.read(env.DB, accountId), 200, {}, 'vault');
  }
  if (path === '/api/vault/revision' && request.method === 'GET') {
    return json(await vaultService.readRevision(env.DB, accountId), 200, {}, 'revision');
  }
  if (path === '/api/vault' && request.method === 'PUT') {
    const input = await readJson(request, undefined, 'vaultMutationRequest');
    return json(await vaultService.saveAtRevision(env.DB, accountId, input), 200, {}, 'revision');
  }
  return null;
}
