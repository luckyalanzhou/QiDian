import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVault, DEFAULT_NOTE_TYPES } from '../shared/vault-validation.js';
import { createTrashEntry, TRASH_RETENTION_MS } from '../src/trash-data.js';
import { createVaultMutation } from '../src/features/vault/mutation.ts';
import { createTrashWorkflows } from '../src/features/trash/workflows.ts';

const note = (id, title = id) => ({
  id, title, type: 'note', category: '开发', tags: [], body: '<p>正文</p>', source: '',
  created: 1, updated: 2, pinned: false, status: 'published'
});

function fixture(trash, options = {}) {
  let vault = validateVault({ categories: ['开发'], noteTypes: DEFAULT_NOTE_TYPES, notes: [], bookmarks: [], trash });
  const saved = [];
  const notices = [];
  const mutateVault = createVaultMutation({
    getVault: () => vault,
    replaceVault: value => { vault = value; return value; },
    save: async () => {
      if (options.save) return options.save(vault, saved);
      if (options.saveError) throw new Error(options.saveError);
      saved.push(structuredClone(vault));
    }
  });
  const workflows = createTrashWorkflows({
    getVault: () => vault,
    mutateVault,
    confirmClear: options.confirmClear || (async () => true),
    notify: message => notices.push(message),
    now: options.now
  });
  return { workflows, getVault: () => vault, setVault: value => { vault = value; }, saved, notices };
}

test('trash restore validates the candidate and reports success only after save commits', async () => {
  const entry = createTrashEntry('note', note('restore-me'), { index: 0 });
  const state = fixture([entry]);
  assert.equal(await state.workflows.restore(entry.id), true);
  assert.equal(state.saved.length, 1);
  assert.equal(state.getVault().notes[0].id, 'restore-me');
  assert.deepEqual(state.getVault().trash, []);
});

test('trash restore rolls back when the server transaction fails', async () => {
  const entry = createTrashEntry('note', note('keep-in-trash'), { index: 0 });
  const state = fixture([entry], { saveError: 'SQLite 写入失败' });
  assert.equal(await state.workflows.restore(entry.id), false);
  assert.equal(state.getVault().notes.length, 0);
  assert.equal(state.getVault().trash[0].id, entry.id);
  assert.deepEqual(state.notices, ['SQLite 写入失败']);
});

test('trash rollback does not overwrite a newer workspace revision', async () => {
  const entry = createTrashEntry('note', note('concurrent-restore'), { index: 0 });
  let rejectSave;
  const state = fixture([entry], { save: () => new Promise((_resolve, reject) => { rejectSave = () => reject(new Error('SQLite 写入失败')); }) });
  const pending = state.workflows.restore(entry.id);
  await new Promise(resolve => setImmediate(resolve));
  const newer = structuredClone(state.getVault());
  newer.theme = 'dark';
  state.setVault(validateVault(newer));
  rejectSave();
  assert.equal(await pending, false);
  assert.equal(state.getVault().theme, 'dark');
  assert.equal(state.getVault().notes[0].id, 'concurrent-restore');
  assert.equal(state.getVault().trash.length, 0);
});

test('trash clear is cancellable and only commits after the custom confirmation accepts', async () => {
  const first = createTrashEntry('note', note('first'), { index: 0 });
  const second = createTrashEntry('note', note('second'), { index: 1 });
  const state = fixture([first, second], { confirmClear: async count => count === 2 ? false : true });
  assert.equal(await state.workflows.clearAll(), false);
  assert.equal(state.getVault().trash.length, 2);
  assert.equal(state.saved.length, 0);
  assert.equal(state.notices.length, 0);
});

test('accepted trash clear commits the entire removal as one validated vault write', async () => {
  const first = createTrashEntry('note', note('clear-first'), { index: 0 });
  const second = createTrashEntry('note', note('clear-second'), { index: 1 });
  const confirmedCounts = [];
  const state = fixture([first, second], { confirmClear: async count => { confirmedCounts.push(count); return true; } });
  assert.equal(await state.workflows.clearAll(), true);
  assert.deepEqual(confirmedCounts, [2]);
  assert.deepEqual(state.getVault().trash, []);
  assert.equal(state.saved.length, 1);
  assert.deepEqual(state.saved[0].trash, []);
});

test('trash clear restores all entries when the server transaction fails', async () => {
  const entry = createTrashEntry('note', note('clear-failure'), { index: 0 });
  const state = fixture([entry], { saveError: 'SQLite 写入失败' });
  assert.equal(await state.workflows.clearAll(), false);
  assert.equal(state.getVault().trash[0].id, entry.id);
  assert.deepEqual(state.notices, ['SQLite 写入失败']);
});

test('trash clear rejects a stale confirmation and preserves changed content', async () => {
  const entry = createTrashEntry('note', note('stale-entry'), { index: 0 });
  let state;
  state = fixture([entry], {
    confirmClear: async () => {
      const changed = structuredClone(state.getVault());
      changed.trash[0].item.title = '并发更新';
      state.setVault(changed);
      return true;
    }
  });
  assert.equal(await state.workflows.clearAll(), false);
  assert.equal(state.getVault().trash[0].item.title, '并发更新');
  assert.equal(state.saved.length, 0);
  assert.deepEqual(state.notices, ['回收站内容已变化，请重新确认']);
});

test('expired trash is pruned and saved without rolling back newer workspace changes on failure', async () => {
  const now = 60 * 24 * 60 * 60 * 1000;
  const expired = createTrashEntry('note', note('expired'), { index: 0 }, {}, now - TRASH_RETENTION_MS);
  const current = createTrashEntry('note', note('current'), { index: 0 }, {}, now - 1000);
  const state = fixture([expired, current], { now: () => now });
  assert.equal(state.workflows.pruneExpired(), 1);
  assert.deepEqual(state.getVault().trash.map(item => item.id), [current.id]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.saved.length, 1);
  assert.deepEqual(state.saved[0].trash.map(item => item.id), [current.id]);
});

test('expired trash remains available and reports an error when its save fails', async () => {
  const now = 60 * 24 * 60 * 60 * 1000;
  const expired = createTrashEntry('note', note('expired-rollback'), { index: 0 }, {}, now - TRASH_RETENTION_MS);
  const state = fixture([expired], { now: () => now, saveError: 'SQLite 不可用' });
  assert.equal(state.workflows.pruneExpired(), 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.getVault().trash[0].id, expired.id);
  assert.deepEqual(state.notices, ['SQLite 不可用']);
});
