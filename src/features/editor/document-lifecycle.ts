export type EditorDocumentLifecycleActions = {
  isEditing: () => boolean;
  hasEditorChanges: () => boolean;
  saveDraft: (quiet?: boolean) => unknown;
  hasUnsavedChanges: () => boolean;
};

export function mountEditorDocumentLifecycle(
  document: Document,
  actions: EditorDocumentLifecycleActions
): () => void {
  function handleBeforeUnload(event: BeforeUnloadEvent) {
    const editing = actions.isEditing();
    const editorChanged = editing && actions.hasEditorChanges();
    if (editing) actions.saveDraft(true);
    if (editorChanged || actions.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden' && actions.isEditing()) actions.saveDraft(true);
  }

  document.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
