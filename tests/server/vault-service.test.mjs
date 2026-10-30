import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultService } from '../../server/application/vault-service.js';
import { HttpError, validateVault } from '../../server/validation.js';
import { diffVaultChanges } from '../../shared/vault-changes.js';

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

  assert.deepEqual(await service.read('database', 'account-1'), { revision: 4, data: validateVault(validVault) });
  assert.deepEqual(await service.readRevision('database', 'account-1'), { revision: 4 });
  assert.deepEqual(calls.map(call => call[0]), ['findVault', 'findVaultRevision']);
});

test('vault application service validates and saves a snapshot at its expected revision', async () => {
  const { service, calls } = setup();

  assert.deepEqual(await service.saveAtRevision('database', 'account-1', { revision: 4, data: validVault }), { revision: 5 });
  assert.deepEqual(calls.find(call => call[0] === 'saveVaultAtRevision'), ['saveVaultAtRevision', 'database', {
    accountId: 'account-1', revision: 4, data: JSON.stringify(validateVault(validVault)), addedAssetIds: [], updated: 123456
  }]);
});

test('vault service detects attachment references added to a changed record, not unchanged legacy links', async () => {
  const assetId = '123e4567-e89b-42d3-a456-426614174000';
  const existingNote = { id:'legacy-note', title:'旧笔记', type:'note', category:'', tags:[],
    body:`<img src="/api/assets/${assetId}">`, source:'', created:1, updated:1, pinned:false };
  const current = { ...validVault, notes:[existingNote] };
  const state = setup({ row:{ revision:4, data:JSON.stringify(current) } });
  const proposed = { ...current, notes:[
    { ...existingNote, title:'编辑旧笔记' },
    { id:'new-note', title:'新笔记', type:'note', category:'', tags:[], body:`<img src="/api/assets/${assetId}">`,
      source:'', created:2, updated:2, pinned:false }
  ] };

  await state.service.saveAtRevision('database','account-1',{ revision:4, data:proposed });
  assert.deepEqual(state.calls.find(call => call[0] === 'saveVaultAtRevision')[2].addedAssetIds,[assetId]);
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

test('legacy full snapshots preserve bookmark metadata only for the same id and normalized URL', async () => {
  const original = { id: 'bookmark-a', kind: 'link', title: 'Before', url: 'https://example.com/path', description: 'Summary', favicon: '/api/assets/123e4567-e89b-42d3-a456-426614174000' };
  const current = { ...validVault, bookmarks: [original] };
  const state = setup({ row: { revision: 4, data: JSON.stringify(current) } });
  await state.service.saveAtRevision('database', 'account-1', { revision: 4, data: {
    ...validVault,
    bookmarks: [
      { id: 'bookmark-a', kind: 'link', title: 'Renamed', url: 'https://EXAMPLE.com/path' },
      { id: 'bookmark-b', kind: 'link', title: 'Changed URL', url: 'https://example.com/other' }
    ]
  } });
  const saved = JSON.parse(state.calls.find(call => call[0] === 'saveVaultAtRevision')[2].data);
  assert.deepEqual(saved.bookmarks, [
    { id: 'bookmark-a', kind: 'link', title: 'Renamed', url: 'https://example.com/path', description: 'Summary', favicon: original.favicon },
    { id: 'bookmark-b', kind: 'link', title: 'Changed URL', url: 'https://example.com/other' }
  ]);

  const changedURL = setup({ row: { revision: 4, data: JSON.stringify(current) } });
  await changedURL.service.saveAtRevision('database', 'account-1', { revision: 4, data: {
    ...validVault, bookmarks: [{ id: 'bookmark-a', kind: 'link', title: 'Moved', url: 'https://example.com/other' }]
  } });
  const changed = JSON.parse(changedURL.calls.find(call => call[0] === 'saveVaultAtRevision')[2].data);
  assert.equal(changed.bookmarks[0].description, undefined);
  assert.equal(changed.bookmarks[0].favicon, undefined);

  const clear = setup({ row: { revision: 4, data: JSON.stringify(current) } });
  await clear.service.saveAtRevision('database', 'account-1', { revision: 4, data: {
    ...validVault, bookmarks: [{ ...original, description: '', favicon: '' }]
  } });
  const explicitlyCleared = JSON.parse(clear.calls.find(call => call[0] === 'saveVaultAtRevision')[2].data);
  assert.equal(explicitlyCleared.bookmarks[0].description, '');
  assert.equal(explicitlyCleared.bookmarks[0].favicon, '');
});

test('legacy delta sync preserves matching bookmark metadata while backup import remains replacement', async () => {
  const original = { id: 'bookmark-a', kind: 'link', title: 'Saved', url: 'https://example.com/', description: 'Summary', favicon: '/api/assets/123e4567-e89b-42d3-a456-426614174000' };
  const current = validateVault({ ...validVault, bookmarks: [original] });
  const next = validateVault({ ...validVault, bookmarks: [{ id: original.id, kind: 'link', title: 'Edited', url: original.url }] });
  const calls = [];
  const repository = {
    findVault: async () => ({ revision: 4, data: JSON.stringify(current) }),
    saveVaultChangesAtRevision: async (db, input) => { calls.push(['changes', input]); return { meta: { changes: 1 } }; },
    findAccountAssetImportResult: async () => ({ status: 'staging', resultRevision: null }),
    saveVaultImportAtRevision: async (db, input) => { calls.push(['import', input]); return { meta: { changes: 1 } }; }
  };
  const service = createVaultService(repository, { now: () => 123456 });
  await service.saveChangesAtRevision('database', 'account-1', { revision: 4, changes: diffVaultChanges(current, next) });
  const delta = calls[0][1].changes.bookmarks.upsert.find(row => row.id === original.id).data;
  assert.equal(delta.description, 'Summary');
  assert.equal(delta.favicon, original.favicon);

  await service.importAtRevision('database', 'account-1', {
    scopeId: '123e4567-e89b-42d3-a456-426614174000', revision: 4,
    data: { ...validVault, bookmarks: [{ id: original.id, kind: 'link', title: 'From backup', url: original.url }] }
  });
  const imported = JSON.parse(calls[1][1].data);
  assert.equal(imported.bookmarks[0].description, undefined);
  assert.equal(imported.bookmarks[0].favicon, undefined);
});
