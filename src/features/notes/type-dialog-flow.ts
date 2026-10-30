import type { NoteType, VaultData } from '../../../shared/api-contracts.js';
import { createNoteType, deleteNoteType, renameNoteType } from './type-actions.ts';

export type NoteTypeDialogInput = {
  mode: 'create' | 'edit' | 'delete';
  id: string | null;
  name?: string;
  targetId?: string;
  fallbackType?: NoteType;
};

type NoteTypeDialogDependencies = {
  getVault: () => VaultData;
  mutateVault: <T>(operation: (vault: VaultData) => T) => T;
  replaceVault: (vault: VaultData) => void;
  getTypeFilter: () => string;
  setTypeFilter: (filter: string) => void;
  commit: () => Promise<unknown>;
  close: () => void;
  render: () => void;
  notify: (message: string) => void;
};

export function createNoteTypeDialogFlow(dependencies: NoteTypeDialogDependencies) {
  async function save(input: NoteTypeDialogInput): Promise<void> {
    const previous = structuredClone(dependencies.getVault());
    const previousFilter = dependencies.getTypeFilter();

    try {
      if (input.mode === 'delete') {
        if (!input.id) throw new Error('笔记类型不存在');
        const { activeCount, trashCount } = dependencies.mutateVault(vault =>
          deleteNoteType(vault, input.id!, input.targetId || '', input.fallbackType)
        );
        if (dependencies.getTypeFilter() === input.id) dependencies.setTypeFilter('all');
        await dependencies.commit();
        dependencies.close();
        dependencies.render();
        const count = activeCount + trashCount;
        dependencies.notify(count ? `类型已删除，${count} 篇笔记已转移；` : '类型已删除；');
        return;
      }

      if (input.mode === 'create') dependencies.mutateVault(vault => createNoteType(vault, input.name || ''));
      else {
        if (!input.id) throw new Error('笔记类型不存在');
        dependencies.mutateVault(vault => renameNoteType(vault, input.id!, input.name || ''));
      }

      await dependencies.commit();
      dependencies.close();
      dependencies.render();
      dependencies.notify(input.mode === 'create' ? '类型已创建；' : '类型已修改；');
    } catch (error) {
      dependencies.replaceVault(previous);
      dependencies.setTypeFilter(previousFilter);
      dependencies.notify(error instanceof Error ? error.message : '笔记类型修改未完成');
    }
  }

  return { save };
}
