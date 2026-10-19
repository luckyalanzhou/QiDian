import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteType, deleteNoteType, renameNoteType } from '../src/features/notes/type-actions.ts';

function note(id, type, overrides = {}) {
  return {
    id, title: id, type, category: '开发', tags: [], body: '', source: '', created: 1, updated: 2,
    pinned: false, ...overrides
  };
}

function vault(overrides = {}) {
  return {
    categories: [], noteTypes: [{ id: 'note', name: '普通' }, { id: 'command', name: '命令' }],
    notes: [], trash: [], ...overrides
  };
}

test('create and rename note types validate names and preserve IDs', () => {
  const data = vault();
  const created = createNoteType(data, '  故障排查  ', () => 'custom-test');
  assert.deepEqual(created, { id: 'custom-test', name: '故障排查' });
  assert.deepEqual(renameNoteType(data, created.id, '排障笔记'), { id: 'custom-test', name: '排障笔记' });
  assert.throws(() => createNoteType(data, '命令', () => 'custom-other'), /已有同名/);
  assert.throws(() => renameNoteType(data, 'custom-test', '普通'), /已有同名/);
  assert.throws(() => createNoteType(data, '   ', () => 'custom-empty'), /请输入类型名称/);
  assert.throws(() => renameNoteType(data, 'missing', '新类型'), /类型不存在/);
});

test('note type creation enforces the cap and avoids duplicate generated IDs', () => {
  const data = vault({ noteTypes: Array.from({ length: 50 }, (_, index) => ({ id: `type-${index}`, name: `类型${index}` })) });
  assert.throws(() => createNoteType(data, '新类型', () => 'unused'), /最多支持 50/);
  const smaller = vault();
  let attempts = 0;
  const created = createNoteType(smaller, '新增', () => (++attempts === 1 ? 'note' : 'custom-unique'));
  assert.equal(created.id, 'custom-unique');
  assert.equal(attempts, 2);
});

test('deleting a type migrates active, published snapshot and trashed notes but leaves bookmarks intact', () => {
  const active = note('active', 'command', { publishedSnapshot: { title: '旧版', type: 'command', category: '开发', tags: [], body: '', source: '', updated: 1 } });
  const trashed = note('trashed', 'command');
  const data = vault({
    notes: [active],
    trash: [
      { id: 'note-trash', kind: 'note', deletedAt: 1, item: trashed, index: 0 },
      { id: 'bookmark-trash', kind: 'bookmark', deletedAt: 1, item: { id: 'bookmark', kind: 'link', title: '网址', url: 'https://example.com' }, index: 0 }
    ]
  });

  assert.deepEqual(deleteNoteType(data, 'command', 'note'), { activeCount: 1, trashCount: 1 });
  assert.deepEqual(data.noteTypes, [{ id: 'note', name: '普通' }]);
  assert.equal(data.notes[0].type, 'note');
  assert.equal(data.notes[0].publishedSnapshot.type, 'note');
  assert.equal(data.trash[0].item.type, 'note');
  assert.equal(data.trash[1].item.url, 'https://example.com');
});

test('deleting the last custom type can create its selected fallback and rejects other missing targets', () => {
  const data = vault({ noteTypes: [{ id: 'custom-last', name: '最后类型' }], notes: [note('one', 'custom-last')] });
  assert.throws(() => deleteNoteType(data, 'custom-last', 'missing', { id: 'note', name: '普通' }), /请选择要转移/);
  assert.deepEqual(deleteNoteType(data, 'custom-last', 'note', { id: 'note', name: '普通' }), { activeCount: 1, trashCount: 0 });
  assert.deepEqual(data.noteTypes, [{ id: 'note', name: '普通' }]);
  assert.equal(data.notes[0].type, 'note');
});
