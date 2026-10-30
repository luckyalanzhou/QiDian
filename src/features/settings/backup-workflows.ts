export type BackupNote = { id: string; body?: string; [key: string]: unknown };
export type BackupVault = { notes: BackupNote[]; theme?: string; trash?: unknown[]; [key: string]: unknown };
export type BackupRevision = string | number;
export type BackupImportProgress = { stage: string; current?: number; total?: number };

export type BackupWorkflowDependencies = {
  localPreview: boolean;
  getData: () => BackupVault;
  saveActiveEditor: () => unknown | Promise<unknown>;
  flush: () => Promise<boolean>;
  getLastError: () => string;
  confirmAction: (message: string, options: { title: string; confirmText: string; danger?: boolean }) => Promise<boolean>;
  getBackup: (revision: BackupRevision) => Promise<unknown>;
  exportBackup: (data: BackupVault) => Promise<unknown>;
  createBackupSnapshot: () => Promise<unknown>;
  prepareBackup: (file: File) => Promise<{ data: BackupVault; assetsToUpload: number; [key: string]: unknown }>;
  uploadPreparedBackup: (prepared: unknown, importScopeId?: string, onProgress?: (progress: BackupImportProgress) => void) => Promise<BackupVault>;
  validateVault: (data: BackupVault) => BackupVault;
  cleanHTML: (html: unknown, keepStyles?: boolean) => string;
  commitSave: (data: BackupVault) => Promise<unknown>;
  beginImport: () => void;
  prepareImport: () => Promise<number>;
  createImportScope: () => Promise<{ id: string }>;
  abortImportScope: (id: string) => Promise<{ status: string; resultRevision: number | null }>;
  commitImport: (revision: number, scopeId: string | null, data: BackupVault) => Promise<unknown>;
  finishImport: () => void;
  setImportProgress: (progress: BackupImportProgress) => void;
  replaceWorkspace: (data: BackupVault, mode: 'restore' | 'import') => void;
  downloadJSON: (data: unknown, filename: string) => void;
  pruneAssets: () => Promise<unknown>;
  clearImportFile: () => void;
  notify: (message: string) => void;
};

function isMalformedBackupJson(error: unknown) {
  if (error instanceof SyntaxError) return true;
  const message = error instanceof Error ? error.message : '';
  return /\bJSON(?:\s*\.?\s*)parse\b|not valid JSON|unexpected end of JSON input/i.test(message);
}

