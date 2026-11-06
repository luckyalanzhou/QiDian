type WorkspaceCreateMenuDependencies = {
  usesVueWorkspace: boolean;
  vueMenu: { open: () => void; closeForNavigation: () => void };
  legacyMenu: { open: () => void; close: () => void } | null;
  closeWorkspaceMenu: () => void;
  addBookmark: () => void;
  openCapture: (options?: { restoreFocusOnClose?: boolean }) => void;
  createNote: (type?: string) => void;
  openImagePicker: () => void;
  setTimer: (callback: () => void, delay: number) => unknown;
};

/** Routes create-menu choices across the Vue and legacy workspace surfaces. */
export function createWorkspaceCreateMenu(dependencies: WorkspaceCreateMenuDependencies) {
  function open() {
    dependencies.closeWorkspaceMenu();
    if (dependencies.usesVueWorkspace) dependencies.vueMenu.open();
    else dependencies.legacyMenu?.open();
  }

  function createFromMenu(kind: string) {
    if (dependencies.usesVueWorkspace) dependencies.vueMenu.closeForNavigation();
    dependencies.legacyMenu?.close();
    if (kind === 'bookmark') dependencies.addBookmark();
    else if (kind === 'capture') dependencies.openCapture({ restoreFocusOnClose: false });
    else dependencies.createNote();
  }

  function createQuickImage() {
    dependencies.createNote('note');
    dependencies.setTimer(dependencies.openImagePicker, 250);
  }

  return { open, createFromMenu, createQuickImage };
}
