import { reactive } from 'vue';
import type { BackupSummary } from '../../api/contracts';

type BackupHistoryDependencies = {
  listBackups: () => Promise<BackupSummary[]>;
  localPreview: boolean;
};

export function createBackupHistoryFlow(dependencies: BackupHistoryDependencies) {
  const state = reactive({ loading: false, items: [] as BackupSummary[], error: '' });
  let requestId = 0;

  async function refresh() {
    const currentRequest = ++requestId;
    state.loading = true;
    state.error = '';
    state.items = [];
    try {
      const items = await dependencies.listBackups();
      if (currentRequest === requestId) state.items = items.slice(0, 20);
    } catch (error) {
      if (currentRequest === requestId) state.error = (error as Error)?.message || '请稍后重试';
    } finally {
      if (currentRequest === requestId) state.loading = false;
    }
  }

  function emptyMessage() {
    if (state.items.length) return '';
    return dependencies.localPreview ? '本地预览模式不提供服务端快照。' : '当前账号还没有可查看的快照。';
  }

  return { state, refresh, emptyMessage };
}
