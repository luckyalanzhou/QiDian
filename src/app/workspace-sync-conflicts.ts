import { createSyncConflictController } from '../features/sync/sync-conflict-controller.ts';
import type { useSyncConflictStore } from '../features/sync/store.ts';

type SyncConflictStore = ReturnType<typeof useSyncConflictStore>;
type ControllerDependencies = Omit<Parameters<typeof createSyncConflictController>[0], 'store' | 'prepareEditor'>;
type WorkspaceSyncConflictDependencies = ControllerDependencies & {
  store: SyncConflictStore;
  editor: {
    isEditing: () => boolean;
    hasDraft: () => boolean;
    clearAutosave: () => void;
    updateDraftFromEditor: () => void;
    saveDraft: () => unknown;
  };
};

export function createWorkspaceSyncConflicts(dependencies: WorkspaceSyncConflictDependencies) {
  const { editor, ...controllerDependencies } = dependencies;
  const controller = createSyncConflictController({
    ...controllerDependencies,
    prepareEditor: () => {
      if (!editor.isEditing() || !editor.hasDraft()) return;
      editor.clearAutosave();
      editor.updateDraftFromEditor();
      editor.saveDraft();
    }
  });
  dependencies.store.bindActions(async action => {
    if (action === 'download-backup') await controller.downloadBackup();
    else await controller.restoreCloudVersion();
  });

  return { controller, open: () => controller.open() };
}