export function createBackupWorkflows(dependencies: BackupWorkflowDependencies) {
  async function pruneAssetsWithWarning() {
    try {
      await dependencies.pruneAssets();
      return '';
    } catch (error) {
      return `，附件清理未完成：${(error as Error)?.message || '请稍后重试'}`;
    }
  }

  async function downloadSnapshot(revision: BackupRevision) {
    try {
      const snapshot = await dependencies.getBackup(revision);
      dependencies.downloadJSON(snapshot, `栖点-正文快照-${revision}.json`);
      dependencies.notify('正文快照已下载；附件请通过完整备份导出');
    } catch (error) {
      dependencies.notify(`快照下载失败：${(error as Error)?.message || '请稍后重试'}`);
    }
  }

  async function restoreSnapshot(revision: BackupRevision) {
    const confirmation = dependencies.localPreview
      ? `将用历史版本 ${revision} 替换当前知识库。此预览环境无法创建服务端回滚快照，请先手动导出需要保留的数据。是否继续？`
      : `将用历史版本 ${revision} 替换当前知识库。操作前会保存当前修改并创建 SQLite 回滚快照；快照与附件位于同一服务端数据库，不能防止宿主数据盘丢失。是否继续？`;
    const confirmed = await dependencies.confirmAction(
      confirmation,
      { title: '恢复历史备份', confirmText: '恢复', danger: true }
    );
    if (!confirmed) return;

    try {
      const snapshot = await dependencies.getBackup(revision) as BackupVault | null;
      if (!snapshot || !Array.isArray(snapshot.notes)) throw Error('历史快照结构无效');
      await dependencies.saveActiveEditor();
      if (!await dependencies.flush()) throw Error(dependencies.getLastError() || '当前修改尚未写入服务端');
      await dependencies.createBackupSnapshot();
      const restored = dependencies.validateVault({
        ...snapshot,
        notes: snapshot.notes.map(note => ({ ...note, body: dependencies.cleanHTML(note.body, true) })),
        trash: snapshot.trash || []
      });
      await dependencies.commitSave(restored);
      dependencies.replaceWorkspace(restored, 'restore');
      const cleanupWarning = await pruneAssetsWithWarning();
      dependencies.notify(cleanupWarning ? `历史版本已恢复${cleanupWarning}` : '历史版本已恢复');
    } catch (error) {
      dependencies.notify(`恢复未完成：${(error as Error)?.message || '请稍后重试'}`);
    }
  }

  async function exportFullBackup() {
    await dependencies.saveActiveEditor();
    const current = dependencies.getData();
    try {
      await dependencies.exportBackup(current);
      dependencies.notify('完整备份下载已开始；请确认浏览器已保存文件');
    } catch (error) {
      dependencies.notify(`完整备份失败：${(error as Error)?.message || '请稍后重试'}`);
    }
  }

  async function importBackup(file: File | null | undefined) {
    if (!file) return;
    let importStarted = false, committed = false;
    let scope: { id: string } | null = null;
    let revision: number | null = null;
    let candidate: BackupVault | null = null;
    const completeImport = async () => {
      if (!candidate) throw Error('导入内容尚未准备完成');
      committed = true;
      dependencies.replaceWorkspace(candidate, 'import');
      const cleanupWarning = await pruneAssetsWithWarning();
      dependencies.notify(`${dependencies.localPreview ? '导入完成，本地预览数据已更新' : '导入完成，知识库已更新'}${cleanupWarning}`);
    };
    try {
      dependencies.beginImport();
      importStarted = true;
      dependencies.setImportProgress({ stage: '正在验证备份文件' });
      let prepared;
      try {
        prepared = await dependencies.prepareBackup(file);
      } catch (error) {
        if (isMalformedBackupJson(error)) {
          throw Error('备份文件格式无效。请选择栖点导出的 JSON 或 ZIP 备份；当前知识库未更改。');
        }
        throw error;
      }
      dependencies.finishImport();
      importStarted = false;

      const confirmed = await dependencies.confirmAction(
        dependencies.localPreview
          ? '导入会替换当前知识库。本地预览无法创建服务端回滚快照，请先手动导出需要保留的数据。是否继续？'
          : '导入会替换当前知识库。继续后会保存当前修改并创建 SQLite 回滚快照；快照与附件位于同一服务端数据库，不能防止宿主数据盘丢失。是否继续？',
        { title: '导入备份', confirmText: '继续导入', danger: true }
      );
      if (!confirmed) return;
      dependencies.beginImport();
      importStarted = true;
      dependencies.setImportProgress({ stage: '正在保存当前编辑' });
      await dependencies.saveActiveEditor();
      if (!await dependencies.flush()) throw Error(dependencies.getLastError() || '当前修改尚未写入服务端');
      dependencies.setImportProgress({ stage: '正在创建服务端快照' });
      await dependencies.createBackupSnapshot();
      revision = await dependencies.prepareImport();
      if (!dependencies.localPreview) scope = await dependencies.createImportScope();
      dependencies.setImportProgress({ stage: '正在导入附件' });
      const restored = await dependencies.uploadPreparedBackup(prepared, scope?.id || undefined,
        progress => dependencies.setImportProgress(progress));
      candidate = dependencies.validateVault({
        ...restored,
        notes: restored.notes.map(note => ({ ...note, body: dependencies.cleanHTML(note.body, true) })),
        trash: restored.trash || []
      });
      dependencies.setImportProgress({ stage: '正在原子替换知识库' });
      await dependencies.commitImport(revision, scope?.id || null, candidate);
      await completeImport();
    } catch (error) {
      let recoveryError = '';
      if (scope && !committed) {
        try {
          dependencies.setImportProgress({ stage: '正在安全清理未提交的附件' });
          const status = await dependencies.abortImportScope(scope.id);
          if (status.status === 'committed' && candidate && revision !== null) {
            dependencies.setImportProgress({ stage: '正在确认已提交的导入' });
            await dependencies.commitImport(revision, scope.id, candidate);
            await completeImport();
            return;
          }
        } catch (cleanupError) {
          recoveryError = `；临时附件清理将在稍后重试：${(cleanupError as Error)?.message || '请稍后重试'}`;
        }
      }
      dependencies.notify(committed
        ? '导入已写入服务端，但页面切换失败；请刷新页面查看'
        : `导入失败：${(error as Error)?.message || '请稍后重试'}${recoveryError}`);
    } finally {
      if (importStarted) dependencies.finishImport();
      dependencies.clearImportFile();
    }
  }

  return { downloadSnapshot, restoreSnapshot, exportFullBackup, importBackup };
}
