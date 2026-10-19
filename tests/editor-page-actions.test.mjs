import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorPageActions } from '../src/features/editor/page-actions.ts';

function note(overrides = {}) {
  return {
    id: 'note-1', title: '编辑页面', type: 'note', category: '开发', tags: [],
    body: '<p>当前正文</p>', source: '', created: 1, updated: 2, pinned: false,
    ...overrides
  };
}

function createActions(overrides = {}) {
  const calls = [];
  const stored = note();
  let editing = false;
  let previewing = false;
  const actions = createEditorPageActions({
    saveCurrent: () => calls.push('save'),
    chooseAttachment: () => calls.push('attachment'),
    chooseImage: () => calls.push('image'),
    deleteCurrent: () => calls.push('delete'),
    isEditing: () => editing,
    isPreviewing: () => previewing,
    saveDraft: quiet => calls.push(['draft', quiet]),
    getCurrentNote: () => stored,
    isDraft: current => current?.status === 'draft',
    publishedView: current => ({ ...current, title: '已发布标题', body: '<p>已发布正文</p>' }),
    cleanHTML: html => { calls.push(['clean', html]); return `clean:${html}`; },
    exportHTML: async (current, body) => calls.push(['export', current, body]),
    notify: message => calls.push(['notify', message]),
    ...overrides
  });
  return {
    actions,
    calls,
    stored,
    setEditing(value) { editing = value; },
    setPreviewing(value) { previewing = value; }
  };
}

test('editor page actions delegate each typed command to its feature operation', () => {
  const { actions, calls } = createActions();
  actions.execute({ type: 'save-current' });
  actions.execute({ type: 'choose-attachment' });
  actions.execute({ type: 'choose-image' });
  actions.execute({ type: 'delete-current' });
  assert.deepEqual(calls, ['save', 'attachment', 'image', 'delete']);
});

test('HTML export saves an active editor draft and exports its working version', () => {
  const { actions, calls, stored, setEditing } = createActions();
  setEditing(true);
  actions.execute({ type: 'export-html' });
  assert.deepEqual(calls, [
    ['draft', true],
    ['clean', '<p>当前正文</p>'],
    ['export', stored, 'clean:<p>当前正文</p>']
  ]);
});

test('HTML export uses the published snapshot in the ordinary reader and current content for drafts or previews', () => {
  const { actions, calls, stored, setPreviewing } = createActions();
  stored.publishedSnapshot = { title: '已发布', type: 'note', category: '开发', tags: [], body: '<p>发布正文</p>', source: '', updated: 3 };
  actions.exportHtml();
  assert.equal(calls[1][1].body, '<p>已发布正文</p>');
  assert.equal(calls[1][2], 'clean:<p>已发布正文</p>');

  calls.length = 0;
  setPreviewing(true);
  actions.exportHtml();
  assert.equal(calls[1][1], stored);
  assert.equal(calls[1][2], 'clean:<p>当前正文</p>');

  calls.length = 0;
  setPreviewing(false);
  stored.status = 'draft';
  actions.exportHtml();
  assert.equal(calls[1][1], stored);
});

test('HTML export reports a failed exporter and skips missing notes', async () => {
  const { actions, calls } = createActions({
    exportHTML: async () => { throw new Error('文件写入失败'); }
  });
  actions.exportHtml();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.at(-1), ['notify', '导出失败：文件写入失败']);

  calls.length = 0;
  const missing = createActions({ getCurrentNote: () => undefined });
  missing.actions.exportHtml();
  assert.deepEqual(missing.calls, []);
});
