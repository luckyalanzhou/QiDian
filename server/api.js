import { authorize, checkOrigin } from './auth.js';
import { HttpError } from './validation.js';
import { jsonHeaders as headers, jsonResponse as json } from './http-responses.js';
import { isApiRequest } from '../shared/api-contracts.js';
import { handleAuthRoute } from './features/auth.js';
import { handleAccountRoute } from './features/account.js';
import { handleAssetRoute } from './features/assets.js';
import { handleBookmarkMetadataRoute } from './features/bookmark-metadata.js';
import { handleBackupRoute } from './features/backups.js';
import { handleSystemUpdateRoute } from './features/system-updates.js';
import { handleSystemStorageRoute } from './features/system-storage.js';
import { allowedExtensionOrigin, extensionCorsHeaders, handleExtensionRoute, isExtensionApiPath } from './features/extensions.js';
import { handleVaultRoute } from './features/vault.js';

const MAX_JSON_REQUEST_BYTES = 1_010_000;

async function readJson(request, maxBytes = MAX_JSON_REQUEST_BYTES, contract) {
  const mediaType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') throw new HttpError(415, '需要 JSON 请求');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '请求为空');
  const parts = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > maxBytes) {
      // Canceling a Node-backed request stream destroys the shared HTTP socket before its 413 response can flush.
      reader.releaseLock();
      throw new HttpError(413, '请求过大');
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, 'JSON 无效'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'JSON 请求必须是对象');
  }
  if (contract && !isApiRequest(contract, value)) throw new HttpError(400, `请求数据格式无效：${contract}`);
  return value;
}

export async function handle(request, env) {
  let extensionCorsOrigin = null;
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (isExtensionApiPath(path)) {
      extensionCorsOrigin = allowedExtensionOrigin(request);
      const response = await handleExtensionRoute({ request, env, path, json, readJson });
      if (response) return response;
    }
    checkOrigin(request);
    if (path.startsWith('/api/auth/')) {
      const response = await handleAuthRoute({ request, env, path, json, readJson });
      if (response) return response;
    }
    const account = await authorize(request, env);
    const accountId = account.id;
    if (path === '/api/session' && request.method === 'GET') return json({ owner: accountId, username: account.username, local: false }, 200, {}, 'sessionBootstrap');
    if (!env.DB) throw new HttpError(503, '尚未配置数据库');
    const systemResponse = await handleSystemUpdateRoute({ request, env, accountId, path, json, readJson });
    if (systemResponse) return systemResponse;
    const storageResponse = await handleSystemStorageRoute({ request, env, path, json });
    if (storageResponse) return storageResponse;
    const accountResponse = await handleAccountRoute({ request, env, accountId, path, json, headers, readJson });
    if (accountResponse) return accountResponse;
    const vaultResponse = await handleVaultRoute({ request, env, accountId, path, json, readJson });
    if (vaultResponse) return vaultResponse;
    const bookmarkMetadataResponse = await handleBookmarkMetadataRoute({ request, env, accountId, path, json, readJson });
    if (bookmarkMetadataResponse) return bookmarkMetadataResponse;
    const backupResponse = await handleBackupRoute({ request, env, accountId, path, json });
    if (backupResponse) return backupResponse;
    const assetResponse = await handleAssetRoute({ request, env, accountId, path, json, headers, readJson });
    if (assetResponse) return assetResponse;
    throw new HttpError(404, '接口不存在');
  } catch (error) {
    const response = json({ error: error instanceof HttpError ? error.message : '服务器暂时无法完成操作' }, error instanceof HttpError ? error.status : 500,
      extensionCorsOrigin ? extensionCorsHeaders(extensionCorsOrigin) : {});
    return response;
  }
}
