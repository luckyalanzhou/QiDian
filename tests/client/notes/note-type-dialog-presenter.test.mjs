import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteTypeDialogPresenter } from '../../../src/features/notes/type-dialog-presenter.ts';

const defaultNoteTypes = [{ id: 'note', name: '普通笔记' }];

function harness({ vueMounted = true, noteTypes = [{ id: 'note', name: '普通笔记' }, { id: 'guide', name: '指南' }] } = {}) {
  const opened = [];
  const notices = [];
  const vault = {
    noteTypes,
    notes: [{ id: 'active', type: 'guide' }, { id: 'other', type: 'note' }],
  };
  const presenter = createNoteTypeDialogPresenter({
    getVault: () => vault,
    defaultNoteTypes,
    displayTypeName: type => type.id === 'note' ? '普通知识' : type.name,
    vueMounted,
    vueDialog: { open: configuration => opened.push(['vue', configuration]) },
    legacyDialog: { open: configuration => opened.push(['legacy', configuration]) },
    notify: message => notices.push(message),
  });
  return { presenter, opened, notices };
}

test('note type presenter prepares create and edit dialogs for the mounted Vue UI', () => {
  const h = harness();
  h.presenter.open('create');
  h.presenter.open('edit', 'note');

  assert.deepEqual(h.opened, [
    ['vue', {
      mode: 'create', id: null, title: '新增笔记类型', hint: '', name: '', itemName: '', noteCount: 0,
      options: [{ id: 'note', name: '普通笔记', autoCreate: false }, { id: 'guide', name: '指南', autoCreate: false }],
    }],
    ['vue', {
      mode: 'edit', id: 'note', title: '编辑笔记类型', hint: '', name: '普通知识', itemName: '普通笔记', noteCount: 0,
      options: [{ id: 'guide', name: '指南', autoCreate: false }],
    }],
  ]);
  assert.deepEqual(h.notices, []);
});

test('delete dialog counts active notes and offers the automatic fallback when deleting the last type', () => {
  const h = harness({ noteTypes: [{ id: 'guide', name: '指南' }] });
  h.presenter.open('delete', 'guide');

  assert.deepEqual(h.opened[0], ['vue', {
    mode: 'delete', id: 'guide', title: '删除笔记类型',
    hint: '相关笔记会转移到所选类型，正文和附件不会删除。', name: '指南', itemName: '指南', noteCount: 1,
    options: [{ id: 'note', name: '普通笔记', autoCreate: true }],
  }]);
});

test('note type presenter routes to the compatibility dialog only when Vue is unavailable', () => {
  const h = harness({ vueMounted: false });
  h.presenter.open('edit', 'guide');
  assert.equal(h.opened[0][0], 'legacy');
});

test('note type presenter blocks creation after the supported limit', () => {
  const noteTypes = Array.from({ length: 50 }, (_, index) => ({ id: `type-${index}`, name: `类型${index}` }));
  const h = harness({ noteTypes });
  h.presenter.open('create');
  assert.deepEqual(h.opened, []);
  assert.deepEqual(h.notices, ['最多支持 50 种笔记类型']);
});
