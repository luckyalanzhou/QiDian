import { createVaultService } from '../application/vault-service.js';
import * as vaultRepository from '../repositories/vault-repository.js';
import * as assetRepository from '../repositories/asset-repository.js';
import { HttpError } from '../validation.js';

const vaultService = createVaultService({
  ...vaultRepository,
  findAccountAssetImportResult: assetRepository.findAccountAssetImportResult
});

export async function handleVaultRoute({ request, env, accountId, path, json, readJson }) {
  if (path === '/api/vault/changes' && request.method === 'GET') {
    const after = new URL(request.url).searchParams.get('after');
    if (!/^\d+$/.test(after || '')) throw new HttpError(400, '同步版本无效');
    return json(await vaultService.readChanges(env.DB, accountId, Number(after)), 200, {}, 'vaultChanges');
  }
  if (path === '/api/vault/changes' && request.method === 'POST') {
    const input = await readJson(request, 64 * 1024 * 1024, 'vaultChangesMutationRequest');
    return json(await vaultService.saveChangesAtRevision(env.DB, accountId, input), 200, {}, 'revision');
  }
  if (path === '/api/vault' && request.method === 'GET') {
    return json(await vaultService.read(env.DB, accountId), 200, {}, 'vault');
  }
  if (path === '/api/vault/revision' && request.method === 'GET') {
    return json(await vaultService.readRevision(env.DB, accountId), 200, {}, 'revision');
  }
  if (path === '/api/vault' && request.method === 'PUT') {
    const input = await readJson(request, 64 * 1024 * 1024, 'vaultMutationRequest');
    return json(await vaultService.saveAtRevision(env.DB, accountId, input), 200, {}, 'revision');
  }
  if (path === '/api/vault/import' && request.method === 'POST') {
    const input = await readJson(request, 64 * 1024 * 1024, 'vaultImportMutationRequest');
    return json(await vaultService.importAtRevision(env.DB, accountId, input), 200, {}, 'vaultImport');
  }
  return null;
}
