import { createBackupArchive, type BackupAssetMetadata } from './backup-archive.ts';
import { createBackupArchiveInWorker, parseBackupFileInWorker } from './backup-archive-worker-client.ts';
import { backupAssetEntry, parseBackupFile, streamBackupZipEntry, type ParsedBackupFile } from './backup-archive-stream.ts';

type BackupVault = { notes: Array<{ body: string; [key: string]: unknown }>; [key: string]: unknown };
type BackupFile = Blob & { name: string };
type BackupServiceAsset = BackupAssetMetadata;
type ImportProgress = { stage: string; current?: number; total?: number };
type PreparedBackup<TVault> = {
  parsed: ParsedBackupFile<TVault>;
  unchangedAssetIds: Set<string>;
  data: TVault;
  assetsToUpload: number;
};
const ASSET_CHUNK_BYTES = 256 * 1024;
const ASSET_CHUNK_BATCH = 16;

function rewriteBodyAssetReference(value: unknown, source: string, replacement: string): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) rewriteBodyAssetReference(item, source, replacement);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'body' && typeof child === 'string') {
      (value as Record<string, unknown>)[key] = child.replaceAll(source, replacement);
    } else rewriteBodyAssetReference(child, source, replacement);
  }
}

function validateParsedVault<T>(file: BackupFile, value: unknown, validateVault: (value: unknown) => T): T {
  if (!file.name.toLowerCase().endsWith('.zip')) return validateVault(value);
  try {
    return validateVault(value);
  } catch (error) {
    if (error instanceof Error && error.message.includes('备份')) throw error;
    throw Error(`备份正文或附件清单无效：${(error as Error)?.message || '解析失败'}`);
  }
}

export type BackupDataServiceDependencies<TVault extends BackupVault> = {
  dev: boolean;
  getRevision: () => number;
  flush: () => Promise<boolean>;
  getLastError: () => string;
  listAssets: () => Promise<BackupServiceAsset[]>;
  getAssetResponse: (id: string) => Promise<Response>;
  beginImportAssetUpload: (scopeId: string, name: string, size: number) => Promise<{ id: string }>;
  uploadImportAssetChunkBatch: (scopeId: string, id: string, startOrdinal: number, chunks: Uint8Array[]) => Promise<unknown>;
  completeImportAssetUpload: (scopeId: string, id: string) => Promise<{ url: string }>;
  downloadFullBackup: () => void;
  validateVault: (value: unknown) => TVault;
  parseBackupInWorker?: (file: BackupFile) => Promise<ParsedBackupFile<unknown> | null>;
  download: (blob: Blob, name: string) => void;
  listSnapshots: () => Promise<unknown>;
  createSnapshot: () => Promise<unknown>;
  getSnapshot: (id: string | number) => Promise<{ data: unknown }>;
  now?: () => number;
  date?: () => string;
};

