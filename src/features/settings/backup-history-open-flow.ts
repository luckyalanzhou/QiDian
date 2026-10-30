type BackupHistoryOpenFlowDependencies = {
  isEditing: () => boolean;
  saveActiveDraft: () => unknown;
  closeSettings: () => void;
  closeMenu: () => void;
  showDialog: () => void;
  refresh: () => Promise<void>;
};

export function createBackupHistoryOpenFlow(dependencies: BackupHistoryOpenFlowDependencies) {
  async function open(): Promise<void> {
    if (dependencies.isEditing()) dependencies.saveActiveDraft();
    dependencies.closeSettings();
    dependencies.closeMenu();
    dependencies.showDialog();
    await dependencies.refresh();
  }

  return { open };
}
