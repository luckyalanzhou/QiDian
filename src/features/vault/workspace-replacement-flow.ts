import type { VaultData } from '../../../shared/api-contracts.js';

export type WorkspaceReplacementNavigation = 'reset-home' | 'preserve-list';

export type WorkspaceReplacementDependencies = {
  isEditing: () => boolean;
  clearAutosave: () => void;
  destroyEditor: () => void;
  clearEditorBaseline: () => void;
  clearUnsavedNewNote: () => void;
  replaceVault: (data: VaultData) => void;
  applyTheme: (theme: VaultData['theme']) => void;
  syncBookmarkPreferences: () => void;
  resetHome: () => void;
  returnHomePreservingList: () => void;
  closeBackupHistory: () => void;
};

export function createWorkspaceReplacementFlow(dependencies: WorkspaceReplacementDependencies) {
  function replace(
    candidate: VaultData,
    options: { navigation: WorkspaceReplacementNavigation; closeBackupHistory?: boolean }
  ): VaultData {
    dependencies.clearAutosave();
    if (dependencies.isEditing()) dependencies.destroyEditor();
    dependencies.clearEditorBaseline();
    dependencies.clearUnsavedNewNote();

    const restored = { ...candidate, trash: candidate.trash || [] };
    dependencies.replaceVault(restored);
    dependencies.applyTheme(restored.theme);
    dependencies.syncBookmarkPreferences();

    if (options.navigation === 'preserve-list') dependencies.returnHomePreservingList();
    else dependencies.resetHome();
    if (options.closeBackupHistory) dependencies.closeBackupHistory();

    return restored;
  }

  return { replace };
}
