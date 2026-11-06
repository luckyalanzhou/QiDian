import { DEFAULT_NOTE_TYPES } from '../../shared/vault-validation.js';
import type { VaultData } from '../../shared/api-contracts.js';
import { createVaultMutation, type VaultMutationPort } from '../features/vault/mutation.ts';
import { createVaultPersistence } from '../features/vault/persistence.ts';
import type { useVaultStore } from '../features/vault/store.ts';

type VaultStore = ReturnType<typeof useVaultStore>;
type PersistenceDependencies = Omit<Parameters<typeof createVaultPersistence>[0], 'getVault'>;

type WorkspaceVaultRuntimeDependencies = {
  store: VaultStore;
  initialData: VaultData;
  owner: string | null | undefined;
  setOwner: (owner: string | null | undefined) => void;
};

export function createWorkspaceVaultRuntime(dependencies: WorkspaceVaultRuntimeDependencies) {
  dependencies.store.replace({
    ...dependencies.initialData,
    noteTypes: dependencies.initialData.noteTypes || structuredClone(DEFAULT_NOTE_TYPES),
    trash: dependencies.initialData.trash || []
  });
  dependencies.setOwner(dependencies.owner);

  function getVault(): VaultData {
    const current = dependencies.store.value;
    if (!current) throw new Error('知识库尚未加载');
    return current;
  }

  function replaceVault(value: VaultData): VaultData {
    const normalized = {
      ...value,
      noteTypes: Array.isArray(value.noteTypes) ? value.noteTypes : structuredClone(DEFAULT_NOTE_TYPES),
      trash: Array.isArray(value.trash) ? value.trash : []
    };
    return dependencies.store.replace(normalized);
  }

  function mutateVault<T>(operation: (vault: VaultData) => T): T {
    return dependencies.store.mutate(operation);
  }

  function createPersistence(persistence: PersistenceDependencies) {
    return createVaultPersistence({ ...persistence, getVault });
  }

  function createMutation(save: () => Promise<unknown>): VaultMutationPort {
    return createVaultMutation({ getVault, replaceVault, save });
  }

  return { getVault, replaceVault, mutateVault, createPersistence, createMutation };
}
