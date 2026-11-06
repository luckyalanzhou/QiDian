import { createLegacyCreateMenu } from '../compat/create-menu/legacy-create-menu.ts';
import { createWorkspaceCreateMenu } from './workspace-create-menu.ts';
import { createWorkspaceNavigationFeature } from './workspace-navigation.ts';
import { createWorkspaceNoteCreation } from './workspace-note-creation.ts';
import { getWorkspaceScrollTop, scrollWorkspaceTo } from '../features/navigation/workspace-scroll.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';
import type { useNavigationActionsStore } from '../features/navigation/navigation-actions-store.ts';
import type { useEditorStore } from '../features/editor/store.ts';
import type { useCreateMenuStore } from '../features/create-menu/store.ts';

type NavigationFeatureDependencies = Parameters<typeof createWorkspaceNavigationFeature>[0];
type NoteCreationDependencies = Parameters<typeof createWorkspaceNoteCreation>[0];
type CreateMenuDependencies = Parameters<typeof createWorkspaceCreateMenu>[0];
type NavigationStore = ReturnType<typeof useNavigationStore>;
type EditorStore = Pick<ReturnType<typeof useEditorStore>, 'setBaseline' | 'setTransientNewNoteId'>;
type NavigationActionsStore = Pick<ReturnType<typeof useNavigationActionsStore>, 'bind'>;
type CreateMenuStore = Pick<ReturnType<typeof useCreateMenuStore>, 'open' | 'closeForNavigation'>;

type WorkspaceNavigationRuntimeDependencies = {
  usesVueWorkspace: boolean;
  document: Document;
  window: Window;
  main: HTMLElement | null;
  getElement: (selector: string) => HTMLElement | null;
  icons: (name: string) => string;
  navigationStore: NavigationStore;
  editorStore: EditorStore;
  shellStore: { mobileMenuOpen: boolean; closeMobileMenu: () => void };
  navigationActionsStore: NavigationActionsStore;
  createMenuStore: CreateMenuStore;
  navigation: Omit<NavigationFeatureDependencies['navigation'], 'getState' | 'setState' | 'getScrollY' | 'scrollTo' | 'openBookmarkFolder' | 'resumeBookmarks' | 'onNavigate'>;
  actions: Omit<NavigationFeatureDependencies['actions'], 'addBookmark' | 'openCreateMenu' | 'openCapture' | 'createNew' | 'createFromMenu' | 'createQuickImage'>;
  noteCreation: Omit<NoteCreationDependencies, 'closeMenu' | 'getNavigationContext' | 'setNavigationState' | 'setNavigationPage' | 'setTransientNewNoteId' | 'setEditorBaseline'>;
  createMenu: Pick<CreateMenuDependencies, 'openImagePicker' | 'setTimer'>;
  bookmarks: {
    openFolder: NavigationFeatureDependencies['navigation']['openBookmarkFolder'];
    resume: NavigationFeatureDependencies['navigation']['resumeBookmarks'];
    addToFolder: (folderId: string) => void;
  };
  openCapture: CreateMenuDependencies['openCapture'];
  onNavigate: NavigationFeatureDependencies['navigation']['onNavigate'];
};

