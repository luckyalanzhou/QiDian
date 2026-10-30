import type { NoteTypeDialogMode } from './type-dialog-store.ts';

type NoteTypeDialogOpenFlowDependencies = {
  closeMenu: () => void;
  isEditing: () => boolean;
  saveDraft: () => unknown;
  clearAutosave: () => void;
  leaveEditor: () => void;
  render: () => void;
  openDialog: (mode: NoteTypeDialogMode, id: string | null) => void;
};

export function createNoteTypeDialogOpenFlow(dependencies: NoteTypeDialogOpenFlowDependencies) {
  function open(mode: NoteTypeDialogMode, id: string | null = null): void {
    dependencies.closeMenu();

    if (dependencies.isEditing()) {
      dependencies.saveDraft();
      dependencies.clearAutosave();
      dependencies.leaveEditor();
      dependencies.render();
    }

    dependencies.openDialog(mode, id);
  }

  return { open };
}
