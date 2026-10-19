import { api, requestJson } from './client';

export function listAssets() {
  return requestJson('/assets', 'assets');
}

export function getAssetResponse(id: string, download = false) {
  return api(`/assets/${encodeURIComponent(id)}${download ? '?download=1' : ''}`);
}

export function uploadAsset(file: File) {
  return requestJson('/assets', 'uploadedAsset', {
    method: 'POST',
    headers: {
      'X-File-Name': encodeURIComponent(file.name.slice(0, 200)),
      'Content-Type': 'application/octet-stream'
    },
    body: file
  });
}

export function pruneAssets() {
  return requestJson('/assets/prune', 'prunedAssets', { method: 'POST' });
}
