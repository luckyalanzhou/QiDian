import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupHistoryOpenFlow } from '../../../src/features/settings/backup-history-open-flow.ts';

function harness({ editing = false } = {}) {
  const events = [];
  const flow = createBackupHistoryOpenFlow({
    isEditing: () => editing,
    saveActiveDraft: () => events.push('save-active-draft'),
    closeSettings: () => events.push('close-settings'),
    closeMenu: () => events.push('close-menu'),
    showDialog: () => events.push('show-dialog'),
    refresh: async () => { events.push('refresh'); },
  });
  return { flow, events };
}

test('opening backup history preserves the active draft and waits for its list refresh', async () => {
  const h = harness({ editing: true });

  await h.flow.open();

  assert.deepEqual(h.events, ['save-active-draft', 'close-settings', 'close-menu', 'show-dialog', 'refresh']);
});

test('opening backup history skips draft work when no editor is active', async () => {
  const h = harness();

  await h.flow.open();

  assert.deepEqual(h.events, ['close-settings', 'close-menu', 'show-dialog', 'refresh']);
});
