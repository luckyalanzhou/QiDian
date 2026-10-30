import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { BackupSummary } from '../../api/contracts';

export type BackupHistoryOptions = {
  listBackups: () => Promise<BackupSummary[]>;
  localPreview: boolean;
  downloadSnapshot: (revision: string | number) => Promise<unknown>;
  restoreSnapshot: (revision: string | number) => Promise<unknown>;
};

export const useBackupHistoryStore = defineStore('backup-history', () => {
  const options = shallowRef<BackupHistoryOptions | null>(null);
  const open = ref(false);
  let refreshHandler: (() => Promise<void>) | null = null;

  function configure(next: BackupHistoryOptions) {
    options.value = next;
  }

  function bindRefreshHandler(handler: (() => Promise<void>) | null) {
    refreshHandler = handler;
  }

  function show() {
    open.value = true;
  }

  function close() {
    open.value = false;
  }

  async function refresh() {
    await refreshHandler?.();
  }

  return { options, open, configure, bindRefreshHandler, show, close, refresh };
});
