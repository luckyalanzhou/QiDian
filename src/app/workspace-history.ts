import type { WatchStopHandle } from 'vue';
import { createBrowserHistoryController } from '../features/navigation/browser-history-controller.ts';

type HistoryControllerDependencies = Parameters<typeof createBrowserHistoryController>[0];
type NavigationStore = {
  $subscribe: (callback: () => void) => WatchStopHandle;
};

type WorkspaceDialogHistoryDependencies = {
  appSettings: { close: () => void; show: () => unknown };
  profileSettings: { close: () => void; show: () => unknown };
  backupHistory: { close: () => void; show: () => void; refresh: () => unknown };
  systemUpdates: { close: () => void; open: () => unknown };
};

export type WorkspaceHistoryDependencies = Omit<HistoryControllerDependencies, 'window' | 'restoreDialog'> & {
  window: HistoryControllerDependencies['window'];
  watch: typeof import('vue')['watch'];
  navigationStore: NavigationStore;
  dialogs: WorkspaceDialogHistoryDependencies;
  watchAppSettings: (callback: (open: boolean) => void) => WatchStopHandle;
  watchProfileSettings: (callback: (open: boolean) => void) => WatchStopHandle;
  watchBackupHistory: (callback: (open: boolean) => void) => WatchStopHandle;
};

export function createWorkspaceHistory(dependencies: WorkspaceHistoryDependencies) {
  const {
    watch,
    navigationStore,
    dialogs,
    watchAppSettings,
    watchProfileSettings,
    watchBackupHistory,
    ...controllerDependencies
  } = dependencies;

  function restoreDialog(dialog: string | null) {
    dialogs.appSettings.close();
    dialogs.profileSettings.close();
    dialogs.backupHistory.close();
    dialogs.systemUpdates.close();

    if (dialog === 'app-settings') dialogs.appSettings.show();
    else if (dialog === 'profile-settings') void dialogs.profileSettings.show();
    else if (dialog === 'backup-history') {
      dialogs.backupHistory.show();
      void dialogs.backupHistory.refresh();
    } else if (dialog === 'version-info') void dialogs.systemUpdates.open();
  }

  const controller = createBrowserHistoryController({ ...controllerDependencies, restoreDialog });
  const stopNavigationWatch = navigationStore.$subscribe(() => controller.stateChanged());
  const stopAppSettingsWatch = watchAppSettings(open => controller.dialogChanged('app-settings', open));
  const stopProfileSettingsWatch = watchProfileSettings(open => controller.dialogChanged('profile-settings', open));
  const stopBackupHistoryWatch = watchBackupHistory(open => controller.dialogChanged('backup-history', open));

  controller.start();

  return {
    controller,
    dispose() {
      stopNavigationWatch();
      stopAppSettingsWatch();
      stopProfileSettingsWatch();
      stopBackupHistoryWatch();
      controller.dispose();
    }
  };
}
