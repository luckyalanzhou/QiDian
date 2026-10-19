import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLegacyNoteTypeDialog } from '../src/features/notes/legacy-type-dialog.ts';

function createDialog() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const dialog = createLegacyNoteTypeDialog({
    document: dom.window.document,
    escapeHtml: value => String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]),
  });
  return { dom, dialog };
}

test('legacy note type dialog lazily creates and reuses an accessible dialog', () => {
  const { dom, dialog } = createDialog();
  const document = dom.window.document;

  dialog.open({ mode: 'create', id: null, title: '新增笔记类型', hint: '', name: '' });
  const overlay = document.querySelector('#typeOverlay');
  assert.ok(overlay);
  assert.equal(overlay.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
  assert.equal(overlay.classList.contains('open'), true);

  dialog.open({ mode: 'edit', id: 'book', title: '编辑笔记类型', hint: '', name: '读书笔记' });
  assert.equal(document.querySelectorAll('#typeOverlay').length, 1);
  assert.equal(document.querySelector('#typeNameInput').value, '读书笔记');
  assert.equal(document.querySelector('#typeDialogConfirm').textContent, '保存修改');
  assert.equal(dialog.readSubmission().mode, 'edit');
  assert.equal(dialog.readSubmission().id, 'book');

  dialog.close();
  assert.equal(overlay.classList.contains('open'), false);
  dom.window.close();
});

test('legacy note type dialog escapes user supplied values and reads the edited name', () => {
  const { dom, dialog } = createDialog();
  const document = dom.window.document;

  dialog.open({ mode: 'create', id: null, title: '新增笔记类型', hint: '', name: '" autofocus onfocus="alert(1)' });
  const input = document.querySelector('#typeNameInput');
  assert.equal(input.value, '" autofocus onfocus="alert(1)');
  assert.equal(document.querySelector('[onfocus]'), null);
  input.value = '系统记录';
  const fallbackType = { id: 'note', name: '普通笔记' };
  assert.deepEqual(dialog.readSubmission(fallbackType), {
    mode: 'create', id: null, name: '系统记录', targetId: '', fallbackType,
  });

  dom.window.close();
});

test('legacy delete dialog reads the selected replacement and marks automatic fallback', () => {
  const { dom, dialog } = createDialog();
  const document = dom.window.document;

  dialog.open({
    mode: 'delete', id: 'issue', title: '删除笔记类型', hint: '保留笔记',
    itemName: '<故障>', noteCount: 2,
    options: [{ id: 'note', name: '普通笔记', autoCreate: true }],
  });
  const overlay = document.querySelector('#typeOverlay');
  const confirm = document.querySelector('#typeDialogConfirm');
  assert.match(document.querySelector('#typeDialogBody').textContent, /<故障>/);
  assert.equal(document.querySelector('#typeDialogBody strong').textContent, '2');
  assert.match(document.querySelector('#typeReplacement option').textContent, /自动创建/);
  assert.equal(confirm.textContent, '删除类型');
  assert.equal(confirm.classList.contains('danger-btn'), true);
  assert.equal(dialog.readSubmission().targetId, 'note');

  dialog.open({ mode: 'edit', id: 'note', title: '编辑笔记类型', hint: '', name: '普通笔记' });
  assert.equal(confirm.classList.contains('danger-btn'), false);
  assert.equal(overlay.classList.contains('open'), true);
  dom.window.close();
});
