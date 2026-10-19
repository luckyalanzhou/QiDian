import type { VaultData } from '../../../shared/api-contracts.js';
import { pruneExpiredTrash, restoreTrashEntry, TRASH_RETENTION_MS } from '../../trash-data.js';
import type { VaultMutationPort } from '../vault/mutation.ts';

type Dependencies = {
  getVault: () => VaultData;
  mutateVault: VaultMutationPort;
  confirmClear: (count: number) => Promise<boolean>;
  notify: (message: string) => void;
  now?: () => number;
};

export function createTrashWorkflows(dependencies: Dependencies) {
  let clearing = false;
  const restoring = new Set<string>();

  async function restore(id: string): Promise<boolean> {
    if (clearing || restoring.size > 0) return false;
    restoring.add(id);
    try {
      const transaction = dependencies.mutateVault.execute(candidate => restoreTrashEntry(candidate, id));
      await transaction.persisted;
      return true;
    } catch (error) {
      dependencies.notify(error instanceof Error ? error.message : '还原失败');
      return false;
    } finally {
      restoring.delete(id);
    }
  }

  async function clearAll(): Promise<boolean> {
    if (clearing || restoring.size > 0) return false;
    const previous = structuredClone(dependencies.getVault());
    const count = previous.trash?.length || 0;
    if (!count) return false;

    clearing = true;
    try {
      if (!await dependencies.confirmClear(count)) return false;
      if (JSON.stringify(dependencies.getVault()) !== JSON.stringify(previous)) {
        dependencies.notify('回收站内容已变化，请重新确认');
        return false;
      }
      const transaction = dependencies.mutateVault.execute(candidate => { candidate.trash = []; });
      await transaction.persisted;
      return true;
    } catch (error) {
      dependencies.notify(error instanceof Error ? error.message : '清空未完成');
      return false;
    } finally {
      clearing = false;
    }
  }

  function pruneExpired(now = (dependencies.now || Date.now)()): number {
    if (clearing || restoring.size > 0) return 0;
    const current = dependencies.getVault();
    const count = (current.trash || []).filter(entry => now - entry.deletedAt >= TRASH_RETENTION_MS).length;
    if (!count) return 0;

    const transaction = dependencies.mutateVault.execute(candidate => pruneExpiredTrash(candidate, now));
    void transaction.persisted.catch(error => {
      dependencies.notify(error instanceof Error ? error.message : '过期内容尚未清理');
    });
    return transaction.result;
  }

  return { restore, clearAll, pruneExpired };
}
