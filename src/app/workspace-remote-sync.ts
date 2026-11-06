import { createRemoteEditorRefresh } from '../features/editor/remote-refresh.ts';
import { createCurrentVaultSnapshot } from '../features/sync/current-vault-snapshot.ts';
import { createRemoteVaultUpdateController } from '../features/sync/remote-vault-update-controller.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';
import type { VaultData } from '../../shared/api-contracts.js';

type RemoteEditorDependencies = Parameters<typeof createRemoteEditorRefresh>[0];
type RemoteVaultUpdateDependencies = Parameters<typeof createRemoteVaultUpdateController>[0];
type RemoteUpdateHandler = ReturnType<typeof createRemoteVaultUpdateController>['handle'];
type CurrentVaultSnapshotDependencies = Parameters<typeof createCurrentVaultSnapshot>[0];
type RemoteEditorLifecycle = Pick<ReturnType<typeof useNavigationStore>, 'editing' | 'editingDraft' | 'noteId'>;

type Dependencies = {
  remoteEditor: RemoteEditorDependencies;
  remoteVaultUpdate: Omit<RemoteVaultUpdateDependencies,
    'refreshEditor' | 'restoreTransientDraft' | 'persistRestoredDraft' | 'clearAutoSave' | 'closeEditor'>;
  editorLifecycle: {
    navigationStore: RemoteEditorLifecycle;
    destroyEditor: () => void;
    clearAutosave: () => void;
    persistRestoredDraft: RemoteVaultUpdateDependencies['persistRestoredDraft'];
    mutateVault: <T>(operation: (vault: VaultData) => T) => T;
  };
  currentVaultSnapshot: CurrentVaultSnapshotDependencies;
  onRemoteUpdate: (handler: RemoteUpdateHandler) => unknown;
};

/** Composes remote Vault updates, active-editor refresh, and sync snapshots. */
export function createWorkspaceRemoteSyncFeature(dependencies: Dependencies) {
  const remoteEditorRefresh = createRemoteEditorRefresh(dependencies.remoteEditor);
  const { editorLifecycle, ...remoteVaultUpdateDependencies } = dependencies;
  const remoteVaultUpdateController = createRemoteVaultUpdateController({
    ...remoteVaultUpdateDependencies.remoteVaultUpdate,
    restoreTransientDraft: note => editorLifecycle.mutateVault(vault => { vault.notes.unshift(note); }),
    persistRestoredDraft: editorLifecycle.persistRestoredDraft,
    clearAutoSave: editorLifecycle.clearAutosave,
    closeEditor: () => {
      editorLifecycle.navigationStore.editing = false;
      editorLifecycle.destroyEditor();
      editorLifecycle.navigationStore.editingDraft = null;
      editorLifecycle.navigationStore.noteId = null;
    },
    refreshEditor: (note, preserveLocalChanges) => remoteEditorRefresh.refresh(note, preserveLocalChanges)
  });

  dependencies.onRemoteUpdate(remoteVaultUpdateController.handle);

  const snapshotCurrentVault = createCurrentVaultSnapshot(dependencies.currentVaultSnapshot);

  return { snapshotCurrentVault };
}
