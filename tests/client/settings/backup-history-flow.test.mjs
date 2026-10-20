import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupHistoryFlow } from '../../../src/features/settings/backup-history-flow.ts';

const entries = (count, prefix = 'revision') => Array.from({ length: count }, (_, index) => ({ revision: `${prefix}-${index + 1}`, created: index + 1 }));

test('backup history flow shows loading, keeps the newest twenty entries, and clears transient state', async () => {
  const flow = createBackupHistoryFlow({ listBackups: async () => entries(25), localPreview: false });
  const request = flow.refresh();
  assert.equal(flow.state.loading, true);
  await request;
  assert.equal(flow.state.loading, false);
  assert.equal(flow.state.items.length, 20);
  assert.equal(flow.state.error, '');
  assert.equal(flow.emptyMessage(), '');
});

test('a newer backup request wins when an earlier request resolves later', async () => {
  const pending = [];
  const flow = createBackupHistoryFlow({ listBackups: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), localPreview: false });
  const older = flow.refresh();
  const newer = flow.refresh();
  pending[1].resolve(entries(1, 'new'));
  await newer;
  pending[0].resolve(entries(1, 'old'));
  await older;
  assert.equal(flow.state.items[0].revision, 'new-1');
  assert.equal(flow.state.loading, false);
});

test('backup history flow reports load errors and distinguishes local preview empty state', async () => {
  const failing = createBackupHistoryFlow({ listBackups: async () => { throw Error('服务暂不可用'); }, localPreview: false });
  await failing.refresh();
  assert.equal(failing.state.error, '服务暂不可用');
  assert.equal(failing.state.loading, false);

  const local = createBackupHistoryFlow({ listBackups: async () => [], localPreview: true });
  await local.refresh();
  assert.equal(local.emptyMessage(), '本地预览模式不提供服务端快照。');
});
