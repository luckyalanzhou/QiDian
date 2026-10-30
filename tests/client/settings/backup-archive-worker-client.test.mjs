import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupArchive } from '../../../src/features/settings/backup-archive.ts';
import { parseBackupFileInWorker } from '../../../src/features/settings/backup-archive-worker-client.ts';
import { handleBackupArchiveWorkerRequest } from '../../../src/features/settings/backup-archive.worker.ts';

const MIN_JSON_WORKER_BYTES = 16 * 1024 * 1024;

function withWorker(value, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value });
  return Promise.resolve().then(callback).finally(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    else delete globalThis.Worker;
  });
}

test('backup parsing worker receives the original file and restores its file reference', async () => {
  const archive = createBackupArchive({ notes: [{ id: 'n1', body: '<p>Worker import</p>' }] }, []);
  const file = new File([archive], 'backup.zip');
  class FakeWorker {
    constructor(url, options) {
      assert.equal(options.type, 'module');
      assert.match(String(url), /backup-archive\.worker/);
    }
    postMessage(request, transfer) {
      assert.equal(request.type, 'stream-import');
      assert.equal(request.filename, file.name);
      assert.equal(request.file, file);
      assert.deepEqual(transfer, []);
      void handleBackupArchiveWorkerRequest(request, message => {
        queueMicrotask(() => this.onmessage({ data: message }));
      });
    }
    terminate() {}
  }

  const parsed = await withWorker(FakeWorker, () => parseBackupFileInWorker(file));
  assert.deepEqual(parsed.data.notes, [{ id: 'n1', body: '<p>Worker import</p>' }]);
  assert.deepEqual(parsed.assets, []);
  assert.deepEqual([...parsed.entries.keys()].sort(), ['assets.json', 'vault.json']);
  assert.equal(parsed.file, file);
});

test('backup parsing reports worker unavailability so the caller can use the main-thread fallback', async () => {
  const result = await withWorker(undefined, () => parseBackupFileInWorker(new File(['{}'], 'backup.zip')));
  assert.equal(result, null);
});

test('backup parsing falls back when the worker script fails to load', async () => {
  class FailedWorker {
    postMessage() { queueMicrotask(() => this.onerror({ message: 'worker script failed to load' })); }
    terminate() {}
  }

  const result = await withWorker(FailedWorker, () => parseBackupFileInWorker(new File(['{}'], 'backup.zip')));
  assert.equal(result, null);
});

test('small JSON backups use the existing main-thread parser without starting a worker', async () => {
  let started = 0;
  class UnexpectedWorker { constructor() { started += 1; } }
  const result = await withWorker(UnexpectedWorker, () => parseBackupFileInWorker(new File(['{}'], 'backup.json')));
  assert.equal(result, null);
  assert.equal(started, 0);
});

test('large JSON backups are delegated to the worker', async () => {
  const file = new File([new Uint8Array(MIN_JSON_WORKER_BYTES)], 'backup.json');
  let started = 0;
  class CapturingWorker {
    constructor() { started += 1; }
    postMessage(request) {
      assert.equal(request.type, 'stream-import');
      assert.equal(request.file, file);
      queueMicrotask(() => this.onmessage({ data: {
        id: request.id, result: { data: { notes: [], categories: [] }, assets: [], entries: new Map() }
      } }));
    }
    terminate() {}
  }

  const parsed = await withWorker(CapturingWorker, () => parseBackupFileInWorker(file));
  assert.equal(started, 1);
  assert.equal(parsed.file, file);
});
