import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentVaultSnapshot } from '../src/features/sync/current-vault-snapshot.ts';

function note(overrides = {}) {
  return {
    id: 'note-1', title: '已发布', type: 'note', category: '未分类', tags: [],
    body: '<p>旧正文</p>', source: '', created: 1, updated: 10, pinned: false,
    status: 'published', publishedAt: 1, ...overrides
  };
}

function vaultWith(currentNote) {
  return {
    categories: [], noteTypes: [{ id: 'note', name: '普通笔记' }], notes: [currentNote],
    bookmarks: [], trash: [], theme: 'light', pasteMode: 'rich'
  };
}

test('current vault snapshot includes active editor fields in the merge candidate and vault', () => {
  const stored = note();
  const vault = vaultWith(stored);
  let editingDraft = structuredClone(stored);
  const snapshot = createCurrentVaultSnapshot({
    getVault: () => vault,
    isEditing: () => true,
    getEditingDraft: () => editingDraft,
    editorIsMounted: () => true,
    updateDraftFromEditor: () => {
      editingDraft.body = '<p>尚未自动保存的正文</p>';
      editingDraft.updated = 99;
    },
    isDraft: () => false,
    hasDraftContent: () => true,
    mutateVault: operation => operation(vault)
  });

  const result = snapshot();
  assert.equal(result.notes[0].body, '<p>尚未自动保存的正文</p>');
  assert.equal(result.notes[0].updated, 99);
  assert.equal(vault.notes[0].body, result.notes[0].body);
});
test('current vault snapshot preserves the note timestamp when editor content is unchanged', () => {
  const stored = note();
  const vault = vaultWith(stored);
  let editingDraft = structuredClone(stored);
  const snapshot = createCurrentVaultSnapshot({
    getVault: () => vault,
    isEditing: () => true,
    getEditingDraft: () => editingDraft,
    editorIsMounted: () => true,
    updateDraftFromEditor: () => { editingDraft.updated = 99; },
    isDraft: () => false,
    hasDraftContent: () => true,
    mutateVault: operation => operation(vault)
  });

  assert.equal(snapshot().notes[0].updated, 10);
});

test('current vault snapshot excludes a blank transient draft without mutating the vault', () => {
  const blankDraft = note({ id: 'new-note', title: '', body: '', status: 'draft', publishedAt: undefined });
  const vault = vaultWith(blankDraft);
  let editingDraft = structuredClone(blankDraft);
  const snapshot = createCurrentVaultSnapshot({
    getVault: () => vault,
    isEditing: () => true,
    getEditingDraft: () => editingDraft,
    editorIsMounted: () => true,
    updateDraftFromEditor: () => {},
    isDraft: candidate => candidate.status === 'draft',
    hasDraftContent: candidate => !!(candidate.title.trim() || candidate.body.trim()),
    mutateVault: operation => operation(vault)
  });

  const result = snapshot();
  assert.deepEqual(result.notes, []);
  assert.equal(vault.notes.length, 1);
});
