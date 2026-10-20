import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultService } from '../../server/application/vault-service.js';
import { HttpError, validateVault } from '../../server/validation.js';

const validVault = {
  categories: [],
  noteTypes: [{ id: 'note', name: '普通笔记' }],
  notes: [],
  bookmarks: [],
  theme: 'light',
  pasteMode: 'rich'
};

function setup({ row = { revision: 4, data: JSON.stringify(validVault) }, changes = 1 } = {}) {
  const calls = [];
  const repository = {
    findVault: async (db, accountId) => { calls.push(['findVault', db, accountId]); return row; },
    findVaultRevision: async (db, accountId) => { calls.push(['findVaultRevision', db, accountId]); return row && { revision: row.revision }; },
    saveVaultAtRevision: async (db, input) => { calls.push(['saveVaultAtRevision', db, input]); return { meta: { changes } }; }
  };
  const service = createVaultService(repository, { now: () => 123456 });
  return { service, calls };
}

test('vault application service reads the persisted snapshot and revision through its repository', async () => {
  const { service, calls } = setup();

  assert.deepEqual(await service.read('database', 'account-1'), { revision: 4, data: validVault });
  assert.deepEqual(await service.readRevision('database', 'account-1'), { revision: 4 });
  assert.deepEqual(calls.map(call => call[0]), ['findVault', 'findVaultRevision']);
});

test('vault application service validates and saves a snapshot at its expected revision', async () => {
  const { service, calls } = setup();

  assert.deepEqual(await service.saveAtRevision('database', 'account-1', { revision: 4, data: validVault }), { revision: 5 });
  assert.deepEqual(calls[0], ['saveVaultAtRevision', 'database', {
    accountId: 'account-1', revision: 4, data: JSON.stringify(validateVault(validVault)), updated: 123456
  }]);
});

test('vault application service rejects stale revisions and invalid snapshots', async () => {
  const stale = setup({ changes: 0 });
  await assert.rejects(stale.service.saveAtRevision('database', 'account-1', { revision: 4, data: validVault }),
    error => error instanceof HttpError && error.status === 409);

  const invalid = setup();
  await assert.rejects(invalid.service.saveAtRevision('database', 'account-1', { revision: -1, data: validVault }),
    error => error instanceof HttpError && error.status === 400);
  await assert.rejects(invalid.service.saveAtRevision('database', 'account-1', { revision: 4, data: { notes: 'invalid' } }),
    error => error instanceof HttpError && error.status === 400);
  assert.equal(invalid.calls.length, 0, 'invalid input does not reach persistence');
});

test('vault application service reports missing account data consistently', async () => {
  const { service } = setup({ row: null });

  await assert.rejects(service.read('database', 'account-1'), error => error instanceof HttpError && error.status === 404);
  await assert.rejects(service.readRevision('database', 'account-1'), error => error instanceof HttpError && error.status === 404);
});
