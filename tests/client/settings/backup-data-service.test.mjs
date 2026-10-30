import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupArchive, parseBackupArchive } from '../../../src/features/settings/backup-archive.ts';
import { createBackupDataService } from '../../../src/features/settings/backup-data-service.ts';

const id = '123e4567-e89b-12d3-a456-426614174000';
const content = new Uint8Array([9, 8, 7]);
const vault = { notes: [{ id: 'n1', body: `<p><img src="/api/assets/${id}"></p>` }], trash: [] };

function harness(options = {}) {
  const events = [];
  const service = createBackupDataService({
    dev: options.dev ?? false,
    getRevision: () => 8,
    flush: async () => { events.push('flush'); return options.flush ?? true; },
    getLastError: () => '同步失败',
    listAssets: async () => { events.push('list-assets'); return options.assets || []; },
    getAssetResponse: async assetId => { events.push(`read-asset:${assetId}`); return new Response(options.storedBytes || content); },
    beginImportAssetUpload: async (scopeId, name, size) => { events.push(`begin-upload:${scopeId}:${name}:${size}`); return { id: 'reuploaded-id' }; },
    uploadImportAssetChunkBatch: async (scopeId, uploadId, ordinal, chunks) => { events.push(`upload-chunks:${scopeId}:${uploadId}:${ordinal}:${chunks.length}`); },
    completeImportAssetUpload: async (scopeId, uploadId) => { events.push(`complete-upload:${scopeId}:${uploadId}`); return { url: '/api/assets/reuploaded' }; },
    downloadFullBackup: () => events.push('server-download'),
    validateVault: options.validateVault || (value => value),
    parseBackupInWorker: options.parseBackupInWorker,
    download: (blob, name) => events.push(['download', blob, name]),
    listSnapshots: async () => { events.push('list-snapshots'); return [{ revision: 8 }]; },
    createSnapshot: async () => { events.push('create-snapshot'); return { revision: 9 }; },
    getSnapshot: async revision => { events.push(`get-snapshot:${revision}`); return { data: vault }; },
    now: () => 123,
    date: () => '2026-10-19'
  });
  return { service, events };
}

function zipFile(data = vault, bytes = content) {
  const archive = createBackupArchive(data, [{ id, name: 'image.bin', size: bytes.length, bytes }]);
  return new File([archive], 'backup.zip');
}

test('manual export flushes pending cloud writes and starts the authenticated server stream', async () => {
  const h = harness({ assets: [{ id, name: 'image.bin', size: content.length }] });
  await h.service.exportBackup(vault);
  assert.deepEqual(h.events, ['flush', 'server-download']);
});

test('export refuses a backup while the cloud save queue has an error', async () => {
  const h = harness({ flush: false });
  await assert.rejects(h.service.exportBackup(vault), /同步失败/);
  assert.deepEqual(h.events, ['flush']);
});

test('import does not reject a backup based on the former 130 MiB file-size cap', async () => {
  const h = harness();
  const bytes = new TextEncoder().encode(JSON.stringify(vault));
  const restored = await h.service.readBackup({
    name: 'vault.json',
    text: async () => new TextDecoder().decode(bytes)
  });
  assert.deepEqual(restored, vault);
});

test('import validates and reuses an identical stored attachment without staging a duplicate', async () => {
  const h = harness({ assets: [{ id, name: 'image.bin', size: content.length }] });
  const prepared = await h.service.prepareBackup(zipFile());
  const restored = await h.service.uploadPreparedBackup(prepared);

  assert.match(restored.exportedAt, /^2026-/);
  assert.deepEqual(restored, { ...vault, version: 2, exportedAt: restored.exportedAt });
  assert.deepEqual(h.events, ['list-assets', `read-asset:${id}`]);
});

test('import uses the worker parser when available and validates its result before preparing the restore', async () => {
  const file = zipFile();
  const rawVault = { notes: [], importedBy: 'worker' };
  const h = harness({
    parseBackupInWorker: async received => {
      assert.equal(received, file);
      return { data: rawVault, assets: [], entries: new Map(), file: received };
    },
    validateVault: value => ({ ...value, validated: true })
  });

  const prepared = await h.service.prepareBackup(file);
  assert.equal(prepared.data.importedBy, 'worker');
  assert.equal(prepared.data.validated, true);
  assert.equal(prepared.assetsToUpload, 0);
});

test('worker-parsed ZIPs keep the existing validation error message', async () => {
  const h = harness({
    parseBackupInWorker: async file => ({ data: { invalid: true }, assets: [], entries: new Map(), file }),
    validateVault: () => { throw Error('字段无效'); }
  });

  await assert.rejects(h.service.prepareBackup(zipFile()), /备份正文或附件清单无效：字段无效/);
});

test('import uploads changed attachment bytes and rewrites references in the restored notes', async () => {
  const h = harness({ assets: [{ id, name: 'image.bin', size: content.length }], storedBytes: new Uint8Array([0, 0, 0]) });
  const data = {
    ...vault,
    notes: [{ ...vault.notes[0], publishedSnapshot: { body: `<img src="/api/assets/${id}">` } }],
    trash: [{ kind: 'note', item: { body: `<img src="/api/assets/${id}">`, publishedSnapshot: { body: `<img src="/api/assets/${id}">` } } }]
  };
  const scopeId = '123e4567-e89b-42d3-a456-426614174000';
  const prepared = await h.service.prepareBackup(zipFile(data));
  const restored = await h.service.uploadPreparedBackup(prepared, scopeId);

  assert.match(restored.notes[0].body, /\/api\/assets\/reuploaded/);
  assert.match(restored.notes[0].publishedSnapshot.body, /\/api\/assets\/reuploaded/);
  assert.match(restored.trash[0].item.body, /\/api\/assets\/reuploaded/);
  assert.match(restored.trash[0].item.publishedSnapshot.body, /\/api\/assets\/reuploaded/);
  assert.deepEqual(h.events, ['list-assets', `read-asset:${id}`, `begin-upload:${scopeId}:image.bin:3`, `upload-chunks:${scopeId}:reuploaded-id:0:1`, `complete-upload:${scopeId}:reuploaded-id`]);
});

test('changed backup attachments cannot be uploaded outside an isolated import scope', async () => {
  const h = harness({ assets: [{ id, name:'image.bin', size:content.length }], storedBytes:new Uint8Array([1,1,1]) });
  const prepared = await h.service.prepareBackup(zipFile());
  await assert.rejects(h.service.uploadPreparedBackup(prepared), /隔离的导入作用域/);
  assert.equal(h.events.some(event => String(event).startsWith('begin-upload:')), false);
});

test('local preview supports JSON imports and local history stubs but rejects ZIP attachments', async () => {
  const h = harness({ dev: true });
  const localHistory = await h.service.createBackupSnapshot();
  assert.deepEqual(localHistory, { revision: 8, created: 123 });
  assert.deepEqual(await h.service.listBackups(), []);
  assert.deepEqual(await h.service.getBackup(3), vault);
  await assert.rejects(h.service.readBackup(zipFile()), /SQLite 完整预览模式/);
  assert.deepEqual(await h.service.readBackup({ name: 'vault.json', text: async () => JSON.stringify(vault) }), vault);
  assert.equal(h.events.includes('list-snapshots'), false);
  assert.equal(h.events.includes('create-snapshot'), false);
});
