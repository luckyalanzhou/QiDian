import type { NoteType, VaultData } from '../../shared/api-contracts.js';
import { DEFAULT_NOTE_TYPES } from '../../shared/vault-validation.js';
import { createLegacyNoteTypeDialog } from '../compat/notes/legacy-type-dialog.ts';
import { createNoteTypeDialogFlow } from '../features/notes/type-dialog-flow.ts';
import { createNoteTypeDialogOpenFlow } from '../features/notes/type-dialog-open-flow.ts';
import { createNoteTypeDialogPresenter } from '../features/notes/type-dialog-presenter.ts';
import type { useNoteTypeDialogStore } from '../features/notes/type-dialog-store.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';

type NoteTypeDialogStore = Pick<ReturnType<typeof useNoteTypeDialogStore>, 'open' | 'close' | 'bindSave'>;
type NavigationStore = ReturnType<typeof useNavigationStore>;

export function createWorkspaceNoteTypeLabels(getVault: () => VaultData) {
  const displayTypeName = (type: NoteType) => type.id === 'clip' && type.name === '网页收藏' ? '网页摘录' : type.name;
  const typeLabel = (id: string) => {
    const type = getVault().noteTypes?.find(candidate => candidate.id === id);
    return type ? displayTypeName(type) : '其他类型';
  };

  return { displayTypeName, typeLabel };
}

type WorkspaceNoteTypeDependencies = {
  document: Document;
  escapeHTML: (value: unknown) => string;
  usesVueWorkspace: boolean;
  dialogStore: NoteTypeDialogStore;
  navigationStore: NavigationStore;
  getElement: (selector: string) => HTMLElement | null;
  getVault: () => VaultData;
  mutateVault: <T>(operation: (vault: VaultData) => T) => T;
  persist: () => unknown;
  replaceVault: (vault: VaultData) => void;
  displayTypeName: (type: NoteType) => string;
  closeMenu: () => void;
  saveDraft: () => unknown;
  clearAutosave: () => void;
  render: () => void;
  commit: () => Promise<unknown>;
  notify: (message: string) => void;
};

/** Composes note type editing for Vue and the legacy workspace adapter. */
export function createWorkspaceNoteTypeDialogs(dependencies: WorkspaceNoteTypeDependencies) {
  const legacyDialog = dependencies.usesVueWorkspace
    ? null
    : createLegacyNoteTypeDialog({ document: dependencies.document, escapeHtml: dependencies.escapeHTML });

  const presenter = createNoteTypeDialogPresenter({
    getVault: dependencies.getVault,
    defaultNoteTypes: DEFAULT_NOTE_TYPES,
    displayTypeName: dependencies.displayTypeName,
    vueMounted: dependencies.usesVueWorkspace,
    vueDialog: dependencies.dialogStore,
    legacyDialog,
    notify: dependencies.notify
  });

  const flow = createNoteTypeDialogFlow({
    getVault: dependencies.getVault,
    mutateVault: dependencies.mutateVault,
    replaceVault: dependencies.replaceVault,
    getTypeFilter: () => dependencies.navigationStore.typeFilter,
    setTypeFilter: filter => { dependencies.navigationStore.typeFilter = filter; },
    commit: dependencies.commit,
    close: () => {
      if (dependencies.usesVueWorkspace) dependencies.dialogStore.close();
      else legacyDialog?.close();
    },
    render: dependencies.render,
    notify: dependencies.notify
  });

  const openFlow = createNoteTypeDialogOpenFlow({
    closeMenu: dependencies.closeMenu,
    isEditing: () => dependencies.navigationStore.editing,
    saveDraft: dependencies.saveDraft,
    clearAutosave: dependencies.clearAutosave,
    leaveEditor: () => {
      dependencies.navigationStore.editing = false;
      dependencies.navigationStore.editingDraft = null;
    },
    render: dependencies.render,
    openDialog: (mode, id) => presenter.open(mode, id)
  });

  if (dependencies.usesVueWorkspace) dependencies.dialogStore.bindSave(input => flow.save(input));

  async function saveLegacy() {
    if (!legacyDialog) return;
    await flow.save(legacyDialog.readSubmission(DEFAULT_NOTE_TYPES.find(type => type.id === 'note')));
  }

  function isExpanded() {
    return dependencies.getVault().noteTypesExpanded !== false;
  }

  function toggleExpanded() {
    const next = !isExpanded();
    dependencies.mutateVault(vault => { vault.noteTypesExpanded = next; });
    if (!dependencies.usesVueWorkspace) {
      const list = dependencies.getElement('#sideTypes');
      const toggle = dependencies.getElement('#toggleNoteTypes');
      if (list) list.hidden = !next;
      toggle?.setAttribute('aria-expanded', String(next));
      toggle?.setAttribute('aria-label', next ? '折叠笔记类型' : '展开笔记类型');
      toggle?.setAttribute('title', next ? '折叠笔记类型' : '展开笔记类型');
    }
    dependencies.persist();
  }

  return { legacyDialog, open: openFlow.open, save: flow.save, saveLegacy, isExpanded, toggleExpanded };
}
