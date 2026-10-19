import test from 'node:test';
import assert from 'node:assert/strict';
import { createNote, duplicateNote } from '../src/features/notes/note-actions.ts';

const vault = () => ({
  notes: [],
  noteTypes: [{ id: 'note', name: '普通' }, { id: 'command', name: '命令' }, { id: 'issue', name: '问题' }],
  categories: ['工作'],
  bookmarks: [],
  trash: []
});

test('new notes use the selected type, category and draft defaults', () => {
  const data = vault();
  const note = createNote(data, 'note', ' 工作 ', { now: () => 123, createId: () => 'n-123' });

  assert.equal(note.id, 'n-123');
  assert.equal(note.type, 'note');
  assert.equal(note.category, '工作');
  assert.equal(note.body, '');
  assert.equal(note.status, 'draft');
  assert.equal(note.created, 123);
  assert.equal(data.notes[0], note);
});

test('command and issue note types keep their starter content', () => {
  const data = vault();
  let id = 0;
  const options = { now: () => 100, createId: () => `n-${++id}` };
  assert.match(createNote(data, 'command', '', options).body, /<pre><code>在这里输入命令<\/code><\/pre>/);
  assert.match(createNote(data, 'issue', '', options).body, /<h2>排查过程<\/h2>/);
  assert.equal(data.notes[0].category, '未分类');
});

test('unknown note types fall back to the first configured type', () => {
  const data = vault();
  const note = createNote(data, 'missing', '未分类', { now: () => 1, createId: () => 'n-1' });
  assert.equal(note.type, 'note');
});

test('duplicate notes copy the displayed version and clear publication and pin state', () => {
  const data = vault();
  const original = {
    id: 'source', title: '已发布标题', type: 'note', category: '工作', tags: ['tag'], body: '<p>已发布内容</p>', source: '',
    created: 1, updated: 2, pinned: true, status: 'published', publishedAt: 2,
    publishedSnapshot: { title: '旧标题', body: '<p>旧内容</p>' }, _hasUnpublished: true
  };
  data.notes.push(original);
  const copy = duplicateNote(data, original, { now: () => 500, createId: () => 'copy' });

  assert.equal(copy.id, 'copy');
  assert.equal(copy.title, '已发布标题（副本）');
  assert.equal(copy.body, '<p>已发布内容</p>');
  assert.equal(copy.status, 'draft');
  assert.equal(copy.publishedAt, null);
  assert.equal(copy.pinned, false);
  assert.equal('publishedSnapshot' in copy, false);
  assert.equal('_hasUnpublished' in copy, false);
  assert.equal(original.title, '已发布标题');
  assert.equal(data.notes[0], copy);
});

test('note creation retries a colliding ID and fails cleanly when all candidates collide', () => {
  const data = vault();
  data.notes.push({ id: 'occupied' });
  let calls = 0;
  const created = createNote(data, 'note', '', {
    now: () => 10,
    createId: (_timestamp, attempt) => { calls += 1; return attempt ? 'available' : 'occupied'; }
  });
  assert.equal(created.id, 'available');
  assert.equal(calls, 2);

  assert.throws(() => createNote(data, 'note', '', { now: () => 11, createId: () => 'occupied' }), /编号冲突/);
});
