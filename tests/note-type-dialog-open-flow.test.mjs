import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteTypeDialogOpenFlow } from '../src/features/notes/type-dialog-open-flow.ts';

function harness({ editing = false } = {}) {
  const events = [];
  const flow = createNoteTypeDialogOpenFlow({
    closeMenu: () => events.push('close-menu'),
    isEditing: () => editing,
    saveDraft: () => events.push('save-draft'),
    clearAutosave: () => events.push('clear-autosave'),
    leaveEditor: () => events.push('leave-editor'),
    render: () => events.push('render'),
    openDialog: (mode, id) => events.push(['open-dialog', mode, id]),
  });
  return { flow, events };
}

test('opening a note type dialog closes the menu and presents the requested dialog', () => {
  const h = harness();

  h.flow.open('edit', 'guide');

  assert.deepEqual(h.events, ['close-menu', ['open-dialog', 'edit', 'guide']]);
});

test('opening a note type dialog saves and exits the active editor before rendering the dialog', () => {
  const h = harness({ editing: true });

  h.flow.open('create');

  assert.deepEqual(h.events, [
    'close-menu', 'save-draft', 'clear-autosave', 'leave-editor', 'render',
    ['open-dialog', 'create', null],
  ]);
});
