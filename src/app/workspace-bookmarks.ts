import { bookmarksHTML, mergeBookmarks, parseBookmarks } from '../features/bookmarks/data.js';
import { createBookmarkMutationActions } from '../features/bookmarks/mutation-actions.ts';
import type { useBookmarkStore } from '../features/bookmarks/store.ts';
import { createBookmarkView } from '../compat/bookmarks-view.js';

type MutationDependencies = Parameters<typeof createBookmarkMutationActions>[0];
type BookmarkStore = ReturnType<typeof useBookmarkStore>;
type LegacyViewDependencies = {
  main: HTMLElement;
  getVault: MutationDependencies['getVault'];
  mutateVault: (operation: (vault: ReturnType<MutationDependencies['getVault']>) => unknown) => unknown;
  save: () => unknown;
  download: MutationDependencies['download'];
  notify: MutationDependencies['notify'];
  isBookmarksPage: () => boolean;
};
type NavigationDependencies = {
  usesVueWorkspace: boolean;
  isMobileViewport: () => boolean;
  getScrollY: () => number;
  scrollTo: (top: number) => void;
};
type BookmarkWorkspaceDependencies = {
  store: BookmarkStore;
  getVault: MutationDependencies['getVault'];
  download: MutationDependencies['download'];
  fetchMetadata: NonNullable<MutationDependencies['fetchMetadata']>;
  uploadAsset: NonNullable<MutationDependencies['uploadAsset']>;
  mutation: MutationDependencies['mutation'];
  notify: MutationDependencies['notify'];
  domParser: typeof DOMParser;
  legacyView?: LegacyViewDependencies;
  navigation?: NavigationDependencies;
};

/** Owns the bookmark feature's workspace wiring and its store action seam. */
export function createBookmarkWorkspaceFeature(dependencies: BookmarkWorkspaceDependencies) {
  const { store } = dependencies;
  let legacyView: ReturnType<typeof createBookmarkView> | null = null;
  if (dependencies.legacyView && dependencies.navigation && !dependencies.navigation.usesVueWorkspace) {
    legacyView = createBookmarkView({
      main: dependencies.legacyView.main,
      getData: dependencies.legacyView.getVault,
      mutateData: dependencies.legacyView.mutateVault,
      save: dependencies.legacyView.save,
      download: dependencies.legacyView.download,
      notify: dependencies.legacyView.notify,
      viewState: store.viewState,
      onChange: () => {
        if (dependencies.legacyView?.isBookmarksPage()) legacyView?.renderLegacy();
      }
    });
  }
  const mutationActions = createBookmarkMutationActions({
    getBookmarks: () => dependencies.getVault().bookmarks || [],
    getVault: dependencies.getVault,
    getEditor: () => store.editor,
    getDeleteDialog: () => store.deleteDialog,
    getBulkDialog: () => store.bulkDialog,
    getImportDialog: () => store.importDialog,
    getSelectedVisibleIds: () => store.snapshot.sections.flatMap(section => section.links.filter(link => link.selected).map(link => link.id)),
    viewState: store.viewState,
    openEditor: draft => store.openEditor(draft),
    closeEditor: () => store.closeEditor(),
    openDeleteDialog: request => store.openDeleteDialog(request),
    closeDeleteDialog: () => store.closeDeleteDialog(),
    resetAfterClear: () => store.resetAfterClear(),
    reconcileAfterDelete: (ids, parentId) => store.reconcileAfterDelete(ids, parentId),
    clearSelection: ids => store.clearSelection(ids),
    openBulkDialog: (mode, ids) => store.openBulkDialog(mode, ids),
    closeBulkDialog: () => store.closeBulkDialog(),
    openImportDialog: draft => store.openImportDialog(draft),
    closeImportDialog: () => store.closeImportDialog(),
    download: dependencies.download,
    parseImport: html => parseBookmarks(html, dependencies.domParser),
    mergeImport: mergeBookmarks,
    serializeExport: bookmarksHTML,
    setEditorError: message => { if (store.editor) store.editor.error = message; },
    fetchMetadata: dependencies.fetchMetadata,
    uploadAsset: dependencies.uploadAsset,
    mutation: dependencies.mutation,
    notify: dependencies.notify
  });

  return {
    actions: mutationActions,
    legacyView,
    syncPreferences() {
      if (!dependencies.navigation) return;
      if (dependencies.navigation.usesVueWorkspace) store.syncPreferences(dependencies.navigation.isMobileViewport());
      else legacyView?.syncPreferences();
    },
    openFolder(folderId: string) {
      if (dependencies.navigation?.usesVueWorkspace) store.openFolder(folderId, dependencies.navigation.isMobileViewport());
      else legacyView?.openFolder(folderId);
    },
    addToFolder(folderId = '') {
      if (dependencies.navigation?.usesVueWorkspace) store.dispatch({ type: 'add-link', parentId: folderId });
      else legacyView?.addBookmark(folderId);
    },
    resume() {
      if (dependencies.navigation?.usesVueWorkspace) {
        dependencies.navigation.scrollTo(store.resume(dependencies.navigation.isMobileViewport()));
      } else legacyView?.resume();
    },
    leave() {
      if (dependencies.navigation?.usesVueWorkspace) store.leave(dependencies.navigation.getScrollY());
      else legacyView?.leave();
    },
    bindActions: () => store.bindActions(async action => { await mutationActions.execute(action); })
  };
}
