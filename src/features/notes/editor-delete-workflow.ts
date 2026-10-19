import type { VaultData, VaultNote } from '../../../shared/api-contracts.js';

type Dependencies = {
  getVault: () => VaultData;
  getNoteId: () => string | null;
  getEditingDraft: () => VaultNote | null;
  prepareEditingDraft: () => void;
  isTransientNewNote: (id: string) => boolean;
  isDraft: (note: VaultNote) => boolean;
  hasDraftContent: (note: VaultNote) => boolean;
  confirm: (message: string, options: { title: string; confirmText: string; danger: boolean }) => Promise<boolean>;
  clearAutosave: () => void;
  discardDetachedNote: (id: string) => void;
  storeEditingDraft: (note: VaultNote) => void;
  moveToTrash: (id: string) => Promise<boolean>;
  clearTransientState: () => void;
  closeEditor: () => void;
  openHome: () => void;
};

export function createEditorDeleteWorkflow(dependencies: Dependencies) {
  async function removeCurrentNote(): Promise<boolean> {
    const id = dependencies.getNoteId();
    if (!id) return false;

    let pendingDraft = dependencies.getEditingDraft();
    if (pendingDraft?.id === id) {
      dependencies.prepareEditingDraft();
      pendingDraft = dependencies.getEditingDraft();
    }

    const exists = dependencies.getVault().notes.some(note => note.id === id);
    const transient = dependencies.isTransientNewNote(id);
    const emptyDetachedDraft = !exists && pendingDraft?.id === id &&
      dependencies.isDraft(pendingDraft) && !dependencies.hasDraftContent(pendingDraft);
    const discardWithoutTrash = transient || emptyDetachedDraft;
    const message = transient
      ? '放弃这篇尚未保存的新笔记？'
      : emptyDetachedDraft
        ? '这篇笔记内容已清空，不会进入回收站。是否关闭？'
        : '将这篇笔记移入回收站，可在 30 天内还原。是否继续？';

    if (!await dependencies.confirm(message, {
      title: discardWithoutTrash ? '放弃笔记' : '移入回收站',
      confirmText: discardWithoutTrash ? '放弃笔记' : '移入回收站',
      danger: true
    })) return false;

    dependencies.clearAutosave();
    if (discardWithoutTrash) {
      dependencies.discardDetachedNote(id);
      dependencies.clearTransientState();
      dependencies.closeEditor();
      dependencies.openHome();
      return true;
    }

    if (pendingDraft?.id === id) dependencies.storeEditingDraft(pendingDraft);
    if (!await dependencies.moveToTrash(id)) return false;
    dependencies.clearTransientState();
    dependencies.closeEditor();
    dependencies.openHome();
    return true;
  }

  return { removeCurrentNote };
}
