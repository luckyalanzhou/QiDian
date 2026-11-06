type Closeable = { close: () => void };

export type WorkspaceDialogControlsDependencies = {
  profileSettings: Closeable;
  appSettings: Closeable;
  backupHistory: Closeable;
  systemUpdates: Closeable;
  getElement: (selector: string) => Pick<Element, 'classList'> | null;
};

/** Coordinates dialog closing behavior shared by workspace keyboard and legacy shell events. */
export function createWorkspaceDialogControls(dependencies: WorkspaceDialogControlsDependencies) {
  function closeSettingsOverlays() {
    dependencies.profileSettings.close();
    dependencies.appSettings.close();
    dependencies.systemUpdates.close();
  }

  function closeTarget(id: string) {
    if (id === 'profileSettingsOverlay') dependencies.profileSettings.close();
    else if (id === 'appSettingsOverlay') dependencies.appSettings.close();
    else if (id === 'backupHistoryOverlay') dependencies.backupHistory.close();
    else dependencies.getElement(`#${id}`)?.classList.remove('open');
  }

  return { closeSettingsOverlays, closeTarget };
}
