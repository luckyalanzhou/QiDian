import { HttpError } from '../validation.js';
import * as assetRepository from '../repositories/asset-repository.js';
import { createAssetService } from '../application/asset-service.js';

const assetService = createAssetService(assetRepository);

export async function handleAssetRoute({ request, env, accountId, path, json, headers, readJson }) {
  if (path === '/api/assets/import-scopes' && request.method === 'POST') {
    return json(await assetService.createImportScope(env.DB, accountId), 201, {}, 'assetImportScope');
  }
  const importScope = path.match(/^\/api\/assets\/import-scopes\/([a-f0-9-]{36})$/i);
  if (importScope && request.method === 'GET') {
    return json(await assetService.readImportScope(env.DB, accountId, importScope[1]), 200, {}, 'assetImportScope');
  }
  if (importScope && request.method === 'DELETE') {
    return json(await assetService.abortImportScope(env.DB, accountId, importScope[1]), 200, {}, 'assetImportScope');
  }
  const importUploadStart = path.match(/^\/api\/assets\/import-scopes\/([a-f0-9-]{36})\/uploads$/i);
  if (importUploadStart && request.method === 'POST') {
    const body = await readJson(request, 4096, 'assetImportUploadRequest');
    const upload = await assetService.beginImportAssetUpload(env.DB, accountId, importUploadStart[1], body.name, body.size);
    return json(upload, 201, {}, 'assetImportUpload');
  }
  const importUploadChunk = path.match(/^\/api\/assets\/import-scopes\/([a-f0-9-]{36})\/uploads\/([a-f0-9-]{36})\/chunks$/i);
  if (importUploadChunk && request.method === 'PUT') {
    const rawStartOrdinal = request.headers.get('X-Chunk-Start') || '';
    if (!/^\d+$/.test(rawStartOrdinal)) throw new HttpError(400, '附件分块位置无效');
    const startOrdinal = Number(rawStartOrdinal);
    const result = await assetService.appendImportAssetChunkBatch(env.DB, accountId, importUploadChunk[1], importUploadChunk[2], startOrdinal, request.body);
    return json({ ok: true, ...result }, 200, {}, 'assetImportChunk');
  }
  const importUploadComplete = path.match(/^\/api\/assets\/import-scopes\/([a-f0-9-]{36})\/uploads\/([a-f0-9-]{36})\/complete$/i);
  if (importUploadComplete && request.method === 'POST') {
    return json(await assetService.completeImportAssetUpload(env.DB, accountId, importUploadComplete[1], importUploadComplete[2]), 201, {}, 'uploadedAsset');
  }
  if (path === '/api/assets' && request.method === 'GET') {
    return json(await assetService.list(env.DB, accountId), 200, {}, 'assets');
  }
  if (path === '/api/assets' && request.method === 'POST') {
    let name;
    try { name = decodeURIComponent(request.headers.get('X-File-Name') || '附件'); }
    catch { throw new HttpError(400, '文件名无效'); }
    const asset = await assetService.create(env.DB, accountId, name, request.body, request.headers.get('X-Import-Scope-Id') || null);
    return json({ ...asset, url: `/api/assets/${asset.id}` }, 201, {}, 'uploadedAsset');
  }
  if (path === '/api/assets/prune' && request.method === 'POST') {
    return json(await assetService.prune(env.DB, accountId), 200, {}, 'prunedAssets');
  }
  const asset = path.match(/^\/api\/assets\/([a-f0-9-]{36})$/);
  if (asset && request.method === 'GET') {
    const file = await assetService.read(env.DB, accountId, asset[1]);
    const url = new URL(request.url);
    return new Response(file.stream, { headers: { ...headers, 'Content-Type': file.mime,
      'Content-Disposition': `${file.mime.startsWith('image/') && !url.searchParams.has('download') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Content-Security-Policy': "default-src 'none'; sandbox" } });
  }
  return null;
}
