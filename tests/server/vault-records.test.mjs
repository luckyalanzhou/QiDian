import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultToRecords, vaultFromRecords } from '../../server/application/vault-records.mjs';

test('vault records preserve note tags, published tags, bookmark hierarchy, order and preferences', () => {
  const vault = {
    categories: ['网络', '开发'],
    noteTypes: [{ id: 'note', name: '普通笔记' }, { id: 'command', name: '命令速查' }],
    notes: [
      { id: 'n2', title: '第二篇', type: 'note', category: '网络', tags: ['网络'], body: '<p>正文</p>', source: '', created: 2, updated: 4, pinned: false },
      { id: 'n1', title: '第一篇', type: 'note', category: '开发', tags: ['A', 'B'], body: '<p>正文</p>', source: 'https://example.com', created: 1, updated: 3, pinned: true,
        publishedSnapshot: { title: '已发布', type: 'note', category: '开发', tags: ['published'], body: '<p>旧正文</p>', source: '', updated: 2 } }
    ],
    bookmarks: [
      { id: 'folder', kind: 'folder', title: '工具', children: [
        { id: 'link-2', kind: 'link', title: '第二个', url: 'https://example.com/2' },
        { id: 'link-1', kind: 'link', title: '第一个', url: 'https://example.com/1', pinned: true }
      ] },
      { id: 'root-link', kind: 'link', title: '首页', url: 'https://example.org' }
    ],
    trash: [{ id: 'trash-1', kind: 'note', deletedAt: 5, index: 0, item: { id: 'old', title: '回收笔记', type: 'note', category: '', tags: ['old-tag'], body: 'body', source: '', created: 1, updated: 1, pinned: false } }],
    theme: 'dark', pasteMode: 'plain', noteTypesExpanded: false, dashboardBookmarkLayout: 'double',
    dashboardBookmarkFolders: { folder: true }, bookmarkDirectoryOpen: false, bookmarkFolderStates: { folder: false }
  };

  const records = vaultToRecords(vault);
  assert.equal(records.notes[0].data.tags, undefined);
  assert.equal(records.notes[1].data.publishedSnapshot.tags, undefined);
  assert.deepEqual(records.tags.filter(row => row.noteId === 'n1').map(({ scope, tag, position }) => ({ scope, tag, position })), [
    { scope: 'current', tag: 'A', position: 0 },
    { scope: 'current', tag: 'B', position: 1 },
    { scope: 'published', tag: 'published', position: 0 }
  ]);
  assert.equal(records.bookmarks.length, 4);
  assert.deepEqual(vaultFromRecords(records), vault);
});

test('bookmark reconstruction rejects an orphaned or non-folder parent', () => {
  assert.throws(() => vaultFromRecords({ bookmarks: [
    { id: 'child', kind: 'link', parentId: 'missing', position: 0, data: { id: 'child', kind: 'link', title: '子项', url: 'https://example.com' } }
  ] }), /书签分组引用无效/);
});
