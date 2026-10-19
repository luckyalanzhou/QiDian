import type { VaultData, VaultNote } from '../../../shared/api-contracts.js';
import { duplicateNote } from '../notes/note-actions.ts';
import type { VaultMutationPort } from '../vault/mutation.ts';
import type { ReaderActionCommand } from './reader-action.ts';

type Dependencies = {
  getVault: () => VaultData;
  getCurrentNoteId: () => string | null;
  isPreviewing: () => boolean;
  isDraft: (note: VaultNote) => boolean;
  publishedView: (note: VaultNote) => VaultNote;
  mutation: VaultMutationPort;
  startEditing: () => void;
  previewPendingChanges: () => void;
  publishCurrent: () => Promise<void>;
  confirmDelete: () => Promise<boolean>;
  moveToTrash: (id: string) => Promise<boolean>;
  openHome: () => void;
  openNote: (id: string, forceEdit: boolean) => void;
  notify: (message: string) => void;
};

export function createReaderActions(dependencies: Dependencies) {
  async function togglePinned() {
    const id = dependencies.getCurrentNoteId();
    if (!id || !dependencies.getVault().notes.some(note => note.id === id)) return;

    try {
      const transaction = dependencies.mutation.execute(candidate => {
        const note = candidate.notes.find(item => item.id === id);
        if (!note) throw new Error('笔记已变更，请刷新后重试');
        note.pinned = !note.pinned;
        return note.pinned;
      });
      await transaction.persisted;
      dependencies.notify(transaction.result ? '已收藏' : '已取消收藏');
    } catch (error) {
      dependencies.notify(error instanceof Error ? error.message : '收藏状态尚未保存');
    }
  }

  async function createDuplicate() {
    const id = dependencies.getCurrentNoteId();
    const source = id ? dependencies.getVault().notes.find(note => note.id === id) : undefined;
    if (!source) return;

    const displayed = dependencies.isPreviewing() || dependencies.isDraft(source)
      ? source
      : dependencies.publishedView(source);
    try {
      const transaction = dependencies.mutation.execute(candidate => duplicateNote(candidate, displayed));
      await transaction.persisted;
      dependencies.openNote(transaction.result.id, true);
    } catch (error) {
      dependencies.notify(error instanceof Error ? `创建副本失败：${error.message}` : '创建副本失败');
    }
  }

  async function deleteCurrent() {
    const id = dependencies.getCurrentNoteId();
    if (!id || !await dependencies.confirmDelete()) return;
    if (await dependencies.moveToTrash(id)) dependencies.openHome();
  }

  function execute(command: ReaderActionCommand) {
    switch (command.type) {
      case 'edit-current':
        dependencies.startEditing();
        return;
      case 'show-pending-changes':
        dependencies.previewPendingChanges();
        return;
      case 'publish-current':
        return dependencies.publishCurrent();
      case 'toggle-current-pin':
        return togglePinned();
      case 'duplicate-current':
        return createDuplicate();
      case 'delete-current':
        return deleteCurrent();
    }
  }

  return { execute, togglePinned, createDuplicate, deleteCurrent };
}
