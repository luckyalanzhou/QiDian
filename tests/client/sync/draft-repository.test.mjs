import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDraftRepository } from '../../../src/features/sync/draft-repository.ts';

function createFakeIndexedDB({ failTransactions = false } = {}) {
  const records = new Map();
  const createdStores = [];
  const database = {
    objectStoreNames: { contains: name => createdStores.includes(name) },
    createObjectStore(name) { createdStores.push(name); },
    transaction(_storeName, mode) {
      const transaction = { error: null };
      transaction.objectStore = () => ({
        get(key) {
          const request = { result: undefined };
          queueMicrotask(() => {
            if (failTransactions) {
              transaction.error = new Error('read failed');
              transaction.onerror?.();
            } else {
              request.result = structuredClone(records.get(key));
              transaction.oncomplete?.();
            }
          });
          return request;
        },
        put(value, key) {
          const request = { result: key };
          queueMicrotask(() => {
            if (failTransactions) {
              transaction.error = new Error('write failed');
              transaction.onerror?.();
            } else {
              records.set(key, structuredClone(value));
              transaction.oncomplete?.();
            }
          });
          return request;
        },
        delete(key) {
          const request = { result: undefined };
          queueMicrotask(() => {
            if (failTransactions) {
              transaction.error = new Error('delete failed');
              transaction.onerror?.();
            } else {
              records.delete(key);
              transaction.oncomplete?.();
            }
          });
          return request;
        }
      });
      transaction.mode = mode;
      return transaction;
    }
  };
  return {
    records,
    createdStores,
    open(name, version) {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.databaseName = name;
        request.version = version;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('draft repository creates its store and isolates active and ignored snapshots by owner', async () => {
  const indexedDB = createFakeIndexedDB();
  const repository = createDraftRepository({ indexedDB, databaseName: 'test-drafts' });
  const active = { owner: 'account-a', pending: true, data: { notes: [{ title: 'active' }] } };
  const ignored = { owner: 'account-a', pending: true, data: { notes: [{ title: 'ignored' }] } };

  assert.equal(await repository.read('account-a'), undefined);
  await repository.write(active, 'account-a');
  await repository.write(ignored, 'account-a', 'ignored');
  assert.deepEqual(await repository.read('account-a'), active);
  assert.deepEqual(await repository.read('account-a', 'ignored'), ignored);
  assert.deepEqual([...indexedDB.records.keys()].sort(), ['ignored:account-a', 'vault:account-a']);
  assert.deepEqual(indexedDB.createdStores, ['drafts']);

  await repository.remove('account-a');
  assert.equal(await repository.read('account-a'), undefined);
  assert.deepEqual(await repository.read('account-a', 'ignored'), ignored);
});

test('local and legacy snapshots retain their shared recovery key', async () => {
  const indexedDB = createFakeIndexedDB();
  const repository = createDraftRepository({ indexedDB, databaseName: 'test-drafts' });
  await repository.write({ pending: true }, 'legacy');
  assert.deepEqual(await repository.read('local'), { pending: true });
  assert.deepEqual([...indexedDB.records.keys()], ['vault']);
});

test('draft repository reports transaction failures and unavailable browser storage', async () => {
  const failed = createDraftRepository({ indexedDB: createFakeIndexedDB({ failTransactions: true }), databaseName: 'test-drafts' });
  await assert.rejects(failed.read('account-a'), /read failed/);

  const unavailable = createDraftRepository({ indexedDB: null, databaseName: 'test-drafts' });
  await assert.rejects(unavailable.read('account-a'), /不支持本地草稿恢复/);
});
