import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppSettingsActions } from '../src/features/settings/app-settings-actions.ts';

function makeHarness(overrides = {}) {
  const events = [];
  let currentData = { notes: [], trash: [] };
  const dependencies = {
    localPreview: false,
    closeSettings: () => events.push('close-settings'),
    closeMenu: () => events.push('close-menu'),
    retrySync: () => events.push('retry-sync'),
    confirmReload: async sourceLabel => { events.push(['confirm', sourceLabel]); return true; },
    saveActiveEditor: () => events.push('save-editor'),
    getCurrentData: () => structuredClone(currentData),
    exportBackup: async data => { events.push(['backup', structuredClone(data)]); },
    reloadCloud: async () => { events.push('reload-cloud'); return { notes: [{ id: 'cloud' }], trash: [] }; },
    restoreIgnoredDraft: async () => ({ data: { notes: [{ id: 'local' }], trash: [] }, conflict: false }),
    replaceWorkspace: data => { currentData = structuredClone(data); events.push(['replace', structuredClone(data)]); },
    markIgnoredDraftHandled: () => events.push('mark-draft-handled'),
    queueSave: data => events.push(['queue-save', structuredClone(data)]),
    openSyncConflict: () => events.push('open-conflict'),
    openBackupHistory: () => events.push('open-backups'),
    exportJSON: () => events.push('export-json'),
    openImportPicker: () => events.push('open-import'),
    notify: message => events.push(['notify', message]),
    ...overrides
  };
  const actions = createAppSettingsActions(dependencies);
  return { actions, events, setCurrentData: data => { currentData = data; } };
}

test('settings reload exports the active editor snapshot before replacing it with cloud data', async () => {
  const harness = makeHarness({
    saveActiveEditor: () => {
      harness.events.push('save-editor');
      harness.setCurrentData({ notes: [{ id: 'unsaved-editor' }], trash: [] });
    }
  });
  harness.actions.dispatch('reload-cloud');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(harness.events, [
    ['confirm', 'Docker 服务端版本'],
    'save-editor',
    ['backup', { notes: [{ id: 'unsaved-editor' }], trash: [] }],
    'close-settings',
    'close-menu',
    'reload-cloud',
    ['replace', { notes: [{ id: 'cloud' }], trash: [] }],
    ['notify', '已重新载入已保存的数据']
  ]);
});

test('settings reload keeps the current workspace open if a complete backup fails', async () => {
  const harness = makeHarness({ exportBackup: async () => { throw Error('快照暂不可用'); } });
  harness.actions.dispatch('reload-cloud');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(harness.events, [
    ['confirm', 'Docker 服务端版本'],
    'save-editor',
    ['notify', '重新载入已取消，当前内容未替换：快照暂不可用']
  ]);
});

test('cancelling settings reload performs no backup or workspace mutation', async () => {
  const harness = makeHarness({ confirmReload: async sourceLabel => { harness.events.push(['confirm', sourceLabel]); return false; } });
  harness.actions.dispatch('reload-cloud');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(harness.events, [['confirm', 'Docker 服务端版本']]);
});

test('local preview reload labels its actual browser storage source', async () => {
  const harness = makeHarness({ localPreview: true });
  harness.actions.dispatch('reload-cloud');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(harness.events.filter(event => event[0] === 'confirm' || event[0] === 'notify'), [
    ['confirm', '本地预览数据'],
    ['notify', '已重新载入本地预览数据']
  ]);
});

test('restoring a matching local draft queues it, while conflicts open the conflict workspace without saving', async () => {
  const matching = makeHarness();
  matching.actions.dispatch('restore-draft');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(matching.events, [
    'close-settings',
    'close-menu',
    ['replace', { notes: [{ id: 'local' }], trash: [] }],
    'mark-draft-handled',
    ['queue-save', { notes: [{ id: 'local' }], trash: [] }],
    ['notify', '本地草稿已恢复，正在同步']
  ]);

  const conflict = makeHarness({ restoreIgnoredDraft: async () => ({ data: { notes: [{ id: 'local' }], trash: [] }, conflict: true }) });
  conflict.actions.dispatch('restore-draft');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(conflict.events, [
    'close-settings',
    'close-menu',
    ['replace', { notes: [{ id: 'local' }], trash: [] }],
    'mark-draft-handled',
    'open-conflict'
  ]);
});

test('settings actions delegate retry, conflict, backup history, import and export to their workflows', () => {
  const harness = makeHarness();
  for (const action of ['retry-sync', 'review-conflict', 'backup-history', 'export-backup', 'import-backup']) {
    harness.actions.dispatch(action);
  }
  assert.deepEqual(harness.events, [
    'close-settings', 'retry-sync',
    'close-settings', 'open-conflict',
    'open-backups',
    'close-settings', 'close-menu', 'export-json',
    'close-settings', 'close-menu', 'open-import'
  ]);
});
