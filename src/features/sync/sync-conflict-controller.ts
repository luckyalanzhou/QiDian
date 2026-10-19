import type { useSyncConflictStore } from './store.ts';
import type { ConflictVersionPreview } from './store.ts';

type ConflictNote = { id: string; title?: string; body?: string; [key: string]: unknown };
type ConflictVault = { notes?: ConflictNote[]; theme?: string; trash?: unknown[]; [key: string]: unknown };
type SyncConflict = { base?: ConflictVault | null; local: ConflictVault; remote: ConflictVault };
type SyncConflictStore = ReturnType<typeof useSyncConflictStore>;

type Dependencies = {
  store: SyncConflictStore;
  getConflict: () => SyncConflict | null;
  getPreviewText: (html: string) => string;
  prepareEditor: () => void;
  exportConflict: () => Promise<unknown>;
  confirmRestore: () => Promise<boolean>;
  reloadCloud: () => Promise<ConflictVault>;
  replaceWorkspace: (vault: ConflictVault) => void;
  notify: (message: string) => void;
};

function summarizeVersion(title: string, base: ConflictVault | null | undefined, version: ConflictVault, getPreviewText: Dependencies['getPreviewText']): ConflictVersionPreview {
  const before = new Map((base?.notes || []).map(note => [note.id, note]));
  const after = new Map((version.notes || []).map(note => [note.id, note]));
  const changedIds = [...new Set([...before.keys(), ...after.keys()])]
    .filter(id => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)));

  return {
    title,
    changedCount: changedIds.length,
    notes: changedIds.slice(0, 8).map(id => {
      const note = after.get(id) || before.get(id);
      let excerpt = '';
      try {
        excerpt = getPreviewText(note?.body || '').slice(0, 180);
      } catch {
        excerpt = '';
      }
      return {
        id,
        title: note?.title || '无标题笔记',
        deleted: !after.has(id),
        excerpt: excerpt || '无正文内容'
      };
    })
  };
}

export function createSyncConflictController(dependencies: Dependencies) {
  function open() {
    dependencies.prepareEditor();
    const conflict = dependencies.getConflict();
    if (!conflict) {
      dependencies.notify('当前没有待处理的未合并修改');
      return false;
    }
    dependencies.store.show(
      summarizeVersion('待整理修改', conflict.base, conflict.local, dependencies.getPreviewText),
      summarizeVersion('已保存版本', conflict.base, conflict.remote, dependencies.getPreviewText)
    );
    return true;
  }

  async function downloadBackup() {
    const store = dependencies.store;
    if (!store.visible || store.exporting || store.restoring) return false;
    store.startExport();
    try {
      await dependencies.exportConflict();
      store.exportSucceeded();
      return true;
    } catch (error) {
      store.exportFailed((error as Error)?.message || '对照备份下载失败');
      return false;
    }
  }

  async function restoreCloudVersion() {
    const store = dependencies.store;
    if (!store.backupReady) {
      dependencies.notify('请先下载两版对照备份');
      return false;
    }
    if (store.restoring || store.exporting || !await dependencies.confirmRestore()) return false;

    store.startRestore();
    try {
      const restored = await dependencies.reloadCloud();
      dependencies.replaceWorkspace(restored);
      store.close();
      dependencies.notify('已载入保存版本；当前修改保存在刚下载的对照备份中');
      return true;
    } catch (error) {
      store.restoreFailed((error as Error)?.message || '载入 Docker 服务端版本失败');
      return false;
    } finally {
      store.finishRestore();
    }
  }

  return { open, close: () => dependencies.store.close(), downloadBackup, restoreCloudVersion };
}
