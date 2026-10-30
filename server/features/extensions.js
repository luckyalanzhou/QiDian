import { throttleAuth } from '../auth.js';
import { assertSecureExtensionInstance, createExtensionService } from '../application/extension-service.js';
import * as extensionRepository from '../repositories/extension-repository.js';
import * as vaultRepository from '../repositories/vault-repository.js';
import { HttpError } from '../validation.js';

const extensionService = createExtensionService(extensionRepository, vaultRepository);
const extensionPaths = new Set(['/api/extensions/pair', '/api/extensions/bookmarks']);
const extensionOriginPattern = /^chrome-extension:\/\/[a-p]{32}$/;

export function isExtensionApiPath(path) {
  return extensionPaths.has(path);
}

export function allowedExtensionOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return extensionOriginPattern.test(origin) ? origin : null;
}

export function extensionCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  };
}

function validatePreflight(request) {
  if (request.headers.get('Access-Control-Request-Method') !== 'POST') throw new HttpError(403, '扩展请求方法无效');
  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (requestedHeaders.some(value => !['authorization', 'content-type'].includes(value))) {
    throw new HttpError(403, '扩展请求头无效');
  }
  if (!requestedHeaders.includes('content-type')) throw new HttpError(403, '扩展请求头无效');
}

export async function handleExtensionRoute({ request, env, path, json, readJson }) {
  const origin = allowedExtensionOrigin(request);
  if (!origin) throw new HttpError(403, '仅允许栖点浏览器扩展访问');
  assertSecureExtensionInstance(request);
  if (request.method === 'OPTIONS') {
    validatePreflight(request);
    return new Response(null, { status: 204, headers: extensionCorsHeaders(origin) });
  }
  if (request.method !== 'POST') throw new HttpError(405, '请求方法不支持');
  if (!env.DB) throw new HttpError(503, '尚未配置数据库');

  const cors = extensionCorsHeaders(origin);
  if (path === '/api/extensions/pair') {
    const input = await readJson(request, 2048, 'extensionPairRequest');
    await throttleAuth(env, request, 'extension-pair', input.code, {
      ipLimit: 20, identityLimit: 10, windowMs: 15 * 60 * 1000
    });
    return json(await extensionService.pair(env.DB, input.code, request), 200, cors, 'extensionPair');
  }

  if (path === '/api/extensions/bookmarks') {
    const accountId = await extensionService.authorizeToken(env.DB, request.headers.get('Authorization'));
    await throttleAuth(env, request, 'extension-bookmark-create', accountId, {
      ipLimit: 300, identityLimit: 120, windowMs: 15 * 60 * 1000
    });
    const input = await readJson(request, 16 * 1024, 'extensionBookmarkRequest');
    return json(await extensionService.createBookmark(env.DB, accountId, input), 200, cors, 'extensionBookmark');
  }
  return null;
}