export function createBackupDataService<TVault extends BackupVault>(dependencies: BackupDataServiceDependencies<TVault>) {
  async function exportBackup(data: TVault) {
    if (!await dependencies.flush()) throw Error(dependencies.getLastError() || '当前修改尚未写入 Docker 服务端，暂不能生成一致备份');
    if (!dependencies.dev) {
      dependencies.downloadFullBackup();
      return;
    }
    const archive = await createBackupArchiveInWorker(data, [], new Date().toISOString())
      || createBackupArchive(data, [], new Date().toISOString());
    const date = dependencies.date?.() || new Date().toLocaleDateString('sv-SE');
    const blobBuffer = archive.buffer instanceof ArrayBuffer && archive.byteOffset === 0 && archive.byteLength === archive.buffer.byteLength
      ? archive.buffer
      : new Uint8Array(archive).buffer as ArrayBuffer;
    dependencies.download(new Blob([blobBuffer], { type: 'application/zip' }), `栖点-完整备份-${date}.zip`);
  }

  async function backupEntryMatches(file: Blob, entry: NonNullable<ReturnType<typeof backupAssetEntry>>, response: Response) {
    if (!response.ok || !response.body) throw Error('无法读取现有附件以校验备份');
    const reader = response.body.getReader();
    let remote = new Uint8Array(), remoteOffset = 0, same = true;
    try {
      await streamBackupZipEntry(file, entry, async chunk => {
        let offset = 0;
        while (same && offset < chunk.byteLength) {
          if (remoteOffset >= remote.byteLength) {
            const next = await reader.read();
            if (next.done) { same = false; break; }
            remote = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
            remoteOffset = 0;
            if (!remote.byteLength) continue;
          }
          const count = Math.min(chunk.byteLength - offset, remote.byteLength - remoteOffset);
          for (let index = 0; index < count; index += 1) {
            if (chunk[offset + index] !== remote[remoteOffset + index]) { same = false; break; }
          }
          offset += count;
          remoteOffset += count;
        }
      });
      if (same) {
        if (remoteOffset < remote.byteLength) same = false;
        else {
          for (;;) {
            const extra = await reader.read();
            if (extra.done) break;
            if (extra.value?.byteLength) { same = false; break; }
          }
        }
      }
      return same;
    } finally {
      if (!same) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async function prepareBackup(file: BackupFile): Promise<PreparedBackup<TVault>> {
    const parsedInWorker = await (dependencies.parseBackupInWorker || parseBackupFileInWorker)(file);
    const parsed = parsedInWorker
      ? { ...parsedInWorker, data: validateParsedVault(file, parsedInWorker.data, dependencies.validateVault) }
      : await parseBackupFile(file, dependencies.validateVault);
    if (parsed.assets.length && dependencies.dev) throw Error('含附件的备份须在 SQLite 完整预览模式导入');
    const existing = dependencies.dev || !parsed.assets.length ? [] : await dependencies.listAssets();
    const existingById = new Map(existing.map(asset => [asset.id, asset]));
    const unchangedAssetIds = new Set<string>();
    for (const [index, asset] of parsed.assets.entries()) {
      const entry = backupAssetEntry(parsed, asset.id);
      const found = existingById.get(asset.id);
      let same = false;
      if (found && found.size === asset.size) {
        const response = await dependencies.getAssetResponse(asset.id);
        same = await backupEntryMatches(file, entry, response);
      } else {
        await streamBackupZipEntry(file, entry, () => {});
      }
      if (same) unchangedAssetIds.add(asset.id);
    }
    return { parsed, unchangedAssetIds, data: parsed.data, assetsToUpload: parsed.assets.length - unchangedAssetIds.size };
  }

  async function uploadPreparedBackup(prepared: PreparedBackup<TVault>, importScopeId?: string,
    onProgress?: (progress: ImportProgress) => void): Promise<TVault> {
    const { parsed, unchangedAssetIds } = prepared;
    const data = parsed.data;
    const pendingAssets = parsed.assets.filter(asset => !unchangedAssetIds.has(asset.id));
    if (pendingAssets.length && (!importScopeId || dependencies.dev)) throw Error('备份附件缺少隔离的导入作用域，请重新开始导入');
    for (const [index, asset] of pendingAssets.entries()) {
      onProgress?.({ stage: `正在准备附件 ${index + 1}/${pendingAssets.length}`, current: index + 1, total: pendingAssets.length });
      const upload = await dependencies.beginImportAssetUpload(importScopeId!, asset.name, asset.size);
      let batch: Uint8Array[] = [], ordinal = 0, buffered = 0, outputChunk = new Uint8Array(ASSET_CHUNK_BYTES);
      let uploaded = 0;
      const sendBatch = async () => {
        if (!batch.length) return;
        await dependencies.uploadImportAssetChunkBatch(importScopeId!, upload.id, ordinal - batch.length, batch);
        uploaded += batch.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        onProgress?.({ stage: `正在上传附件 ${index + 1}/${pendingAssets.length}`, current: uploaded, total: asset.size });
        batch = [];
      };
      const entry = backupAssetEntry(parsed, asset.id);
      await streamBackupZipEntry(parsed.file, entry, async source => {
        let sourceOffset = 0;
        while (sourceOffset < source.byteLength) {
          const expected = Math.min(ASSET_CHUNK_BYTES, asset.size - ordinal * ASSET_CHUNK_BYTES);
          if (expected <= 0) throw Error('备份附件超出清单大小');
          const count = Math.min(expected - buffered, source.byteLength - sourceOffset);
          outputChunk.set(source.subarray(sourceOffset, sourceOffset + count), buffered);
          buffered += count;
          sourceOffset += count;
          if (buffered === expected) {
            batch.push(outputChunk.slice(0, buffered));
            ordinal += 1;
            buffered = 0;
            outputChunk = new Uint8Array(ASSET_CHUNK_BYTES);
            if (batch.length === ASSET_CHUNK_BATCH) await sendBatch();
          }
        }
      });
      if (buffered) throw Error('备份附件长度与清单不符');
      await sendBatch();
      const created = await dependencies.completeImportAssetUpload(importScopeId!, upload.id);
      rewriteBodyAssetReference(data, `/api/assets/${asset.id}`, created.url);
    }
    return data;
  }

  async function readBackup(file: BackupFile, options: { importScopeId?: string; onProgress?: (progress: ImportProgress) => void } = {}): Promise<TVault> {
    const prepared = await prepareBackup(file);
    return uploadPreparedBackup(prepared, options.importScopeId, options.onProgress);
  }

  async function createBackupSnapshot() {
    if (dependencies.dev) return { revision: dependencies.getRevision(), created: dependencies.now?.() ?? Date.now() };
    if (!await dependencies.flush()) throw Error(dependencies.getLastError() || '当前修改尚未写入 Docker 服务端，暂不能创建回滚快照');
    return dependencies.createSnapshot();
  }

  async function getBackup(id: string | number) {
    return (await dependencies.getSnapshot(id)).data;
  }

  return {
    exportBackup,
    prepareBackup,
    uploadPreparedBackup,
    readBackup,
    listBackups: () => dependencies.dev ? Promise.resolve([]) : dependencies.listSnapshots(),
    createBackupSnapshot,
    getBackup
  };
}
