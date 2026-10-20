import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { JSDOM } from 'jsdom';
import { createActionDialogService } from '../../../src/features/dialogs/action-dialog-service.ts';
import { useActionDialogStore } from '../../../src/features/dialogs/store.ts';

test('action dialog service resolves confirmations, preserves input, and restores focus', async () => {
  const dom = new JSDOM('<!doctype html><button id="opener">Open</button>', { pretendToBeVisual: true });
  const { document } = dom.window;
  const store = useActionDialogStore(createPinia());
  const service = createActionDialogService(store, () => document);
  const opener = document.querySelector('#opener');
  opener.focus();

  const confirmation = service.open({ title: '移入回收站', message: '确认删除？', danger: true });
  assert.equal(store.visible, true);
  assert.equal(store.title, '移入回收站');
  assert.equal(store.danger, true);
  service.close(true);
  assert.equal(await confirmation, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(store.visible, false);
  assert.equal(document.activeElement, opener);

  const prompt = service.open({ mode: 'prompt', inputValue: '初始值', maxLength: 40 });
  assert.equal(store.inputValue, '初始值');
  assert.equal(store.maxLength, 40);
  store.setInputValue('新值');
  service.close(true);
  assert.equal(await prompt, '新值');

  const cancelledPrompt = service.open({ mode: 'prompt' });
  service.close(false);
  assert.equal(await cancelledPrompt, null);
  dom.window.close();
});

test('action dialog service rejects concurrent dialogs without replacing the active request', async () => {
  const store = useActionDialogStore(createPinia());
  const service = createActionDialogService(store, () => undefined);
  const first = service.open({ message: '第一个操作' });
  assert.equal(await service.open({ mode: 'prompt' }), null);
  assert.equal(store.message, '第一个操作');
  service.close(false);
  assert.equal(await first, false);
});
