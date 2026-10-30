import { api, requestJson } from './client';
import type { AssetImportScope } from './contracts';

export function listAssets() {
  return requestJson('/assets', 'assets');
}

export function getAssetResponse(id: string, download = false) {
  return api(`/assets/${encodeURIComponent(id)}${download ? '?download=1' : ''}`);
}

export function uploadAsset(file: File, importScopeId?: string) {
  return requestJson('/assets', 'uploadedAsset', {
    method: 'POST',
    headers: {
      'X-File-Name': encodeURIComponent(file.name.slice(0, 200)),
      ...(importScopeId ? { 'X-Import-Scope-Id': importScopeId } : {}),
      'Content-Type': 'application/octet-stream'
    },
    body: file
  });
}

export function createAssetImportScope(): Promise<AssetImportScope> {
  return requestJson('/assets/import-scopes', 'assetImportScope', { method: 'POST' });
}

export function getAssetImportScope(id: string): Promise<AssetImportScope> {
  return requestJson(`/assets/import-scopes/${encodeURIComponent(id)}`, 'assetImportScope');
}

export function abortAssetImportScope(id: string): Promise<AssetImportScope> {
  return requestJson(`/assets/import-scopes/${encodeURIComponent(id)}`, 'assetImportScope', { method: 'DELETE' });
}

export function beginAssetImportUpload(scopeId: string, name: string, size: number) {
  return requestJson(`/assets/import-scopes/${encodeURIComponent(scopeId)}/uploads`, 'assetImportUpload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, size })
  }, 'assetImportUploadRequest');
}

export async function uploadAssetImportChunkBatch(scopeId: string, assetId: string, startOrdinal: number, chunks: Uint8Array[]) {
  if (!chunks.length || chunks.length > 16) throw new TypeError('附件分块批次无效');
  return requestJson(`/assets/import-scopes/${encodeURIComponent(scopeId)}/uploads/${encodeURIComponent(assetId)}/chunks`, 'assetImportChunk', {
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-Start': String(startOrdinal) },
    body: new Blob(chunks.map(chunk => new Uint8Array(chunk).buffer))
  });
}

export function completeAssetImportUpload(scopeId: string, assetId: string) {
  return requestJson(`/assets/import-scopes/${encodeURIComponent(scopeId)}/uploads/${encodeURIComponent(assetId)}/complete`,
    'uploadedAsset', { method: 'POST' });
}

export function pruneAssets() {
  return requestJson('/assets/prune', 'prunedAssets', { method: 'POST' });
}
