import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { createSyncConflictExportService } from '../../../src/features/sync/conflict-export-service.ts';

const assetId = '33333333-3333-4333-8333-333333333333';
const timestamp = new Date('2026-10-19T10:20:30.000Z');

test('sync conflict export archives both vault snapshots and the referenced attachment bytes', async () => {
  let output;
  const calls = [];
  const service = createSyncConflictExportService({
    getConflict: () => ({ local: { notes: [{ id: 'local' }] }, remote: { notes: [{ id: 'remote' }] } }),
    dev: false,
    listAssets: async () => [{ id: assetId }],
    getAssetResponse: async id => { calls.push(id); return new Response(new Uint8Array([0, 1, 255])); },
    download: (blob, name) => { output = { blob, name }; },
    now: () => timestamp
  });

  assert.equal(await service.exportSyncConflict(), true);
  assert.deepEqual(calls, [assetId]);
  assert.match(output.name, /^栖点-同步冲突对照-2026-10-19\.zip$/);
  assert.equal(output.blob.type, 'application/zip');

  const files = unzipSync(new Uint8Array(await output.blob.arrayBuffer()));
  const local = JSON.parse(strFromU8(files['本机版本/vault.json']));
  const remote = JSON.parse(strFromU8(files['Docker服务端版本/vault.json']));
  const assets = JSON.parse(strFromU8(files['assets.json']));
  assert.deepEqual(local.notes, [{ id: 'local' }]);
  assert.deepEqual(remote.notes, [{ id: 'remote' }]);
  assert.equal(local.exportedAt, timestamp.toISOString());
  assert.equal(remote.exportedAt, timestamp.toISOString());
  assert.deepEqual(assets, [{ id: assetId }]);
  assert.deepEqual([...files[`assets/${assetId}`]], [0, 1, 255]);
});

test('local preview conflict export omits remote asset requests and missing conflicts are rejected', async () => {
  let listed = 0;
  let downloaded = 0;
  const service = createSyncConflictExportService({
    getConflict: () => ({ local: { notes: [] }, remote: { notes: [] } }),
    dev: true,
    listAssets: async () => { listed += 1; return [{ id: assetId }]; },
    getAssetResponse: async () => { throw new Error('must not load remote assets'); },
    download: () => { downloaded += 1; },
    now: () => timestamp
  });

  await service.exportSyncConflict();
  assert.equal(listed, 0);
  assert.equal(downloaded, 1);

  const missing = createSyncConflictExportService({
    getConflict: () => null,
    dev: true,
    listAssets: async () => [],
    getAssetResponse: async () => new Response(),
    download: () => { downloaded += 1; }
  });
  await assert.rejects(missing.exportSyncConflict(), /当前没有待处理的 Docker 服务端冲突/);
  assert.equal(downloaded, 1);
});
