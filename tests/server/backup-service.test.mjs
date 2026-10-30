import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupService } from '../../server/application/backup-service.js';
import { validateVault } from '../../server/validation.js';

test('backup service returns account snapshots and controls creation time', async () => {
  const calls = [];
  const service = createBackupService({
    listVaultSnapshots: async (db, accountId) => { calls.push(['list', accountId]); return { results: [{ revision: 3 }] }; },
    createCurrentVaultSnapshot: async (db, accountId, created) => { calls.push(['create', accountId, created]); return { revision: 4, created }; },
    findVaultSnapshot: async (db, accountId, revision) => { calls.push(['read', accountId, revision]); return { revision, data: JSON.stringify({ categories:[], notes:[], bookmarks:[], noteTypes:[{ id:'note', name:'普通笔记' }], theme:'light', pasteMode:'rich' }) }; }
  }, { now: () => 567 });

  assert.deepEqual(await service.list({}, 'account-a'), [{ revision: 3 }]);
  assert.deepEqual(await service.create({}, 'account-a'), { revision: 4, created: 567 });
  assert.deepEqual(await service.read({}, 'account-a', 2), { revision: 2, data: validateVault({ categories:[], notes:[], bookmarks:[], noteTypes:[{ id:'note', name:'普通笔记' }], theme:'light', pasteMode:'rich' }) });
  assert.deepEqual(calls, [['list', 'account-a'], ['create', 'account-a', 567], ['read', 'account-a', 2]]);
});

test('backup service reports missing account data and snapshots as not found', async () => {
  const service = createBackupService({
    listVaultSnapshots: async () => ({ results: [] }),
    createCurrentVaultSnapshot: async () => null,
    findVaultSnapshot: async () => null
  });

  await assert.rejects(service.create({}, 'account-a'), error => error.status === 404 && error.message === '知识库不存在');
  await assert.rejects(service.read({}, 'account-a', 8), error => error.status === 404 && error.message === '备份不存在');
});

test('full backup refuses a vault whose attachment disappeared before the asset manifest read', async () => {
  const assetId = '123e4567-e89b-42d3-a456-426614174000';
  const service = createBackupService({
    findVault: async () => ({ revision: 7, data: JSON.stringify({
      categories: [], notes: [{ id: 'note-1', title: '附件', type: 'note', category: '', tags: [],
        body: `<img src="/api/assets/${assetId}">`, source: '', created: 1, updated: 1, pinned: false }],
      bookmarks: [], noteTypes: [{ id: 'note', name: '普通笔记' }], trash: [], theme: 'light', pasteMode: 'rich'
    }) }),
    listAccountAssets: async () => ({ results: [] }),
    getAccountAssetChunk: async () => null
  });

  await assert.rejects(service.exportFull({}, 'account-a'), error =>
    error.status === 422 && /附件/.test(error.message));
});
