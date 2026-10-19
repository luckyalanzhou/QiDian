import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteVaultUpdateController } from '../src/features/sync/remote-vault-update-controller.ts';

function note(id, overrides = {}) {
  return {
    id,
    title: '说明',
    type: 'note',
    category: '未分类',
    tags: [],
    body: '<p>内容</p>',
    source: '',
    created: 1,
    updated: 2,
    pinned: false,
    status: 'published',
    ...overrides
  };
}

function createHarness({ editing = false, noteId = null, draft = null, transientId = null, localChanges = false } = {}) {
  const calls = [];
  let currentVault = { categories: [], notes: [], bookmarks: [], theme: 'light' };
  let editingState = { editing, noteId, draft };
  let scrollY = 144;
  const controller = createRemoteVaultUpdateController({
    getEditingState: () => editingState,
    getTransientNewNoteId: () => transientId,
    hasLocalEditorChanges: () => localChanges,
    isDraft: value => value?.status === 'draft',
    hasDraftContent: value => !!value?.title?.trim() || !!value?.body?.replace(/<[^>]*>/g, '').trim(),
    replaceVault: value => { currentVault = value; calls.push('replace'); },
    applyTheme: () => calls.push('theme'),
    syncBookmarkPreferences: () => calls.push('bookmarks'),
    findNote: id => currentVault.notes.find(item => item.id === id),
    restoreTransientDraft: value => { currentVault.notes.unshift(value); calls.push('restoreDraft'); },
    persistRestoredDraft: () => calls.push('persistDraft'),
    clearAutoSave: () => calls.push('clearAutoSave'),
    closeEditor: () => { editingState = { editing: false, noteId: null, draft: null }; calls.push('closeEditor'); },
    refreshEditor: (value, preserve) => calls.push(['refreshEditor', value.id, preserve]),
    refreshSidebar: () => calls.push('sidebar'),
    render: () => calls.push('render'),
    getScrollY: () => scrollY,
    scrollTo: value => { scrollY = value; calls.push(['scrollTo', value]); }
  });
  return { calls, controller, getVault: () => currentVault, getEditingState: () => editingState, getScrollY: () => scrollY };
}

test('remote snapshot refreshes the workspace and preserves its scroll position', () => {
  const harness = createHarness();
  const remote = { categories: ['资料'], notes: [note('n1')], bookmarks: [], theme: 'dark' };

  harness.controller.handle(remote);

  assert.deepEqual(harness.calls, ['replace', 'theme', 'bookmarks', 'render', ['scrollTo', 144]]);
  assert.equal(harness.getVault().theme, 'dark');
  remote.notes[0].title = 'mutated after dispatch';
  assert.equal(harness.getVault().notes[0].title, '说明', 'controller must own a snapshot, not the caller object');
});

test('active editor refreshes from the server without discarding local edits', () => {
  const harness = createHarness({ editing: true, noteId: 'n1', localChanges: true });

  harness.controller.handle({ categories: [], notes: [note('n1', { title: '服务端版本' })], bookmarks: [] });

  assert.deepEqual(harness.calls, ['replace', 'theme', 'bookmarks', 'sidebar', ['refreshEditor', 'n1', true]]);
  assert.equal(harness.getEditingState().editing, true);
});

test('remote deletion preserves a non-empty transient draft and persists it', () => {
  const pendingDraft = note('new-note', { title: '尚未提交的笔记', status: 'draft' });
  const harness = createHarness({ editing: true, noteId: 'new-note', draft: pendingDraft, transientId: 'new-note' });

  harness.controller.handle({ categories: [], notes: [], bookmarks: [] });

  assert.deepEqual(harness.calls, ['replace', 'theme', 'bookmarks', 'sidebar', 'restoreDraft', 'persistDraft', 'sidebar']);
  assert.equal(harness.getVault().notes[0].title, '尚未提交的笔记');
  assert.equal(harness.getEditingState().editing, true);
});

test('remote deletion keeps an empty transient draft in memory without persisting it', () => {
  const emptyDraft = note('new-note', { title: '', body: '<p></p>', status: 'draft' });
  const harness = createHarness({ editing: true, noteId: 'new-note', draft: emptyDraft, transientId: 'new-note' });

  harness.controller.handle({ categories: [], notes: [], bookmarks: [] });

  assert.deepEqual(harness.calls, ['replace', 'theme', 'bookmarks', 'sidebar', 'restoreDraft', 'sidebar']);
  assert.equal(harness.getVault().notes[0].title, '');
  assert.equal(harness.getEditingState().editing, true);
});

test('remote deletion closes a removed saved note and restores scroll', () => {
  const harness = createHarness({ editing: true, noteId: 'removed-note', draft: note('removed-note') });

  harness.controller.handle({ categories: [], notes: [], bookmarks: [] });

  assert.deepEqual(harness.calls, [
    'replace', 'theme', 'bookmarks', 'sidebar', 'clearAutoSave', 'closeEditor', 'render', ['scrollTo', 144]
  ]);
  assert.equal(harness.getEditingState().editing, false);
  assert.equal(harness.getEditingState().noteId, null);
});
