import { createNoteController } from '../features/notes/create-note-controller.ts';
import type { VaultData, VaultNote } from '../../shared/api-contracts.js';

type NoteControllerDependencies = Omit<Parameters<typeof createNoteController>[0], 'getContext' | 'activate'>;

type WorkspaceNoteCreationDependencies = {
  getVault: () => VaultData;
  mutateVault: NoteControllerDependencies['mutateVault'];
  saveDraft: NoteControllerDependencies['saveDraft'];
  closeMenu: NoteControllerDependencies['closeMenu'];
  render: NoteControllerDependencies['render'];
  scrollToTop: () => void;
  focusTitle: () => void;
  getEditorBaseline: (note: VaultNote) => string;
  setEditorBaseline: (value: string) => void;
  setTransientNewNoteId: (id: string | null) => void;
  setNavigationState: (state: { noteId: string; editing: true; previewing: false; editingDraft: VaultData['notes'][number] }) => void;
  setNavigationPage: (page: 'note') => void;
  getNavigationContext: () => { editing: boolean; typeFilter: string; active: string };
};

/** Owns the transition from a new-note command into the active editor session. */
export function createWorkspaceNoteCreation(dependencies: WorkspaceNoteCreationDependencies) {
  const controller = createNoteController({
    getContext: dependencies.getNavigationContext,
    getVault: dependencies.getVault,
    mutateVault: dependencies.mutateVault,
    saveDraft: dependencies.saveDraft,
    activate: note => {
      dependencies.setTransientNewNoteId(note.id);
      dependencies.setNavigationState({
        noteId: note.id,
        editing: true,
        previewing: false,
        editingDraft: JSON.parse(JSON.stringify(note))
      });
      dependencies.setEditorBaseline(dependencies.getEditorBaseline(note));
      dependencies.setNavigationPage('note');
    },
    closeMenu: dependencies.closeMenu,
    render: dependencies.render,
    scrollToTop: dependencies.scrollToTop,
    focusTitle: dependencies.focusTitle
  });

  return { create: (type = 'note') => controller.create(type) };
}
