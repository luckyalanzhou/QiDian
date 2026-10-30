import { requestJson } from './client';
import type { VaultChanges, VaultChangesResponse, VaultData } from './contracts';

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

export function putVaultImport(scopeId: string, revision: number, data: VaultData) {
  return requestJson('/vault/import', 'vaultImport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scopeId, revision, data })
  }, 'vaultImportMutationRequest');
}

export function getVaultChanges(afterRevision: number): Promise<VaultChangesResponse> {
  return requestJson(`/vault/changes?after=${afterRevision}`, 'vaultChanges');
}

export function putVaultChanges(revision: number, changes: VaultChanges) {
  return requestJson('/vault/changes', 'revision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, changes })
  }, 'vaultChangesMutationRequest');
}
