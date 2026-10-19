import type { BookmarkAction } from './types';
import type { BookmarkViewState } from './snapshot';

export function applyBookmarkViewAction(
  state: BookmarkViewState,
  action: BookmarkAction,
  visibleLinkIds: readonly string[]
): boolean {
  switch (action.type) {
    case 'select-folder':
      state.selectedFolder = action.id;
      state.query = '';
      state.pinnedOnly = false;
      state.selected.clear();
      if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches) {
        state.directoryOpen = false;
      }
      return true;
    case 'toggle-organizing':
      state.organizing = !state.organizing;
      state.selected.clear();
      return true;
    case 'toggle-pinned':
      state.pinnedOnly = !state.pinnedOnly;
      state.selectedFolder = '';
      state.selected.clear();
      return true;
    case 'search':
      state.query = action.query.trim().toLocaleLowerCase();
      state.selected.clear();
      return true;
    case 'select-link':
      if (action.selected) state.selected.add(action.id);
      else state.selected.delete(action.id);
      return true;
    case 'select-all':
      state.selected.clear();
      if (action.selected) visibleLinkIds.forEach(id => state.selected.add(id));
      return true;
    default:
      return false;
  }
}
