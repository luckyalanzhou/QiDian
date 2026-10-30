import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRemoteEditorRefresh } from '../../../src/features/editor/remote-refresh.ts';

function harness({ editorHTML = '<p>旧正文</p>', selection = 4, documentSize = 40, draft = null, baseline = null } = {}) {
  const dom = new JSDOM('<input id="editTitle"><input id="editType"><input id="editTags"><input id="editSource"><input id="editCategory" type="hidden">');
  const calls = [];
  const conflicts = [];
  const editor = {
    html: editorHTML,
    state: { selection: { from: selection }, doc: { content: { size: documentSize } } },
    getHTML() { return this.html; },
    commands: {
      setContent(html, options) { calls.push(['set-content', html, options]); editor.html = html; },
      setTextSelection(position) { calls.push(['set-selection', position]); }
    }
  };
  const controller = createRemoteEditorRefresh({
    document: dom.window.document,
    getEditingDraft: () => draft,
    getBaseline: () => typeof baseline === 'string' ? baseline : null,
    setEditingDraft: note => { draft = note; },
    setBaseline: value => { baseline = value; },
    snapshot: note => JSON.stringify({
      title: note.title || '', type: note.type || 'note', category: note.category || '未分类',
      tags: note.tags || [], source: note.source || '', body: note.body || ''
    }),
    cleanBody: body => body.trim(),
    getEditor: () => editor,
    syncToolbarState: () => calls.push(['sync-toolbar']),
    onConflict: conflict => conflicts.push(conflict)
  });
  return { dom, controller, calls, conflicts, editor, getDraft: () => draft, getBaseline: () => baseline };
}

test('remote editor refresh updates visible fields and preserves hidden legacy category data', () => {
  const h = harness();
  const remote = { id: 'note-1', title: '远端标题', type: 'command', category: '网络', tags: ['OpenWrt', 'DNS'], source: 'https://example.com', body: '<p>远端正文</p>', updated: 8 };

  h.controller.refresh(remote, false);

  const document = h.dom.window.document;
  assert.equal(document.querySelector('#editTitle').value, '远端标题');
  assert.equal(document.querySelector('#editType').value, 'command');
  assert.equal(document.querySelector('#editTags').value, 'OpenWrt, DNS');
  assert.equal(document.querySelector('#editSource').value, 'https://example.com');
  assert.equal(document.querySelector('#editCategory').value, '网络');
  assert.equal(document.querySelector('#editCategory').type, 'hidden');
  assert.equal(h.getDraft().category, '网络');
  assert.notEqual(h.getDraft(), remote, 'the editor receives an isolated note snapshot');
  assert.equal(h.getBaseline(), JSON.stringify({
    title: remote.title, type: remote.type, category: remote.category, tags: remote.tags, source: remote.source, body: remote.body
  }));
  assert.deepEqual(h.calls, [
    ['set-content', '<p>远端正文</p>', { emitUpdate: false }],
    ['set-selection', 4],
    ['sync-toolbar']
  ]);
  h.dom.window.close();
});

test('remote refresh preserves dirty local fields and editor content', () => {
  const baselineNote = { id: 'note-1', title: '原始标题', type: 'note', category: '原始分类', tags: ['原始标签'], source: '', body: '<p>原始正文</p>' };
  const localDraft = { ...baselineNote, title: '本地未保存标题', body: '<p>本地未保存正文</p>' };
  const mergedNote = { ...baselineNote, tags: ['远端新标签'], updated: 8 };
  const h = harness({ editorHTML: '<p>本地未保存正文</p>', draft: localDraft, baseline: JSON.stringify(baselineNote) });
  h.dom.window.document.querySelector('#editTitle').value = localDraft.title;
  h.dom.window.document.querySelector('#editType').value = localDraft.type;
  h.dom.window.document.querySelector('#editTags').value = localDraft.tags.join(', ');
  h.dom.window.document.querySelector('#editCategory').value = localDraft.category;
  h.controller.refresh(mergedNote, true);

  assert.equal(h.getDraft().title, localDraft.title, 'a locally changed title stays visible');
  assert.equal(h.getDraft().body, localDraft.body, 'the editor keeps its local body');
  assert.equal(h.conflicts.length, 0, 'independent remote field changes merge without blocking');
  assert.deepEqual(h.getDraft().tags, mergedNote.tags, 'a remote-only tag update is incorporated');
  assert.equal(h.getBaseline(), JSON.stringify({
    title: mergedNote.title, type: mergedNote.type, category: mergedNote.category,
    tags: mergedNote.tags, source: mergedNote.source, body: mergedNote.body
  }), 'future edits compare against the merged snapshot');
  assert.equal(h.dom.window.document.querySelector('#editTitle').value, localDraft.title);
  assert.equal(h.dom.window.document.querySelector('#editTags').value, '远端新标签');
  assert.equal(h.editor.getHTML(), localDraft.body);
  assert.deepEqual(h.calls, [], 'unchanged merged body preserves selection and toolbar state');
  h.dom.window.close();
});

test('identical remote editor content does not reset selection or toolbar state', () => {
  const h = harness({ editorHTML: '<p>相同</p>' });
  h.controller.refresh({ id: 'note-1', body: '<p>相同</p>' }, false);
  assert.deepEqual(h.calls, []);
  h.dom.window.close();
});

test('overlapping local and remote editor changes keep the original baseline and report both versions', () => {
  const baselineNote = { id: 'note-1', title: '标题', type: 'note', category: '未分类', tags: [], source: '', body: '<p>原文</p>' };
  const baseline = JSON.stringify(baselineNote);
  const localDraft = { ...baselineNote, body: '<p>本地正文</p>' };
  const remote = { ...baselineNote, body: '<p>已保存的远端正文</p>', updated: 9 };
  const h = harness({ editorHTML: localDraft.body, draft: localDraft, baseline });

  h.controller.refresh(remote, true);

  assert.equal(h.conflicts.length, 1, 'same-field edits must enter conflict recovery');
  assert.deepEqual(h.conflicts[0], {
    base: { ...baselineNote, updated: 9 },
    local: { ...localDraft, updated: 9 },
    remote
  });
  assert.equal(h.getBaseline(), baseline, 'do not rebase local edits onto the newer remote value');
  assert.equal(h.getDraft().body, localDraft.body, 'keep the local editor content available');
  assert.equal(h.editor.getHTML(), localDraft.body);
  h.dom.window.close();
});
