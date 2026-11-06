import type { Editor } from '@tiptap/core';
import type { VaultData, VaultNote } from '../../shared/api-contracts.js';
import { createEditorAutosaveController } from '../features/editor/autosave-controller.ts';
import { createEditorDraftController } from '../features/editor/draft-controller.ts';
import { createEditorFormAdapter } from '../features/editor/form-adapter.ts';
import type { useEditorStore } from '../features/editor/store.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';

type EditorStore = ReturnType<typeof useEditorStore>;
type NavigationStore = ReturnType<typeof useNavigationStore>;

type WorkspaceEditorDraftDependencies = {
  editorStore: EditorStore;
  navigationStore: NavigationStore;
  getVault: () => VaultData;
  getEditor: () => Editor | null;
  getElement: (selector: string) => HTMLElement | null;
  usesVueWorkspace: boolean;
  isDraft: (note: VaultNote) => boolean;
  hasDraftContent: (note: VaultNote) => boolean;
  snapshot: (note: VaultNote) => string;
  resetPendingPublish: () => void;
  mutateVault: <T>(operation: (vault: VaultData) => T) => T;
  persist: () => unknown;
  cleanHTML: (html: string, strict: boolean) => string;
  setTimer: (callback: () => void, delay: number) => number;
  clearTimer: (handle: number) => void;
};

function createPublishedSnapshot(note: VaultNote): NonNullable<VaultNote['publishedSnapshot']> {
  return {
    title: note.title,
    type: note.type,
    category: note.category,
    tags: [...(note.tags || [])],
    body: note.body,
    source: note.source || '',
    updated: note.updated
  };
}

/** Owns the editor form adapter, draft persistence, and debounced save timer. */
export function createWorkspaceEditorDraftFeature(dependencies: WorkspaceEditorDraftDependencies) {
  const formAdapter = createEditorFormAdapter({
    getVueForm: () => dependencies.usesVueWorkspace ? dependencies.editorStore.form : null,
    getLegacyForm: () => {
      if (dependencies.usesVueWorkspace) return null;
      const title = dependencies.getElement('#editTitle');
      if (!title) return null;
      return {
        title: (title as HTMLInputElement).value,
        type: (dependencies.getElement('#editType')! as HTMLSelectElement).value,
        category: (dependencies.getElement('#editCategory')! as HTMLSelectElement).value,
        tags: (dependencies.getElement('#editTags')! as HTMLInputElement).value,
        source: (dependencies.getElement('#editSource')! as HTMLInputElement).value
      };
    },
    getBodyHTML: () => dependencies.getEditor()?.getHTML() || dependencies.getElement('#editorSurface')!.innerHTML,
    cleanHTML: dependencies.cleanHTML
  });

  const draftController = createEditorDraftController({
    getVault: dependencies.getVault,
    getNoteId: () => dependencies.navigationStore.noteId,
    getEditingDraft: () => dependencies.navigationStore.editingDraft,
    setEditingDraft: note => { dependencies.navigationStore.editingDraft = note; },
    isEditing: () => dependencies.navigationStore.editing,
    isDraft: dependencies.isDraft,
    hasDraftContent: dependencies.hasDraftContent,
    getBaseline: () => dependencies.editorStore.baseline,
    setBaseline: value => dependencies.editorStore.setBaseline(value),
    getTransientNewNoteId: () => dependencies.editorStore.transientNewNoteId,
    clearTransientNewNote: () => dependencies.editorStore.clearTransientNewNote(),
    createPublishedSnapshot,
    snapshot: dependencies.snapshot,
    readEditorFields: formAdapter.readEditorFields,
    resetPendingPublish: dependencies.resetPendingPublish,
    mutateVault: dependencies.mutateVault,
    persist: dependencies.persist
  });

  const autosave = createEditorAutosaveController({
    isEditing: () => dependencies.navigationStore.editing,
    hasEditingDraft: () => !!dependencies.navigationStore.editingDraft,
    saveDraft: () => draftController.saveDraft(true),
    setTimer: dependencies.setTimer,
    clearTimer: handle => dependencies.clearTimer(handle as number)
  });

  return { draftController, autosave };
}
