import { requestJson } from './client';

export function getSystemVersion({ installedOnly = false }: { installedOnly?: boolean } = {}) {
  return requestJson(`/system/version${installedOnly ? '?installed=1' : ''}`, 'systemVersion');
}

export function requestSystemUpdate() {
  return requestJson('/system/update', 'updateAcceptance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update' })
  }, 'systemUpdateRequest');
}

export function getSystemUpdateStatus() {
  return requestJson('/system/update-status', 'updateStatus');
}
