import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceReplacementFlow } from '../../../src/features/vault/workspace-replacement-flow.ts';

function harness({ editing = true } = {}) {
  const events = [];
  const flow = createWorkspaceReplacementFlow({
    isEditing: () => editing,
    clearAutosave: () => events.push('clear-autosave'),
    destroyEditor: () => events.push('destroy-editor'),
    clearEditorBaseline: () => events.push('clear-editor-baseline'),
    clearUnsavedNewNote: () => events.push('clear-unsaved-new-note'),
    replaceVault: data => events.push(['replace-vault', data]),
    applyTheme: theme => events.push(['apply-theme', theme]),
    syncBookmarkPreferences: () => events.push('sync-bookmark-preferences'),
    resetHome: () => events.push('reset-home'),
    returnHomePreservingList: () => events.push('preserve-list'),
    closeBackupHistory: () => events.push('close-backup-history')
  });
  return { flow, events };
}

test('workspace import resets editor state and returns home with normalized trash', () => {
  const h = harness();
  const candidate = { categories: [], notes: [], theme: 'dark' };

  const restored = h.flow.replace(candidate, { navigation: 'reset-home' });

  assert.deepEqual(restored, { ...candidate, trash: [] });
  assert.deepEqual(h.events, [
    'clear-autosave',
    'destroy-editor',
    'clear-editor-baseline',
    'clear-unsaved-new-note',
    ['replace-vault', restored],
    ['apply-theme', 'dark'],
    'sync-bookmark-preferences',
    'reset-home'
  ]);
});

test('restoring a backup preserves the current list context and closes backup history', () => {
  const h = harness({ editing: false });
  const candidate = { categories: [], notes: [], trash: [{ id: 'trash-entry' }], theme: 'light' };

  h.flow.replace(candidate, { navigation: 'preserve-list', closeBackupHistory: true });

  assert.equal(h.events.includes('destroy-editor'), false);
  assert.deepEqual(h.events.slice(-4), [
    ['apply-theme', 'light'],
    'sync-bookmark-preferences',
    'preserve-list',
    'close-backup-history'
  ]);
});
