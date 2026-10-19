import type { VaultData, VaultNote } from '../../../shared/api-contracts.js';

export type RemoteVaultEditingState = {
  editing: boolean;
  noteId: string | null;
  draft: VaultNote | null;
};

export type RemoteVaultUpdateDependencies = {
  getEditingState: () => RemoteVaultEditingState;
  getTransientNewNoteId: () => string | null;
  hasLocalEditorChanges: () => boolean;
  isDraft: (note: VaultNote | null | undefined) => boolean;
  hasDraftContent: (note: VaultNote | null | undefined) => boolean;
  replaceVault: (vault: VaultData) => unknown;
  applyTheme: () => unknown;
  syncBookmarkPreferences: () => unknown;
  findNote: (id: string) => VaultNote | undefined;
  restoreTransientDraft: (note: VaultNote) => void;
  persistRestoredDraft: () => unknown;
  clearAutoSave: () => void;
  closeEditor: () => void;
  refreshEditor: (note: VaultNote, preserveLocalChanges: boolean) => void;
  refreshSidebar: () => void;
  render: () => void;
  getScrollY: () => number;
  scrollTo: (position: number) => void;
};

/** Applies a server Vault snapshot while preserving the active editor's local work. */
export function createRemoteVaultUpdateController(dependencies: RemoteVaultUpdateDependencies) {
  function handle(remoteVault: VaultData) {
    const previousScroll = dependencies.getScrollY();
    const localEditorChanged = dependencies.hasLocalEditorChanges();

    dependencies.replaceVault(structuredClone(remoteVault));
    dependencies.applyTheme();
    dependencies.syncBookmarkPreferences();

    const editing = dependencies.getEditingState();
    if (editing.editing && editing.noteId) {
      dependencies.refreshSidebar();
      const current = dependencies.findNote(editing.noteId);
      if (!current) {
        const draft = editing.draft;
        if (editing.noteId === dependencies.getTransientNewNoteId() && dependencies.isDraft(draft) && draft) {
          dependencies.restoreTransientDraft(structuredClone(draft));
          if (dependencies.hasDraftContent(draft)) dependencies.persistRestoredDraft();
          dependencies.refreshSidebar();
          return;
        }

        dependencies.clearAutoSave();
        dependencies.closeEditor();
        dependencies.render();
        dependencies.scrollTo(previousScroll);
        return;
      }

      dependencies.refreshEditor(current, localEditorChanged);
      return;
    }

    dependencies.render();
    dependencies.scrollTo(previousScroll);
  }

  return { handle };
}
