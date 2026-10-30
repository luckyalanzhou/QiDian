import { createBackupArchive, parseBackupArchive, type BackupArchiveAsset } from './backup-archive.ts';
import { parseBackupFile } from './backup-archive-stream.ts';

type ExportRequest = { id: number; type: 'export'; data: unknown; assets: BackupArchiveAsset[]; exportedAt: string };
type ImportRequest = { id: number; type: 'import'; filename: string; bytes: ArrayBuffer };
type StreamImportRequest = { id: number; type: 'stream-import'; filename: string; file: Blob & { name?: string } };
type Request = ExportRequest | ImportRequest | StreamImportRequest;
type ResponseMessage = { id: number; result?: unknown; error?: string };
type PostResponse = (message: ResponseMessage, transfer?: Transferable[]) => void;

export async function handleBackupArchiveWorkerRequest(request: Request, postResponse: PostResponse) {
  try {
    if (request.type === 'export') {
      const archive = createBackupArchive(request.data, request.assets, request.exportedAt);
      postResponse({ id: request.id, result: archive }, [archive.buffer]);
      return;
    }
    if (request.type === 'stream-import') {
      const parsed = await parseBackupFile(request.file, value => value, request.filename);
      postResponse({ id: request.id, result: {
        data: parsed.data,
        assets: parsed.assets,
        entries: parsed.entries
      } });
      return;
    }
    const result = parseBackupArchive(request.filename, new Uint8Array(request.bytes), value => value);
    const transfer = Object.values(result.assetBytes).map(bytes => bytes.buffer);
    postResponse({ id: request.id, result }, transfer);
  } catch (error) {
    postResponse({ id: request.id, error: error instanceof Error ? error.message : '备份处理失败' });
  }
}

if (typeof self !== 'undefined') {
  const workerScope = self as unknown as {
    addEventListener(type: 'message', listener: (event: MessageEvent<Request>) => void): void;
    postMessage(message: ResponseMessage, transfer?: Transferable[]): void;
  };
  workerScope.addEventListener('message', event => {
    void handleBackupArchiveWorkerRequest(event.data, (message, transfer) => workerScope.postMessage(message, transfer));
  });
}

export type { Request as BackupArchiveWorkerRequest };
