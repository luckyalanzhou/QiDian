import type { AppSettingsAction } from './app-settings-store';

export type SettingsVault = { [key: string]: unknown; theme?: string; trash?: unknown[] };
export type AppSettingsActionsDependencies = {
  localPreview: boolean;
  closeSettings: () => void;
  closeMenu: () => void;
  retrySync: () => void;
  confirmReload: (sourceLabel: string) => Promise<boolean>;
  saveActiveEditor: () => void;
  getCurrentData: () => SettingsVault;
  exportBackup: (data: SettingsVault) => Promise<unknown>;
  reloadCloud: () => Promise<SettingsVault>;
  restoreIgnoredDraft: () => Promise<{ data: SettingsVault; conflict: boolean }>;
  replaceWorkspace: (data: SettingsVault) => void;
  markIgnoredDraftHandled: () => void;
  queueSave: (data: SettingsVault) => void;
  openSyncConflict: () => void;
  openBackupHistory: () => void;
  exportJSON: () => void;
  openImportPicker: () => void;
  notify: (message: string) => void;
};

export function createAppSettingsActions(dependencies: AppSettingsActionsDependencies) {
  async function reloadCloudFromSettings() {
    const sourceLabel = dependencies.localPreview ? '本地预览数据' : 'Docker 服务端版本';
    if (!await dependencies.confirmReload(sourceLabel)) return;
    dependencies.saveActiveEditor();
    try {
      await dependencies.exportBackup(dependencies.getCurrentData());
    } catch (error) {
      dependencies.notify(`重新载入已取消，当前内容未替换：${(error as Error)?.message || '完整备份失败'}`);
      return;
    }

    dependencies.closeSettings();
    dependencies.closeMenu();
    try {
      dependencies.replaceWorkspace(await dependencies.reloadCloud());
      dependencies.notify(dependencies.localPreview ? '已重新载入本地预览数据' : '已重新载入已保存的数据');
    } catch (error) {
      dependencies.notify((error as Error)?.message || (dependencies.localPreview ? '载入本地预览数据失败' : '载入已保存的数据失败'));
    }
  }

  async function restoreLocalDraftFromSettings() {
    dependencies.closeSettings();
    dependencies.closeMenu();
    try {
      const restored = await dependencies.restoreIgnoredDraft();
      dependencies.replaceWorkspace(restored.data);
      dependencies.markIgnoredDraftHandled();
      if (restored.conflict) {
        dependencies.openSyncConflict();
        return;
      }
      dependencies.queueSave(dependencies.getCurrentData());
      dependencies.notify('本地草稿已恢复，正在同步');
    } catch (error) {
      dependencies.notify((error as Error)?.message || '恢复本地草稿失败');
    }
  }

  function dispatch(action: AppSettingsAction) {
    switch (action) {
      case 'retry-sync':
        dependencies.closeSettings();
        dependencies.retrySync();
        break;
      case 'reload-cloud':
        void reloadCloudFromSettings();
        break;
      case 'review-conflict':
        dependencies.closeSettings();
        dependencies.openSyncConflict();
        break;
      case 'restore-draft':
        void restoreLocalDraftFromSettings();
        break;
      case 'backup-history':
        dependencies.openBackupHistory();
        break;
      case 'export-backup':
        dependencies.closeSettings();
        dependencies.closeMenu();
        dependencies.exportJSON();
        break;
      case 'import-backup':
        dependencies.closeSettings();
        dependencies.closeMenu();
        dependencies.openImportPicker();
        break;
    }
  }

  return { dispatch };
}
