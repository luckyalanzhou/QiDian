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
  openBookmarkFolder: (folderId: string) => void;
  resumeBookmarks: () => void;
};

export function createWorkspaceNavigationController(dependencies: WorkspaceNavigationDependencies) {
  function apply(state: WorkspaceNavigationState, options: { scrollTo?: number; closeMenu?: boolean } = {}) {
    dependencies.setState(state);
    if (options.closeMenu !== false) dependencies.closeMenu();
    dependencies.render();
    dependencies.scrollTo(options.scrollTo ?? 0);
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
      scrollTo: dependencies.getScrollY()
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
    const transition = backFromNoteState();
    if (transition.mode === 'home') {
      openHome(dependencies.getState().active);
      return;
    }
    if (transition.mode === 'reader') dependencies.saveDraft();
    apply(transition.state, { scrollTo: transition.scrollTo, closeMenu: false });
  }

  function backFromNoteState() {
    return getBackFromNoteTransition(dependencies.getState());
  }

  return { openHome, openDashboard, openBookmarks, openTrash, openNoteType, filterHome, resetHome, returnHomePreservingList, openNote, backFromNote };
}
