import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { useToastStore } from '../src/features/notifications/store.ts';

test('notification store accepts messages directly and ignores empty values', () => {
  const store = useToastStore(createPinia());
  store.show('保存失败');
  assert.equal(store.message, '保存失败');
  assert.equal(store.visible, true);
  assert.equal(store.revision, 1);

  store.show('');
  store.show(null);
  assert.equal(store.revision, 1, 'empty messages are ignored');
});

test('toast store replaces the current notice, advances its timer revision, and dismisses cleanly', () => {
  const store = useToastStore(createPinia());
  store.show('第一条提示');
  store.show('第二条提示');

  assert.equal(store.message, '第二条提示');
  assert.equal(store.visible, true);
  assert.equal(store.revision, 2);

  store.dismiss();
  assert.equal(store.message, '');
  assert.equal(store.visible, false);
  assert.equal(store.revision, 2);
});
