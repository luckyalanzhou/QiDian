import { backFromNote as getBackFromNoteTransition, filterHomeByType, resetWorkspaceHome, returnToHomePreservingList, toBookmarks, toDashboard, toHome, toNote, toNoteType, toTrash } from './transitions.ts';
import type { WorkspaceNavigationState } from './transitions.ts';
import type { VaultNote } from '../../../shared/api-contracts.js';

type WorkspaceNavigationDependencies = {
  getState: () => WorkspaceNavigationState;
  setState: (state: WorkspaceNavigationState) => void;
  findNote: (id: string) => VaultNote | undefined;
  isDraft: (note: VaultNote) => boolean;
  saveDraft: () => void;
  clearAutoSave: () => void;
  closeMenu: () => void;
  render: () => void;
  getScrollY: () => number;
  scrollTo: (position: number) => void;
  restoreNoteFocus?: (noteId: string) => void;
  openBookmarkFolder: (folderId: string) => void;
  resumeBookmarks: () => void;
  onNavigate?: (
    state: WorkspaceNavigationState,
    mode: 'push' | 'replace',
    previousState: WorkspaceNavigationState,
    previousScrollY: number
  ) => void;
};

export function createWorkspaceNavigationController(dependencies: WorkspaceNavigationDependencies) {
  function apply(state: WorkspaceNavigationState, options: { scrollTo?: number; closeMenu?: boolean; history?: 'push' | 'replace' | 'none' } = {}) {
    const previousState = dependencies.getState();
    const previousScrollY = dependencies.getScrollY();
    dependencies.setState(state);
    if (options.closeMenu !== false) dependencies.closeMenu();
    dependencies.render();
    dependencies.scrollTo(options.scrollTo ?? 0);
    if (options.history !== 'none') dependencies.onNavigate?.(state, options.history || 'push', previousState, previousScrollY);
  }

  function openHome(category = 'all') {
    if (dependencies.getState().editing) dependencies.saveDraft();
    dependencies.clearAutoSave();
    apply(toHome(dependencies.getState(), category));
  }

  function openDashboard() {
    if (dependencies.getState().editing) dependencies.saveDraft();
    dependencies.clearAutoSave();
    apply(toDashboard(dependencies.getState()));
  }

  function openBookmarks(folderId: string | null = null) {
    if (dependencies.getState().editing) dependencies.saveDraft();
    dependencies.clearAutoSave();
    apply(toBookmarks(dependencies.getState()));
    if (folderId !== null) dependencies.openBookmarkFolder(folderId);
    else dependencies.resumeBookmarks();
  }

  function openTrash() {
    if (dependencies.getState().editing) dependencies.saveDraft();
    dependencies.clearAutoSave();
    apply(toTrash(dependencies.getState()));
  }

  function openNoteType(typeFilter: string) {
    if (dependencies.getState().editing) dependencies.saveDraft();
    dependencies.clearAutoSave();
    apply(toNoteType(dependencies.getState(), typeFilter));
  }

  function filterHome(typeFilter: string) {
    apply(filterHomeByType(dependencies.getState(), typeFilter), {
      closeMenu: false,
      scrollTo: dependencies.getScrollY(),
      history: 'replace'
    });
  }

  function resetHome() {
    dependencies.clearAutoSave();
    apply(resetWorkspaceHome(dependencies.getState()));
  }

  function returnHomePreservingList() {
    dependencies.clearAutoSave();
    apply(returnToHomePreservingList(dependencies.getState()));
  }

  function openNote(id: string, forceEdit = false) {
    const current = dependencies.getState();
    const pendingReturn = toNote(current, { id, forceEdit, exists: false, scroll: dependencies.getScrollY() });
    dependencies.setState(pendingReturn.state);
    if (current.editing) dependencies.saveDraft();
    const note = dependencies.findNote(id);
    if (!note) return false;
    const next = toNote(dependencies.getState(), {
      id,
      forceEdit,
      exists: true,
      isDraft: dependencies.isDraft(note),
      scroll: dependencies.getScrollY()
    });
    apply(next.state, { scrollTo: next.scrollTo });
    return true;
  }

  function backFromNote() {
    const current = dependencies.getState();
    const transition = getBackFromNoteTransition(current);
    if (transition.mode === 'home') {
      openHome(dependencies.getState().active);
      return;
    }
    if (transition.mode === 'reader') dependencies.saveDraft();
    apply(transition.state, { scrollTo: transition.scrollTo, closeMenu: false });
    if (transition.mode === 'restore-list' && current.noteId) dependencies.restoreNoteFocus?.(current.noteId);
  }

  function restoreFromHistory(state: WorkspaceNavigationState, scrollY = 0): boolean {
    if (dependencies.getState().editing) dependencies.saveDraft();
    dependencies.clearAutoSave();
    if (state.page === 'note') {
      const note = state.noteId ? dependencies.findNote(state.noteId) : undefined;
      if (!note) {
        apply(toDashboard(dependencies.getState()), { history: 'none' });
        return false;
      }
      apply({
        ...state,
        noteId: note.id,
        editingDraft: null,
        previewing: state.previewing || dependencies.isDraft(note)
      }, { scrollTo: scrollY, closeMenu: false, history: 'none' });
      return true;
    }
    const safeState = {
      ...state,
      noteId: null,
      editing: false,
      previewing: false,
      editingDraft: null
    };
    apply(safeState, { scrollTo: scrollY, closeMenu: false, history: 'none' });
    return true;
  }

  return { openHome, openDashboard, openBookmarks, openTrash, openNoteType, filterHome, resetHome, returnHomePreservingList, openNote, backFromNote, restoreFromHistory };
}
