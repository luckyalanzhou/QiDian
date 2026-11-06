import { createEditorPageActions } from '../features/editor/page-actions.ts';
import type { useEditorPageActionsStore } from '../features/editor/editor-page-actions-store.ts';
import { createReaderActions } from '../features/reader/actions.ts';
import type { useReaderActionsStore } from '../features/reader/reader-actions-store.ts';

type ReaderActionsStore = Pick<ReturnType<typeof useReaderActionsStore>, 'bind'>;
type EditorPageActionsStore = Pick<ReturnType<typeof useEditorPageActionsStore>, 'bind'>;

type WorkspaceNoteActionsDependencies = {
  readerStore: ReaderActionsStore;
  editorPageStore: EditorPageActionsStore;
  reader: Parameters<typeof createReaderActions>[0];
  editorPage: Parameters<typeof createEditorPageActions>[0];
};

export function createWorkspaceNoteActions(dependencies: WorkspaceNoteActionsDependencies) {
  const readerActions = createReaderActions(dependencies.reader);
  const editorPageActions = createEditorPageActions(dependencies.editorPage);

  dependencies.readerStore.bind(readerActions.execute);
  dependencies.editorPageStore.bind(editorPageActions.execute);

  return { readerActions, editorPageActions };
}
