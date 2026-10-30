import type { VaultData } from '../../../shared/api-contracts.js';
import { createTrashEntry } from '../../domain/trash-data.js';
import type { VaultMutationPort } from '../vault/mutation.ts';

type Dependencies = {
  getVault: () => VaultData;
  mutateVault: VaultMutationPort;
  notify: (message: string) => void;
};

export function createNoteDeleteWorkflow(dependencies: Dependencies) {
  async function moveToTrash(id: string): Promise<boolean> {
    const current = dependencies.getVault();
    const index = current.notes.findIndex(note => note.id === id);
    if (index < 0) return false;

    try {
      const transaction = dependencies.mutateVault.execute(candidate => {
        const noteIndex = candidate.notes.findIndex(note => note.id === id);
        if (noteIndex < 0) throw new Error('笔记已变更，请刷新后重试');
        const note = candidate.notes[noteIndex];
        candidate.trash ||= [];
        candidate.trash.push(createTrashEntry('note', note, {
          index: noteIndex,
          previousId: candidate.notes[noteIndex - 1]?.id || '',
          nextId: candidate.notes[noteIndex + 1]?.id || ''
        }));
        candidate.notes.splice(noteIndex, 1);
      });
      await transaction.persisted;
      return true;
    } catch (error) {
      dependencies.notify(error instanceof Error ? error.message : '移入回收站失败');
      return false;
    }
  }

  return { moveToTrash };
}
