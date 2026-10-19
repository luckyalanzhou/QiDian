import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLegacyCategoryDialog } from '../src/features/categories/legacy-category-dialog.ts';

function createDialog() {
  const dom = new JSDOM('<div id="categoryOverlay"><input id="categoryNameInput"><p id="categoryDialogMessage"></p></div>');
  const scheduled = [];
  const dialog = createLegacyCategoryDialog({
    document: dom.window.document,
    scheduleFocus: callback => scheduled.push(callback)
  });
  return { dom, dialog, scheduled };
}

test('legacy category dialog resets fields, opens, and focuses the input', () => {
  const { dom, dialog, scheduled } = createDialog();
  const overlay = dom.window.document.querySelector('#categoryOverlay');
  const input = dom.window.document.querySelector('#categoryNameInput');
  const message = dom.window.document.querySelector('#categoryDialogMessage');
  input.value = '旧分类';
  message.textContent = '旧错误';

  assert.equal(dialog.open(), true);
  assert.equal(overlay.classList.contains('open'), true);
  assert.equal(input.value, '');
  assert.equal(message.textContent, '');
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(dom.window.document.activeElement, input);

  input.value = '新分类';
  assert.equal(dialog.readInput(), '新分类');
  dialog.close();
  assert.equal(overlay.classList.contains('open'), false);
  dom.window.close();
});

test('legacy category dialog shows failures as text and restores input focus', () => {
  const { dom, dialog } = createDialog();
  const input = dom.window.document.querySelector('#categoryNameInput');
  const message = dom.window.document.querySelector('#categoryDialogMessage');
  dialog.showError(new Error('<分类错误>'));

  assert.equal(message.textContent, '<分类错误>');
  assert.equal(message.children.length, 0);
  assert.equal(dom.window.document.activeElement, input);
  dom.window.close();
});
