import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type { BookmarkAction, BookmarkBulkDialogState, BookmarkDeleteDialogState, BookmarkDeleteRequest, BookmarkEditorDraft, BookmarkImportDialogState, BookmarkSnapshot } from './types';
import { useVaultStore } from '../vault/store';
import { useNavigationStore } from '../navigation/store';
import { createBookmarkSnapshot } from './snapshot';
import type { BookmarkViewState } from './snapshot';
import { applyBookmarkViewAction } from './view-actions';

const emptySnapshot = (): BookmarkSnapshot => ({
  bookmarkCount: 0,
  folderCount: 0,
  organizing: false,
  directoryOpen: true,
  selectedFolder: '',
  selectedPath: '',
  query: '',
  pinnedOnly: false,
  folders: [],
  subgroups: [],
  sections: [],
  emptyMessage: '添加网址，或在整理模式中导入浏览器书签。',
  selection: { count: 0, visibleCount: 0, allSelected: false, indeterminate: false, scope: '全部网址' }
});

export type BookmarkActionHandler = (action: BookmarkAction) => void | Promise<void>;

export const useBookmarkStore = defineStore('bookmarks', () => {
  const vault = useVaultStore();
  const navigation = useNavigationStore();
  const active = computed(() => vault.ready && navigation.page === 'bookmarks');
  const viewState = reactive<BookmarkViewState>({
    closed: new Set<string>(),
    selected: new Set<string>(),
    query: '',
    organizing: false,
    selectedFolder: '',
    pinnedOnly: false,
    directoryOpen: true
  });
  const editor = ref<BookmarkEditorDraft | null>(null);
  const deleteDialog = ref<BookmarkDeleteDialogState | null>(null);
  const bulkDialog = ref<BookmarkBulkDialogState | null>(null);
  const importDialog = ref<BookmarkImportDialogState | null>(null);
  let savedScrollY = 0;
  let actionHandler: BookmarkActionHandler = () => undefined;
  const snapshot = computed(() => {
    void vault.generation;
    return vault.ready && vault.value ? createBookmarkSnapshot(vault.value, viewState) : emptySnapshot();
  });

  function bindActions(handler: BookmarkActionHandler) {
    actionHandler = handler;
  }

  function dispatch(action: BookmarkAction) {
    const visibleLinkIds = snapshot.value.sections.flatMap(section => section.links.map(link => link.id));
    if (applyBookmarkViewAction(viewState, action, visibleLinkIds)) return;
    return actionHandler(action);
  }

  function openEditor(draft: Omit<BookmarkEditorDraft, 'error' | 'saving'>) {
    editor.value = { ...draft, error: '', saving: false };
  }

  function closeEditor() {
    if (editor.value?.saving) return;
    editor.value = null;
  }

  function openDeleteDialog(request: BookmarkDeleteRequest) {
    deleteDialog.value = { request, mode: 'keep', error: '', saving: false };
  }

  function closeDeleteDialog() {
    if (deleteDialog.value?.saving) return;
    deleteDialog.value = null;
  }

  function resetAfterClear() {
    viewState.selected.clear();
    viewState.selectedFolder = '';
    viewState.query = '';
    viewState.pinnedOnly = false;
    viewState.closed.clear();
    viewState.organizing = false;
  }

  function reconcileAfterDelete(deletedIds: string[], parentId: string) {
    const removed = new Set(deletedIds);
    for (const id of removed) viewState.selected.delete(id);
    if (removed.has(viewState.selectedFolder)) viewState.selectedFolder = parentId;
  }

  function clearSelection(ids: string[]) {
    for (const id of ids) viewState.selected.delete(id);
  }

  function syncPreferences(isMobile = false) {
    const value = vault.value;
    viewState.closed.clear();
    for (const [id, open] of Object.entries(value?.bookmarkFolderStates || {})) {
      if (!open) viewState.closed.add(id);
    }
    viewState.directoryOpen = typeof value?.bookmarkDirectoryOpen === 'boolean'
      ? value.bookmarkDirectoryOpen
      : !isMobile;
  }

  function openFolder(id: string, isMobile = false) {
    viewState.selectedFolder = id;
    viewState.query = '';
    viewState.pinnedOnly = false;
    viewState.selected.clear();
    viewState.organizing = false;
    if (isMobile) viewState.directoryOpen = false;
  }

  function leave(scrollY: number) {
    savedScrollY = scrollY;
    viewState.selected.clear();
    viewState.organizing = false;
  }

  function resume(isMobile = false) {
    syncPreferences(isMobile);
    return savedScrollY;
  }

  function openBulkDialog(mode: BookmarkBulkDialogState['mode'], ids: string[]) {
    if (!ids.length) return;
    bulkDialog.value = { mode, ids: [...ids], targetId: '', error: '', saving: false };
  }

  function closeBulkDialog() {
    if (bulkDialog.value?.saving) return;
    bulkDialog.value = null;
  }

  function openImportDialog(draft: Omit<BookmarkImportDialogState, 'error' | 'saving'>) {
    importDialog.value = { ...draft, error: '', saving: false };
  }

  function closeImportDialog() {
    if (importDialog.value?.saving) return;
    importDialog.value = null;
  }

  return { active, snapshot, viewState, editor, deleteDialog, bulkDialog, importDialog, bindActions, dispatch, openEditor, closeEditor, openDeleteDialog, closeDeleteDialog, resetAfterClear, reconcileAfterDelete, clearSelection, syncPreferences, openFolder, leave, resume, openBulkDialog, closeBulkDialog, openImportDialog, closeImportDialog };
});
