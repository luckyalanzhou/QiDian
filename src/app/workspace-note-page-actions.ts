import { createWorkspaceNoteActions } from './workspace-note-actions.ts';
import type { useEditorPageActionsStore } from '../features/editor/editor-page-actions-store.ts';
import type { useReaderActionsStore } from '../features/reader/reader-actions-store.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';

type Actions = Parameters<typeof createWorkspaceNoteActions>[0];
type ReaderActions = Actions['reader'];
type EditorPageActions = Actions['editorPage'];

type WorkspaceNotePageActionsDependencies = {
  readerStore: Pick<ReturnType<typeof useReaderActionsStore>, 'bind'>;
  editorPageStore: Pick<ReturnType<typeof useEditorPageActionsStore>, 'bind'>;
  navigationStore: Pick<ReturnType<typeof useNavigationStore>, 'editing' | 'previewing' | 'editingDraft'>;
  render: () => void;
  reader: Omit<ReaderActions, 'confirmDelete' | 'startEditing' | 'previewPendingChanges'>;
  editorPage: Omit<EditorPageActions, 'saveCurrent' | 'deleteCurrent'>;
  confirmNoteDelete: ReaderActions['confirmDelete'];
  deleteEditorNote: EditorPageActions['deleteCurrent'];
};

/** Owns page-level reader/editor command wiring around their feature actions. */
export function createWorkspaceNotePageActions(dependencies: WorkspaceNotePageActionsDependencies) {
  const publishCurrentNote = dependencies.reader.publishCurrent;
  return createWorkspaceNoteActions({
    readerStore: dependencies.readerStore,
    editorPageStore: dependencies.editorPageStore,
    reader: {
      ...dependencies.reader,
      confirmDelete: dependencies.confirmNoteDelete,
      startEditing: () => {
        dependencies.navigationStore.editing = true;
        dependencies.navigationStore.previewing = false;
        dependencies.navigationStore.editingDraft = null;
        dependencies.render();
      },
      previewPendingChanges: () => {
        dependencies.navigationStore.previewing = true;
        dependencies.render();
      }
    },
    editorPage: {
      ...dependencies.editorPage,
      saveCurrent: () => { void publishCurrentNote(); },
      deleteCurrent: dependencies.deleteEditorNote
    }
  });
}
