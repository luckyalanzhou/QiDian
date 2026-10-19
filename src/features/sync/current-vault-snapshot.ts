import type { VaultData, VaultNote } from '../../../shared/api-contracts.js';

type Dependencies = {
  getVault: () => VaultData;
  isEditing: () => boolean;
  getEditingDraft: () => VaultNote | null;
  editorIsMounted: () => boolean;
  updateDraftFromEditor: () => void;
  isDraft: (note: VaultNote) => boolean;
  hasDraftContent: (note: VaultNote) => boolean;
  mutateVault: <T>(operation: (vault: VaultData) => T) => T;
};

/** Builds the latest merge snapshot, including an active editor's unsaved fields. */
export function createCurrentVaultSnapshot(dependencies: Dependencies) {
  return function snapshotCurrentVault(): VaultData {
    if (dependencies.isEditing() && dependencies.getEditingDraft() && dependencies.editorIsMounted()) {
      const before = structuredClone(dependencies.getEditingDraft()!);
      dependencies.updateDraftFromEditor();
      const draft = dependencies.getEditingDraft();
      if (draft) {
        const changed = ['title', 'type', 'category', 'source', 'body']
          .some(key => before[key as keyof VaultNote] !== draft[key as keyof VaultNote]) ||
          JSON.stringify(before.tags || []) !== JSON.stringify(draft.tags || []);
        if (!changed) draft.updated = before.updated;

        const noteExists = dependencies.getVault().notes.some(note => note.id === draft.id);
        if (noteExists && (!dependencies.isDraft(draft) || dependencies.hasDraftContent(draft))) {
          dependencies.mutateVault(vault => {
            const index = vault.notes.findIndex(note => note.id === draft.id);
            if (index >= 0) vault.notes[index] = structuredClone(draft);
          });
        }
      }
    }

    const snapshot = structuredClone(dependencies.getVault());
    const draft = dependencies.getEditingDraft();
    if (dependencies.isEditing() && draft && dependencies.isDraft(draft) && !dependencies.hasDraftContent(draft)) {
      snapshot.notes = snapshot.notes.filter(note => note.id !== draft.id);
    }
    return snapshot;
  };
}
