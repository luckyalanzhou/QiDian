import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NOTE_TYPES, validateVault } from '../../../shared/vault-validation.js';
import { createReaderActions } from '../../../src/features/reader/actions.ts';
import { createVaultMutation } from '../../../src/features/vault/mutation.ts';

function fixture({ failSave = false, previewing = false, confirmDelete = false } = {}) {
  let vault = validateVault({
    categories: ['工作'],
    noteTypes: DEFAULT_NOTE_TYPES,
    bookmarks: [],
    trash: [],
    notes: [{
      id: 'note-1', title: '当前标题', type: 'note', category: '工作', tags: ['tag'],
      body: '<p>当前正文</p>', source: '', created: 1, updated: 2, pinned: false,
      status: 'published', publishedAt: 2,
      publishedSnapshot: {
        title: '已发布标题', type: 'note', category: '工作', tags: ['published'],
        body: '<p>已发布正文</p>', source: '', updated: 1
      }
    }]
  });
  const notices = [];
  const opened = [];
  const effects = [];
  const mutation = createVaultMutation({
    getVault: () => vault,
    replaceVault: next => { vault = next; return vault; },
    save: () => failSave ? Promise.reject(new Error('SQLite 写入失败')) : Promise.resolve()
  });
  const actions = createReaderActions({
    getVault: () => vault,
    getCurrentNoteId: () => 'note-1',
    isPreviewing: () => previewing,
    isDraft: note => note.status === 'draft',
    publishedView: note => ({ ...note, ...(note.publishedSnapshot || {}) }),
    mutation,
    startEditing: () => effects.push('edit'),
    previewPendingChanges: () => effects.push('preview'),
    publishCurrent: async () => { effects.push('publish'); },
    confirmDelete: async () => { effects.push('confirm'); return confirmDelete; },
    moveToTrash: async id => { effects.push(`trash:${id}`); return true; },
    openHome: () => effects.push('home'),
    openNote: (id, forceEdit) => opened.push({ id, forceEdit, note: vault.notes.find(note => note.id === id) }),
    notify: message => notices.push(message)
  });
  return { actions, get vault() { return vault; }, notices, opened, effects };
}

test('reader commands delegate editing, pending preview, and publish to their owning flows', async () => {
  const state = fixture();
  state.actions.execute({ type: 'edit-current' });
  state.actions.execute({ type: 'show-pending-changes' });
  await state.actions.execute({ type: 'publish-current' });
  assert.deepEqual(state.effects, ['edit', 'preview', 'publish']);
});

test('reader pin toggle commits through the Vault transaction before reporting success', async () => {
  const state = fixture();
  await state.actions.execute({ type: 'toggle-current-pin' });
  assert.equal(state.vault.notes[0].pinned, true);
  assert.deepEqual(state.notices, ['已收藏']);
});

test('reader pin toggle restores the saved snapshot and reports a failed SQLite write', async () => {
  const state = fixture({ failSave: true });
  await state.actions.execute({ type: 'toggle-current-pin' });
  assert.equal(state.vault.notes[0].pinned, false);
  assert.deepEqual(state.notices, ['SQLite 写入失败']);
});

test('reader duplicate copies the published version and opens it only after commit', async () => {
  const state = fixture();
  await state.actions.execute({ type: 'duplicate-current' });
  const duplicate = state.vault.notes[0];
  assert.equal(duplicate.title, '已发布标题（副本）');
  assert.equal(duplicate.body, '<p>已发布正文</p>');
  assert.equal(duplicate.status, 'draft');
  assert.equal(duplicate.publishedAt, null);
  assert.equal(duplicate.pinned, false);
  assert.deepEqual(state.opened, [{ id: duplicate.id, forceEdit: true, note: duplicate }]);
});

test('reader duplicate does not open a copy when persistence fails', async () => {
  const state = fixture({ failSave: true });
  await state.actions.execute({ type: 'duplicate-current' });
  assert.equal(state.vault.notes.length, 1);
  assert.deepEqual(state.opened, []);
  assert.deepEqual(state.notices, ['创建副本失败：SQLite 写入失败']);
});

test('reader delete cancellation leaves the note in place', async () => {
  const state = fixture();
  await state.actions.execute({ type: 'delete-current' });
  assert.deepEqual(state.effects, ['confirm']);
  assert.equal(state.vault.notes.length, 1);
});

test('reader delete confirms before moving the note to recoverable trash', async () => {
  const state = fixture({ confirmDelete: true });
  await state.actions.execute({ type: 'delete-current' });
  assert.deepEqual(state.effects, ['confirm', 'trash:note-1', 'home']);
});
