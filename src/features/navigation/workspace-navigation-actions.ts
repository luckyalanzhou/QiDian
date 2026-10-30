import type { NavigationCommand, NavigationCommandResult } from './navigation-command.ts';

type NavigationActions = {
  openHome: (category?: string) => void;
  openDashboard: () => void;
  openBookmarks: (folderId?: string | null) => void;
  openTrash: () => void;
  openNoteType: (typeFilter: string) => void;
  filterHome: (typeFilter: string) => void;
  openNote: (id: string, forceEdit?: boolean) => boolean;
  backFromNote: () => void;
};

export type WorkspaceNavigationActionDependencies = {
  navigation: NavigationActions;
  isEditing: () => boolean;
  editorHasChanges: () => boolean;
  confirmLeaveEditor: () => Promise<boolean>;
  addBookmark: () => void;
  openCreateMenu: () => void;
  openCapture: () => void;
  createNew: (type?: string) => void;
  createFromMenu: (kind: string) => void;
  createQuickImage: () => void;
  closeSearch: () => void;
};

type PreventDefault = () => void;

function requiresLeaveConfirmation(command: NavigationCommand): boolean {
  return command.type !== 'filter-home' && command.type !== 'open-create-menu';
}

export function createWorkspaceNavigationActions(dependencies: WorkspaceNavigationActionDependencies) {
  function run(command: NavigationCommand): boolean {
    switch (command.type) {
      case 'dashboard': dependencies.navigation.openDashboard(); return true;
      case 'bookmarks': dependencies.navigation.openBookmarks(command.folderId ?? null); return true;
      case 'add-bookmark': dependencies.addBookmark(); return true;
      case 'trash': dependencies.navigation.openTrash(); return true;
      case 'note-type': dependencies.navigation.openNoteType(command.id); return true;
      case 'home': dependencies.navigation.openHome(command.category); return true;
      case 'open-create-menu': dependencies.openCreateMenu(); return true;
      case 'open-capture': dependencies.openCapture(); return true;
      case 'create-from-menu': dependencies.createFromMenu(command.kind); return true;
      case 'open-note':
        if (command.forceEdit) dependencies.navigation.openNote(command.id, true);
        else dependencies.navigation.openNote(command.id);
        return true;
      case 'create-note': dependencies.createNew(command.kind); return true;
      case 'filter-home': dependencies.navigation.filterHome(command.typeFilter); return true;
      case 'search-result':
        dependencies.closeSearch();
        dependencies.navigation.openNote(command.id);
        return true;
      case 'quick-image': dependencies.createQuickImage(); return true;
      case 'back': dependencies.navigation.backFromNote(); return true;
    }
  }

  function execute(command: NavigationCommand, preventDefault: PreventDefault = () => {}): NavigationCommandResult {
    if (!requiresLeaveConfirmation(command) || !dependencies.isEditing() || !dependencies.editorHasChanges()) {
      return run(command);
    }

    return dependencies.confirmLeaveEditor().then(confirmed => {
      if (!confirmed) {
        preventDefault();
        return true;
      }
      return run(command);
    });
  }

  return { execute };
}
