import type { NavigationCommand, NavigationCommandResult } from './navigation-command.ts';

type NavigationActions = {
  openHome: (category?: string) => void;
  openDashboard: () => void;
  openBookmarks: () => void;
  openTrash: () => void;
  openNoteType: (typeFilter: string) => void;
  filterHome: (typeFilter: string) => void;
  openNote: (id: string, forceEdit?: boolean) => boolean;
  backFromNote: () => void;
};

type WorkspaceNavigationEventDependencies = {
  navigation: NavigationActions;
  isEditing: () => boolean;
  editorHasChanges: () => boolean;
  confirmLeaveEditor: () => Promise<boolean>;
  addBookmark: () => void;
  openCreateMenu: () => void;
  createNew: (type?: string) => void;
  createFromMenu: (kind: string) => void;
  createQuickImage: () => void;
  closeSearch: () => void;
};

type ClickEvent = {
  target: EventTarget | null;
  preventDefault: () => void;
};

const EDIT_EXIT_SELECTOR = '#backDoc,#brandHome,[data-dashboard],#openBookmarks,#mobileBookmarks,[data-open-bookmarks],[data-dashboard-add-bookmark],[data-nav],[data-type-nav],[data-open],[data-search-id],[data-new],[data-create-kind],#quickImage,#mobileCats,#mobileHome,[data-trash-nav]';

function closest(target: EventTarget | null, selector: string): Element | null {
  if (!target || typeof (target as Element).closest !== 'function') return null;
  return (target as Element).closest(selector);
}

function attribute(element: Element, name: string): string {
  return element.getAttribute(name) || '';
}

function commandFromTarget(target: EventTarget | null): NavigationCommand | null {
  if (closest(target, '#openBookmarks,#mobileBookmarks,[data-open-bookmarks]')) return { type: 'bookmarks' };
  if (closest(target, '[data-dashboard-add-bookmark]')) return { type: 'add-bookmark' };
  if (closest(target, '[data-dashboard],#brandHome,#mobileHome')) return { type: 'dashboard' };
  if (closest(target, '[data-trash-nav]')) return { type: 'trash' };

  const typeNavigation = closest(target, '[data-type-nav]');
  if (typeNavigation) return { type: 'note-type', id: attribute(typeNavigation, 'data-type-nav') };

  const homeNavigation = closest(target, '[data-nav]');
  if (homeNavigation || closest(target, '#mobileCats')) {
    return { type: 'home', category: homeNavigation ? attribute(homeNavigation, 'data-nav') : 'all' };
  }

  const createKind = closest(target, '[data-create-kind]');
  if (createKind) return { type: 'create-from-menu', kind: attribute(createKind, 'data-create-kind') };
  if (closest(target, '#mobileNew')) return { type: 'open-create-menu' };

  const editNote = closest(target, '[data-note-edit]');
  if (editNote) return { type: 'open-note', id: attribute(editNote, 'data-note-edit'), forceEdit: true };

  const openNote = closest(target, '[data-open]');
  if (openNote) return { type: 'open-note', id: attribute(openNote, 'data-open') };

  const createNote = closest(target, '[data-new]');
  if (createNote) return { type: 'create-note', kind: attribute(createNote, 'data-new') || undefined };

  const filter = closest(target, '.home-type-tabs [data-type]');
  if (filter) return { type: 'filter-home', typeFilter: attribute(filter, 'data-type') };

  const searchResult = closest(target, '[data-search-id]');
  if (searchResult) return { type: 'search-result', id: attribute(searchResult, 'data-search-id') };
  if (closest(target, '#quickImage')) return { type: 'quick-image' };
  if (closest(target, '#backDoc')) return { type: 'back' };
  return null;
}

function requiresLeaveConfirmation(command: NavigationCommand): boolean {
  return command.type !== 'filter-home' && command.type !== 'open-create-menu';
}

export function createWorkspaceNavigationEvents(dependencies: WorkspaceNavigationEventDependencies) {
  function run(command: NavigationCommand): boolean {
    switch (command.type) {
      case 'dashboard': dependencies.navigation.openDashboard(); return true;
      case 'bookmarks': dependencies.navigation.openBookmarks(); return true;
      case 'add-bookmark': dependencies.addBookmark(); return true;
      case 'trash': dependencies.navigation.openTrash(); return true;
      case 'note-type': dependencies.navigation.openNoteType(command.id); return true;
      case 'home': dependencies.navigation.openHome(command.category); return true;
      case 'open-create-menu': dependencies.openCreateMenu(); return true;
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

  function execute(command: NavigationCommand, preventDefault: () => void = () => {}): NavigationCommandResult {
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

  function handle(event: ClickEvent): NavigationCommandResult {
    const command = commandFromTarget(event.target);
    return command ? execute(command, () => event.preventDefault()) : false;
  }

  return { handle, execute };
}
