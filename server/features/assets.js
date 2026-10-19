import { HttpError, MAX_FILE_BYTES } from '../validation.js';
import * as assetRepository from '../repositories/asset-repository.js';
import { createAssetService } from '../application/asset-service.js';

const assetService = createAssetService(assetRepository);

async function readAsset(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '文件为空');
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_FILE_BYTES) {
      await reader.cancel();
      throw new HttpError(413, '单个文件上限为 8 MB');
    }
    parts.push(value);
  }
  if (!size) throw new HttpError(400, '文件为空');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export async function handleAssetRoute({ request, env, accountId, path, json, headers }) {
  if (path === '/api/assets' && request.method === 'GET') {
    return json(await assetService.list(env.DB, accountId), 200, {}, 'assets');
  }
  if (path === '/api/assets' && request.method === 'POST') {
    let name;
    try { name = decodeURIComponent(request.headers.get('X-File-Name') || '附件'); }
    catch { throw new HttpError(400, '文件名无效'); }
    const bytes = await readAsset(request);
    const asset = await assetService.create(env.DB, accountId, name, bytes);
    return json({ ...asset, url: `/api/assets/${asset.id}` }, 201, {}, 'uploadedAsset');
  }
  if (path === '/api/assets/prune' && request.method === 'POST') {
    return json(await assetService.prune(env.DB, accountId), 200, {}, 'prunedAssets');
  }
  const asset = path.match(/^\/api\/assets\/([a-f0-9-]{36})$/);
  if (asset && request.method === 'GET') {
    const file = await assetService.read(env.DB, accountId, asset[1]);
    const url = new URL(request.url);
    return new Response(file.bytes, { headers: { ...headers, 'Content-Type': file.mime,
      'Content-Disposition': `${file.mime.startsWith('image/') && !url.searchParams.has('download') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Content-Security-Policy': "default-src 'none'; sandbox" } });
  }
  return null;
}