/** Owns the wiring cycle between navigation commands, note creation and the create menu. */
export function createWorkspaceNavigationRuntime(dependencies: WorkspaceNavigationRuntimeDependencies) {
  let mobileMenuFocusController: ReturnType<typeof createWorkspaceNavigationFeature>['mobileMenuFocusController'];
  let workspaceNavigationFeature: ReturnType<typeof createWorkspaceNavigationFeature>;
  let workspaceCreateMenu: ReturnType<typeof createWorkspaceCreateMenu>;

  function closeMenu(returnToButton = false) {
    mobileMenuFocusController.close(returnToButton);
  }

  const newNoteController = createWorkspaceNoteCreation({
    ...dependencies.noteCreation,
    closeMenu,
    getNavigationContext: () => ({
      editing: dependencies.navigationStore.editing,
      typeFilter: dependencies.navigationStore.typeFilter,
      active: dependencies.navigationStore.active
    }),
    setNavigationState: state => {
      dependencies.navigationStore.noteId = state.noteId;
      dependencies.navigationStore.editing = state.editing;
      dependencies.navigationStore.previewing = state.previewing;
      dependencies.navigationStore.editingDraft = state.editingDraft;
    },
    setNavigationPage: page => { dependencies.navigationStore.page = page; },
    setTransientNewNoteId: id => dependencies.editorStore.setTransientNewNoteId(id),
    setEditorBaseline: value => dependencies.editorStore.setBaseline(value)
  });

  const createNew = (type = 'note') => newNoteController.create(type);
  const openBookmarks = (folderId: string | null = null) => workspaceNavigationFeature.navigation.openBookmarks(folderId);
  const addBookmark = (folderId = '') => {
    openBookmarks();
    dependencies.bookmarks.addToFolder(folderId);
  };
  const openTrash = () => workspaceNavigationFeature.navigation.openTrash();
  const openCreateMenu = () => workspaceCreateMenu.open();
  const createFromMenu = (kind: string) => workspaceCreateMenu.createFromMenu(kind);
  const createQuickImage = () => workspaceCreateMenu.createQuickImage();
  const openCapture = () => dependencies.openCapture();

  const legacyCreateMenu = dependencies.usesVueWorkspace
    ? null
    : createLegacyCreateMenu({ document: dependencies.document, icons: dependencies.icons });

  workspaceNavigationFeature = createWorkspaceNavigationFeature({
    focus: {
      document: dependencies.document,
      isOpen: () => dependencies.shellStore.mobileMenuOpen,
      close: () => dependencies.shellStore.closeMobileMenu(),
      getSidebar: () => dependencies.getElement('#sidebar'),
      getMenuButton: () => dependencies.getElement('#menuBtn'),
      getMain: () => dependencies.main,
      scheduleFocus: callback => requestAnimationFrame(callback)
    },
    navigation: {
      ...dependencies.navigation,
      getState: () => dependencies.navigationStore.getWorkspaceState(),
      setState: state => dependencies.navigationStore.setWorkspaceState(state),
      getScrollY: () => getWorkspaceScrollTop(dependencies.window),
      scrollTo: position => scrollWorkspaceTo(dependencies.window, position),
      openBookmarkFolder: dependencies.bookmarks.openFolder,
      resumeBookmarks: dependencies.bookmarks.resume,
      onNavigate: dependencies.onNavigate
    },
    actions: {
      ...dependencies.actions,
      addBookmark: () => addBookmark(),
      openCreateMenu,
      openCapture,
      createNew,
      createFromMenu,
      createQuickImage
    },
    vueMounted: dependencies.usesVueWorkspace
  });
  mobileMenuFocusController = workspaceNavigationFeature.mobileMenuFocusController;

  workspaceCreateMenu = createWorkspaceCreateMenu({
    usesVueWorkspace: dependencies.usesVueWorkspace,
    vueMenu: {
      open: () => dependencies.createMenuStore.open(),
      closeForNavigation: () => dependencies.createMenuStore.closeForNavigation()
    },
    legacyMenu: legacyCreateMenu,
    closeWorkspaceMenu: closeMenu,
    addBookmark: () => addBookmark(),
    openCapture: dependencies.openCapture,
    createNote: createNew,
    openImagePicker: dependencies.createMenu.openImagePicker,
    setTimer: dependencies.createMenu.setTimer
  });
  dependencies.navigationActionsStore.bind(command => workspaceNavigationFeature.actions.execute(command));

  return {
    ...workspaceNavigationFeature,
    newNoteController,
    workspaceCreateMenu,
    legacyCreateMenu,
    closeMenu,
    openBookmarks,
    addBookmark,
    openTrash,
    openCreateMenu,
    createNew
  };
}
