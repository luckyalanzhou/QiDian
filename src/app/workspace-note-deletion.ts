import { createEditorDeleteWorkflow } from '../features/notes/editor-delete-workflow.ts';
import { createNoteDeleteWorkflow } from '../features/notes/delete-workflow.ts';
import type { VaultData } from '../../shared/api-contracts.js';

type NoteDeleteDependencies = Parameters<typeof createNoteDeleteWorkflow>[0];
type EditorDeleteWorkflowDependencies = Parameters<typeof createEditorDeleteWorkflow>[0];
type EditorDeleteDependencies = Omit<EditorDeleteWorkflowDependencies, 'moveToTrash' | 'discardDetachedNote' | 'storeEditingDraft'> & {
  mutateVault: <T>(operation: (vault: VaultData) => T) => T;
};

type WorkspaceNoteDeletionDependencies = {
  note: NoteDeleteDependencies;
  editor: EditorDeleteDependencies;
  confirmNoteDelete: () => Promise<boolean>;
};

export function createWorkspaceNoteDeletion(dependencies: WorkspaceNoteDeletionDependencies) {
  const noteDeleteWorkflow = createNoteDeleteWorkflow(dependencies.note);
  const editorDeleteWorkflow = createEditorDeleteWorkflow({
    ...dependencies.editor,
    discardDetachedNote: id => dependencies.editor.mutateVault(vault => {
      vault.notes = vault.notes.filter(note => note.id !== id);
    }),
    storeEditingDraft: note => {
      const index = dependencies.editor.getVault().notes.findIndex(item => item.id === note.id);
      const saved = structuredClone(note);
      dependencies.editor.mutateVault(vault => {
        if (index >= 0) vault.notes[index] = saved;
        else vault.notes.unshift(saved);
      });
    },
    moveToTrash: id => noteDeleteWorkflow.moveToTrash(id)
  });

  return {
    noteDeleteWorkflow,
    editorDeleteWorkflow,
    confirmNoteDelete: dependencies.confirmNoteDelete
  };
}
