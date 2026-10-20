import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountWorkspaceKeyboardEvents } from '../src/features/navigation/workspace-keyboard-events.ts';

test('workspace keyboard events route the command palette, save, escape, and note activation', () => {
  const dom = new JSDOM('<details class="item-menu" open></details><button class="note-card-open" data-open="note-1"></button>');
  const { document, KeyboardEvent } = dom.window;
  const calls = [];
  const events = mountWorkspaceKeyboardEvents(document, {
    isEditing: () => true,
    toggleCommandPalette: () => calls.push('toggle-command-palette'),
    saveDraft: () => calls.push('save-draft'),
    updateEditorBaseline: () => calls.push('baseline'),
    closeSearch: () => calls.push('close-search'),
    closeCapture: () => calls.push('close-capture'),
    closeCreateMenu: () => calls.push('close-create-menu'),
    closeBackupHistory: () => calls.push('close-backup-history'),
    closeAccountSettings: () => calls.push('close-account-settings'),
    closeThemeMenu: () => calls.push('close-theme'),
    closeAccountMenu: () => calls.push('close-account'),
    closeWorkspaceMenu: () => calls.push('close-workspace-menu'),
    closeSlashMenu: () => calls.push('close-slash'),
    openNote: id => calls.push(`open-note:${id}`)
  });

  const search = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(search);
  assert.equal(search.defaultPrevented, true);
  assert.deepEqual(calls, ['toggle-command-palette']);

  const save = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(save);
  assert.equal(save.defaultPrevented, true);
  assert.deepEqual(calls.slice(-2), ['save-draft', 'baseline']);

  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  document.dispatchEvent(escape);
  assert.equal(document.querySelector('.item-menu').open, false);
  assert.deepEqual(calls.slice(-9), [
    'close-search', 'close-capture', 'close-create-menu', 'close-account-settings', 'close-backup-history', 'close-theme',
    'close-account', 'close-workspace-menu', 'close-slash'
  ]);

  const card = document.querySelector('.note-card-open');
  const activate = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  card.dispatchEvent(activate);
  assert.equal(activate.defaultPrevented, true);
  assert.equal(calls.at(-1), 'open-note:note-1');

  events();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(calls.at(-1), 'open-note:note-1', 'unmount removes the keyboard listener');
  dom.window.close();
});

test('workspace shortcuts leave browser defaults intact outside their actions', () => {
  const dom = new JSDOM('<input class="note-card-open" data-open="note-1">');
  const { document, KeyboardEvent } = dom.window;
  const calls = [];
  mountWorkspaceKeyboardEvents(document, {
    isEditing: () => false,
    toggleCommandPalette: () => calls.push('palette'), saveDraft: () => calls.push('save'), updateEditorBaseline: () => calls.push('baseline'),
    closeSearch() {}, closeCapture() {}, closeCreateMenu() {}, closeBackupHistory() {}, closeAccountSettings() {}, closeThemeMenu() {}, closeAccountMenu() {}, closeWorkspaceMenu() {}, closeSlashMenu() {}, openNote: id => calls.push(id)
  });
  const save = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
  document.dispatchEvent(save);
  assert.equal(save.defaultPrevented, false);
  assert.deepEqual(calls, []);
  dom.window.close();
});
