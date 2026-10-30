import type { VaultData, VaultNote } from '../../../shared/api-contracts.js';

type VaultPersistenceDependencies = {
  getVault: () => VaultData;
  getUnsavedNewNoteId: () => string | null;
  isDraft: (note: VaultNote) => boolean;
  hasDraftContent: (note: VaultNote) => boolean;
  queueSave: (candidate: VaultData) => unknown;
  commitSave: (candidate: VaultData) => Promise<unknown>;
};

export function createVaultPersistence(dependencies: VaultPersistenceDependencies) {
  function persist(): true {
    const vault = dependencies.getVault();
    const unsavedId = dependencies.getUnsavedNewNoteId();
    const unsavedNote = unsavedId ? vault.notes.find(note => note.id === unsavedId) : undefined;

    if (unsavedId && unsavedNote && dependencies.isDraft(unsavedNote) && !dependencies.hasDraftContent(unsavedNote)) {
      const candidate = structuredClone(vault);
      candidate.notes = candidate.notes.filter(note => note.id !== unsavedId);
      dependencies.queueSave(candidate);
      return true;
    }

    dependencies.queueSave(vault);
    return true;
  }

  async function commitPersist(candidate = dependencies.getVault()): Promise<true> {
    await dependencies.commitSave(candidate);
    return true;
  }

  return { persist, commitPersist };
}
