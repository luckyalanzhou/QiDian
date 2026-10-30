import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPinia } from 'pinia';
import { JSDOM } from 'jsdom';
import { effectScope, nextTick, ref } from 'vue';
import { createActionDialogService } from '../../../src/features/dialogs/action-dialog-service.ts';
import { useActionDialogStore } from '../../../src/features/dialogs/store.ts';
import { firstRestorableFocusTarget, watchDialogFocusReturn } from '../../../src/features/dialogs/dialog-focus-return.ts';

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('action dialog focus outline uses an opaque accent with at least 3:1 theme contrast', async () => {
  const styles = await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8');
  const focusRule = styles.match(/\.action-dialog :focus-visible\s*\{([^}]+)\}/)?.[1];
  assert.ok(focusRule, 'action dialog focus rule exists');
  assert.match(focusRule, /outline:\s*3px solid var\(--accent\)/, 'focus outline remains fully opaque');

  const themes = [
    styles.match(/:root\s*\{([^}]+)\}/)?.[1],
    styles.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)?.[1]
  ];
  for (const theme of themes) {
    assert.ok(theme, 'both light and dark theme tokens are present');
    const accent = theme.match(/--accent:\s*(#[0-9a-f]{6})/i)?.[1];
    const panel = theme.match(/--panel:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(accent && panel, 'focus and panel colors use explicit theme tokens');
    assert.ok(contrastRatio(accent, panel) >= 3, `focus outline contrast is at least 3:1 (${accent} on ${panel})`);
  }
});

test('action dialog buttons meet the 44 pixel touch target floor', async () => {
  const styles = await readFile(new URL('../../../src/styles/workspace.css', import.meta.url), 'utf8');
  assert.match(styles, /\.action-dialog \.dialog-foot \.primary-btn,\s*\.action-dialog \.dialog-foot \.secondary-btn\s*\{\s*min-height:\s*44px;/);
});

test('danger confirmations initially focus cancel while prompts and ordinary confirmations keep their defaults', async () => {
  const component = await readFile(new URL('../../../src/features/dialogs/ActionDialog.vue', import.meta.url), 'utf8');
  assert.match(component, /const cancelButton = ref<HTMLButtonElement \| null>\(null\)/);
  assert.match(component, /store\.mode === 'prompt' \? input\.value : store\.danger \? cancelButton\.value : confirmButton\.value/);
  assert.match(component, /id="actionDialogCancel" ref="cancelButton"/);
});

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

test('action dialog service restores focus to a visible workspace control when the opener is removed', async () => {
  const dom = new JSDOM('<!doctype html><button id="deleteNote">删除笔记</button><input id="searchTop" aria-label="搜索">', { pretendToBeVisual: true });
  const { document } = dom.window;
  const store = useActionDialogStore(createPinia());
  const service = createActionDialogService(store, () => document);
  const opener = document.querySelector('#deleteNote');
  const search = document.querySelector('#searchTop');
  opener.focus();

  const confirmation = service.open({ title: '删除笔记', message: '确认删除？', danger: true });
  opener.remove();
  service.close(true);
  assert.equal(await confirmation, true);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(document.activeElement, search, 'the visible search field receives focus after the deleted note action disappears');
  dom.window.close();
});

test('action dialog restores focus to the stable menu trigger after cancelling from a menu', async () => {
  const dom = new JSDOM('<!doctype html><details class="item-menu" open><summary tabindex="0">更多</summary><button id="deleteDoc">删除</button></details><button id="searchTop">搜索</button>', { pretendToBeVisual: true });
  const { document } = dom.window;
  const store = useActionDialogStore(createPinia());
  const service = createActionDialogService(store, () => document);
  const opener = document.querySelector('#deleteDoc');
  const trigger = document.querySelector('summary');
  opener.focus();

  const confirmation = service.open({ title: '移入回收站', message: '确认删除？', danger: true });
  document.querySelector('details').open = false;
  service.close(false);
  assert.equal(await confirmation, false);
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));

  assert.equal(document.activeElement, trigger, 'keyboard focus returns to the visible menu trigger after its action is hidden');
  dom.window.close();
});

test('focus restoration skips controls hidden by a collapsed details menu', () => {
  const dom = new JSDOM('<details><summary>菜单</summary><button id="hidden-action">删除</button></details><button id="fallback">搜索</button>', { pretendToBeVisual: true });
  const { document } = dom.window;
  const hiddenAction = document.querySelector('#hidden-action');
  const fallback = document.querySelector('#fallback');

  assert.equal(firstRestorableFocusTarget([hiddenAction, fallback]), fallback);
  document.querySelector('details').open = true;
  assert.equal(firstRestorableFocusTarget([hiddenAction, fallback]), hiddenAction);
  dom.window.close();
});

test('focus restoration falls back when the opener cannot receive focus', async () => {
  const dom = new JSDOM('<button id="opener">删除</button><input id="fallback" aria-label="搜索">', { pretendToBeVisual: true });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  const scope = effectScope();
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    const opener = dom.window.document.querySelector('#opener');
    const fallback = dom.window.document.querySelector('#fallback');
    opener.focus();
    opener.focus = () => {};
    const open = ref(false);
    scope.run(() => watchDialogFocusReturn(() => open.value, () => fallback));

    open.value = true;
    await nextTick();
    opener.blur();
    open.value = false;
    await nextTick();
    await nextTick();

    assert.equal(dom.window.document.activeElement, fallback);
  } finally {
    scope.stop();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement);
    else delete globalThis.HTMLElement;
    dom.window.close();
  }
});

test('closing a dialog does not steal focus from a newer modal that replaced it', async () => {
  const dom = new JSDOM('<button id="account">账号菜单</button><button id="search">搜索</button><div class="overlay"><button id="newDialog">新弹窗关闭</button></div>', { pretendToBeVisual: true });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  const scope = effectScope();
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    const account = dom.window.document.querySelector('#account');
    const search = dom.window.document.querySelector('#search');
    const newDialog = dom.window.document.querySelector('#newDialog');
    const newOverlay = newDialog.closest('.overlay');
    search.focus();
    const open = ref(false);
    scope.run(() => watchDialogFocusReturn(() => open.value, () => account, { preferFallback: true }));

    open.value = true;
    await nextTick();
    newOverlay.classList.add('open');
    newDialog.focus();
    open.value = false;
    await nextTick();
    await nextTick();

    assert.equal(newDialog, dom.window.document.activeElement);
    assert.notEqual(account, dom.window.document.activeElement);
  } finally {
    scope.stop();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement);
    else delete globalThis.HTMLElement;
    dom.window.close();
  }
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
