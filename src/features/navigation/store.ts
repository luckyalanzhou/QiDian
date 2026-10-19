import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import type { VaultNote } from '../../../shared/api-contracts.js';
import type { NoteReturnState, WorkspaceNavigationState } from './transitions.ts';

export type NavigationPage = 'dashboard' | 'home' | 'bookmarks' | 'trash' | 'note';

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    page: 'dashboard' as NavigationPage,
    active: 'all',
    typeFilter: 'all',
    noteQuery: '',
    noteId: null as string | null,
    editing: false,
    previewing: false,
    editingDraft: shallowRef<VaultNote | null>(null),
    noteReturn: null as NoteReturnState | null
  }),
  actions: {
    getWorkspaceState(): WorkspaceNavigationState {
      return {
        page: this.page,
        active: this.active,
        typeFilter: this.typeFilter,
        noteQuery: this.noteQuery,
        noteId: this.noteId,
        editing: this.editing,
        previewing: this.previewing,
        editingDraft: this.editingDraft,
        noteReturn: this.noteReturn
      };
    },
    setWorkspaceState(state: WorkspaceNavigationState) {
      this.page = state.page;
      this.active = state.active;
      this.typeFilter = state.typeFilter;
      this.noteQuery = state.noteQuery;
      this.noteId = state.noteId;
      this.editing = state.editing;
      this.previewing = state.previewing;
      this.editingDraft = state.editingDraft;
      this.noteReturn = state.noteReturn;
    }
  }
});
