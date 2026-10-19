import { requestJson } from './client';
import type { VaultData } from './contracts';

export function getVault() {
  return requestJson('/vault', 'vault');
}

export function getVaultRevision() {
  return requestJson('/vault/revision', 'revision');
}

export function putVault(revision: number, data: VaultData) {
  return requestJson('/vault', 'revision', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, data })
  }, 'vaultMutationRequest');
}
