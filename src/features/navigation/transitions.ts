import type { VaultNote } from '../../../shared/api-contracts.js';

export type WorkspacePage = 'dashboard' | 'home' | 'bookmarks' | 'trash' | 'note';

export type NoteReturnState = {
  active: string;
  typeFilter: string;
  query: string;
  scroll: number;
};

export type WorkspaceNavigationState = {
  page: WorkspacePage;
  active: string;
  typeFilter: string;
  noteQuery: string;
  noteId: string | null;
  editing: boolean;
  previewing: boolean;
  editingDraft: VaultNote | null;
  noteReturn: NoteReturnState | null;
};

export type NoteNavigationResult = {
  state: WorkspaceNavigationState;
  found: boolean;
  scrollTo: number;
};

export type BackNavigationResult = {
  state: WorkspaceNavigationState;
  mode: 'reader' | 'restore-list' | 'home';
  scrollTo: number;
};

export function toHome(state: WorkspaceNavigationState, category = 'all'): WorkspaceNavigationState {
  return {
    ...state,
    page: 'home',
    active: category,
    typeFilter: 'all',
    noteQuery: '',
    noteId: null,
    editing: false,
    previewing: false,
    editingDraft: null
  };
}

export function resetWorkspaceHome(state: WorkspaceNavigationState): WorkspaceNavigationState {
  return { ...toHome(state, 'all'), noteReturn: null };
}

export function returnToHomePreservingList(state: WorkspaceNavigationState): WorkspaceNavigationState {
  return { ...state, page: 'home', noteId: null, editing: false, previewing: false, editingDraft: null };
}

export function toDashboard(state: WorkspaceNavigationState): WorkspaceNavigationState {
  return {
    ...state,
    page: 'dashboard',
    active: 'all',
    typeFilter: 'all',
    noteId: null,
    editing: false,
    previewing: false,
    editingDraft: null
  };
}

export function toBookmarks(state: WorkspaceNavigationState): WorkspaceNavigationState {
  return { ...state, page: 'bookmarks', noteId: null, editing: false, previewing: false, editingDraft: null };
}

export function toTrash(state: WorkspaceNavigationState): WorkspaceNavigationState {
  return { ...state, page: 'trash', noteId: null, editing: false, previewing: false, editingDraft: null };
}

export function toNoteType(state: WorkspaceNavigationState, typeFilter: string): WorkspaceNavigationState {
  return {
    ...state,
    page: 'home',
    active: 'all',
    typeFilter,
    noteId: null,
    editing: false,
    previewing: false,
    editingDraft: null
  };
}

export function filterHomeByType(state: WorkspaceNavigationState, typeFilter: string): WorkspaceNavigationState {
  return { ...state, typeFilter };
}

export function toNote(
  state: WorkspaceNavigationState,
  input: { id: string; forceEdit?: boolean; exists: boolean; isDraft?: boolean; scroll: number }
): NoteNavigationResult {
  const noteReturn = state.page === 'home'
    ? { active: state.active, typeFilter: state.typeFilter, query: state.noteQuery, scroll: input.scroll }
    : state.page === 'note' ? state.noteReturn : null;
  if (!input.exists) return { state: { ...state, noteReturn }, found: false, scrollTo: input.scroll };
  return {
    state: {
      ...state,
      page: 'note',
      noteId: input.id,
      noteReturn,
      editing: !!input.forceEdit,
      previewing: state.active === 'drafts' || !!input.isDraft,
      editingDraft: null
    },
    found: true,
    scrollTo: 0
  };
}

export function backFromNote(state: WorkspaceNavigationState): BackNavigationResult {
  if (state.editing) {
    return {
      state: { ...state, editing: false, editingDraft: null, previewing: true },
      mode: 'reader',
      scrollTo: 0
    };
  }
  if (state.noteReturn) {
    return {
      state: {
        ...state,
        page: 'home',
        active: state.noteReturn.active,
        typeFilter: state.noteReturn.typeFilter,
        noteQuery: state.noteReturn.query
      },
      mode: 'restore-list',
      scrollTo: state.noteReturn.scroll
    };
  }
  return { state: toHome(state, state.active), mode: 'home', scrollTo: 0 };
}
