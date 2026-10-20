import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorSessionSnapshot, normalizeEditorPasteMode } from '../src/features/editor/session-snapshot.ts';

test('editor session snapshot maps note form fields and copies lookup options', () => {
  const noteTypes = [{ id: 'note', name: '普通' }, { id: 'command', name: '命令' }];
  const categories = ['Linux', 'Docker'];
  const note = {
    id: 'note-1', title: '部署记录', type: 'command', category: 'Docker',
    tags: ['Compose', 'OpenWrt'], source: 'https://example.org', body: '', created: 1, updated: 2, pinned: false
  };
  const snapshot = createEditorSessionSnapshot({
    displayTypeName: type => `${type.name}类型`,
    isDraft: current => current.id === 'note-1'
  });

  assert.deepEqual(snapshot({ note, noteTypes, categories, pasteMode: 'markdown' }), {
    noteId: 'note-1', title: '部署记录', type: 'command', category: 'Docker',
    tags: 'Compose, OpenWrt', source: 'https://example.org',
    noteTypes: [{ id: 'note', label: '普通类型' }, { id: 'command', label: '命令类型' }],
    categories: ['Linux', 'Docker'], publishLabel: '发布笔记', pasteMode: 'markdown'
  });

  assert.notEqual(snapshot({ note, noteTypes, categories, pasteMode: 'rich' }).categories, categories);
  assert.notEqual(snapshot({ note, noteTypes, categories, pasteMode: 'rich' }).noteTypes, noteTypes);
});

test('editor session snapshot keeps empty form defaults and published action label', () => {
  const snapshot = createEditorSessionSnapshot({ displayTypeName: type => type.name, isDraft: () => false });
  const note = { id: 'note-2', title: '', type: 'note', category: '', tags: [], source: '', body: '', created: 1, updated: 1, pinned: false };

  assert.deepEqual(snapshot({ note, noteTypes: [], categories: [], pasteMode: 'invalid' }), {
    noteId: 'note-2', title: '', type: 'note', category: '未分类', tags: '', source: '',
    noteTypes: [], categories: [], publishLabel: '保存笔记', pasteMode: 'rich'
  });
});

test('editor paste mode accepts supported values and defaults unsupported input', () => {
  for (const value of ['rich', 'match', 'markdown', 'plain']) assert.equal(normalizeEditorPasteMode(value), value);
  for (const value of [null, undefined, 'html', '', 1]) assert.equal(normalizeEditorPasteMode(value), 'rich');
});
