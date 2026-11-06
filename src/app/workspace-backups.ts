import { createBackupHistoryOpenFlow } from '../features/settings/backup-history-open-flow.ts';
import { createBackupWorkflows } from '../features/settings/backup-workflows.ts';
import type { useBackupHistoryStore } from '../features/settings/backup-history-store.ts';
import type { useBackupImportStore } from '../features/settings/backup-import-store.ts';

type BackupWorkflowDependencies = Parameters<typeof createBackupWorkflows>[0];
type BackupImportProgress = Parameters<BackupWorkflowDependencies['setImportProgress']>[0];
type BackupHistoryStore = Pick<ReturnType<typeof useBackupHistoryStore>, 'configure' | 'show' | 'refresh'>;
type BackupHistoryOptions = Parameters<BackupHistoryStore['configure']>[0];
type BackupImportStore = Pick<ReturnType<typeof useBackupImportStore>, 'begin' | 'finish' | 'setProgress'>;

type WorkspaceBackupDependencies = Omit<BackupWorkflowDependencies, 'beginImport' | 'finishImport' | 'setImportProgress' | 'saveActiveEditor'> & {
  backupHistoryStore: BackupHistoryStore;
  importLifecycle: {
    store: BackupImportStore;
    beginCloudImport: () => void;
    finishCloudImport: () => void;
  };
  listBackups: BackupHistoryOptions['listBackups'];
  isEditing: () => boolean;
  clearAutosave: () => void;
  saveActiveDraft: () => unknown;
  closeSettings: () => void;
  closeMenu: () => void;
  isSettingsOpen: () => boolean;
  ignoreNextSettingsDialogClose: () => void;
};

/** Composes backup workflows, history configuration, and settings entry points. */
export function createWorkspaceBackupFeature(dependencies: WorkspaceBackupDependencies) {
  const { importLifecycle, ...workflowDependencies } = dependencies;
  const workflows = createBackupWorkflows({
    ...workflowDependencies,
    saveActiveEditor: () => {
      if (!dependencies.isEditing()) return;
      dependencies.clearAutosave();
      return dependencies.saveActiveDraft();
    },
    beginImport: () => {
      importLifecycle.beginCloudImport();
      importLifecycle.store.begin();
    },
    finishImport: () => {
      importLifecycle.finishCloudImport();
      importLifecycle.store.finish();
    },
    setImportProgress: (progress: BackupImportProgress) => importLifecycle.store.setProgress(progress)
  });
  const historyOpen = createBackupHistoryOpenFlow({
    isEditing: dependencies.isEditing,
    saveActiveDraft: dependencies.saveActiveDraft,
    closeSettings: dependencies.closeSettings,
    closeMenu: dependencies.closeMenu,
    showDialog: () => dependencies.backupHistoryStore.show(),
    refresh: () => dependencies.backupHistoryStore.refresh()
  });

  function configureHistory() {
    dependencies.backupHistoryStore.configure({
      listBackups: dependencies.listBackups,
      localPreview: dependencies.localPreview,
      downloadSnapshot: revision => workflows.downloadSnapshot(revision),
      restoreSnapshot: revision => workflows.restoreSnapshot(revision)
    });
  }

  async function openBackupHistory() {
    if (dependencies.isSettingsOpen()) dependencies.ignoreNextSettingsDialogClose();
    await historyOpen.open();
  }

  return {
    configureHistory,
    openBackupHistory,
    downloadSnapshot: (revision: string | number) => workflows.downloadSnapshot(revision),
    restoreSnapshot: (revision: string | number) => workflows.restoreSnapshot(revision),
    exportFullBackup: () => workflows.exportFullBackup(),
    importBackup: (file: File | null | undefined) => workflows.importBackup(file)
  };
}
