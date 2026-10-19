import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupService } from '../server/application/backup-service.js';

test('backup service returns account snapshots and controls creation time', async () => {
  const calls = [];
  const service = createBackupService({
    listVaultSnapshots: async (db, accountId) => { calls.push(['list', accountId]); return { results: [{ revision: 3 }] }; },
    createCurrentVaultSnapshot: async (db, accountId, created) => { calls.push(['create', accountId, created]); return { revision: 4, created }; },
    findVaultSnapshot: async (db, accountId, revision) => { calls.push(['read', accountId, revision]); return { revision, data: '{"notes":[]}' }; }
  }, { now: () => 567 });

  assert.deepEqual(await service.list({}, 'account-a'), [{ revision: 3 }]);
  assert.deepEqual(await service.create({}, 'account-a'), { revision: 4, created: 567 });
  assert.deepEqual(await service.read({}, 'account-a', 2), { revision: 2, data: { notes: [] } });
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
