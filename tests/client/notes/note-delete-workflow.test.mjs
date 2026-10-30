import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NOTE_TYPES, validateVault } from '../../../shared/vault-validation.js';
import { createVaultMutation } from '../../../src/features/vault/mutation.ts';
import { createNoteDeleteWorkflow } from '../../../src/features/notes/delete-workflow.ts';

const note = id => ({
  id, title: `笔记 ${id}`, type: 'note', category: '开发', tags: [], body: '<p>正文</p>', source: '',
  created: 1, updated: 2, pinned: false, status: 'published'
});

function fixture(notes, options = {}) {
  let vault = validateVault({ categories: ['开发'], noteTypes: DEFAULT_NOTE_TYPES, notes, bookmarks: [], trash: [] });
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
  const workflow = createNoteDeleteWorkflow({
    getVault: () => vault,
    mutateVault,
    notify: message => notices.push(message)
  });
  return { workflow, getVault: () => vault, setVault: value => { vault = value; }, saved, notices };
}

test('moving a note to trash preserves its position and saves the validated candidate', async () => {
  const state = fixture([note('before'), note('move-me'), note('after')]);
  assert.equal(await state.workflow.moveToTrash('move-me'), true);
  assert.deepEqual(state.getVault().notes.map(item => item.id), ['before', 'after']);
  assert.equal(state.getVault().trash.length, 1);
  assert.equal(state.getVault().trash[0].item.id, 'move-me');
  assert.equal(state.getVault().trash[0].index, 1);
  assert.equal(state.getVault().trash[0].previousId, 'before');
  assert.equal(state.getVault().trash[0].nextId, 'after');
  assert.equal(state.saved.length, 1);
  assert.deepEqual(state.notices, []);
});

test('moving a missing note does not save or mutate the vault', async () => {
  const state = fixture([note('existing')]);
  const before = state.getVault();
  assert.equal(await state.workflow.moveToTrash('missing'), false);
  assert.equal(state.getVault(), before);
  assert.equal(state.saved.length, 0);
  assert.deepEqual(state.notices, []);
});

test('a failed SQLite write restores the note to its original workspace', async () => {
  const state = fixture([note('retry-me')], { saveError: 'SQLite 写入失败' });
  assert.equal(await state.workflow.moveToTrash('retry-me'), false);
  assert.deepEqual(state.getVault().notes.map(item => item.id), ['retry-me']);
  assert.deepEqual(state.getVault().trash, []);
  assert.deepEqual(state.notices, ['SQLite 写入失败']);
});

test('a failed delete never overwrites a newer workspace revision', async () => {
  const state = fixture([note('newer-revision')], {
    save: () => new Promise((_resolve, reject) => { state.rejectSave = () => reject(new Error('revision conflict')); })
  });
  const pending = state.workflow.moveToTrash('newer-revision');
  await new Promise(resolve => setImmediate(resolve));
  const newer = structuredClone(state.getVault());
  newer.theme = 'dark';
  state.setVault(validateVault(newer));
  state.rejectSave();
  assert.equal(await pending, false);
  assert.equal(state.getVault().theme, 'dark');
  assert.deepEqual(state.getVault().notes, []);
  assert.equal(state.getVault().trash[0].item.id, 'newer-revision');
  assert.deepEqual(state.notices, ['revision conflict']);
});
