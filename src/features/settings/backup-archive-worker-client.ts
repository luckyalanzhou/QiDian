import type { BackupArchiveAsset, ParsedBackupArchive } from './backup-archive.ts';
import type { BackupZipEntry, ParsedBackupFile } from './backup-archive-stream.ts';
import type { BackupArchiveWorkerRequest } from './backup-archive.worker.ts';

const MIN_JSON_WORKER_BYTES = 16 * 1024 * 1024;

let nextId = 0;

class WorkerTransportError extends Error {}

function runWorker<T>(request: BackupArchiveWorkerRequest, transfer: Transferable[]): Promise<T> | null {
  if (typeof Worker === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./backup-archive.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    worker.onmessage = event => {
      const message = event.data as { id: number; result?: T; error?: string };
      if (message.id !== id) return;
      if (message.error) reject(Error(message.error));
      else resolve(message.result as T);
    };
    worker.onerror = event => reject(new WorkerTransportError(event.message || '备份处理 Worker 无法启动'));
    worker.onmessageerror = () => reject(new WorkerTransportError('备份处理 Worker 返回的数据无法读取'));
    try {
      worker.postMessage({ ...request, id }, transfer);
    } catch (error) {
      reject(new WorkerTransportError(error instanceof Error ? error.message : '备份文件无法传给 Worker'));
    }
  }).finally(() => worker.terminate());
}

export function createBackupArchiveInWorker(data: unknown, assets: BackupArchiveAsset[], exportedAt: string) {
  const transfer = assets.map(asset => asset.bytes.buffer);
  return runWorker<Uint8Array>({ id: 0, type: 'export', data, assets, exportedAt }, transfer);
}

export function parseBackupArchiveInWorker(filename: string, bytes: ArrayBuffer) {
  return runWorker<ParsedBackupArchive<unknown>>({ id: 0, type: 'import', filename, bytes }, [bytes]);
}

type StreamParsedBackup = Pick<ParsedBackupFile<unknown>, 'data' | 'assets'> & { entries: Map<string, BackupZipEntry> };

export async function parseBackupFileInWorker(file: Blob & { name?: string }): Promise<ParsedBackupFile<unknown> | null> {
  const filename = String(file.name || '').toLowerCase();
  if (!filename.endsWith('.zip') && file.size < MIN_JSON_WORKER_BYTES) return null;
  try {
    const parsed = await runWorker<StreamParsedBackup>({
      id: 0,
      type: 'stream-import',
      filename: String(file.name || ''),
      file
    }, []);
    return parsed ? { ...parsed, file } : null;
  } catch (error) {
    if (error instanceof WorkerTransportError) return null;
    throw error;
  }
}
