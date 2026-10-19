import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { createGlobalSearchSnapshot } from '../src/features/search/snapshot.ts';
import { useGlobalSearchStore } from '../src/features/search/store.ts';
import { useVaultStore } from '../src/features/vault/store.ts';

const note = (id, overrides = {}) => ({
  id,
  title: `笔记 ${id}`,
  type: 'note',
  category: '开发',
  tags: [],
  body: '<p>内容</p>',
  source: '',
  created: 1,
  updated: Number(id.replace(/\D/g, '')) || 1,
  pinned: false,
  ...overrides
});

const dependencies = {
  bodyText: body => body.replace(/<[^>]*>/g, ' '),
  typeLabel: id => id === 'note' ? '普通笔记' : '其他类型',
  formatDate: timestamp => `日期 ${timestamp}`,
  isSafeUrl: value => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); }
    catch { return false; }
  }
};

test('global search matches note metadata and body, traverses bookmark folders, and omits unsafe links', () => {
  const result = createGlobalSearchSnapshot({
    notes: [
      note('n1', { title: '共享知识', body: '<p>部署教程</p>', updated: 10 }),
      note('n2', { title: '另一条', category: '共享分类', updated: 20 }),
      note('n3', { tags: ['SHARED tag'], updated: 30 }),
      note('n4', { source: 'https://example.com/shared', updated: 40 }),
      note('n5', { body: '<p>SHARED body text</p>', updated: 50 })
    ],
    bookmarks: [
      { id: 'root', kind: 'folder', title: 'Shared group', children: [
        { id: 'safe', kind: 'link', title: '文章', url: 'https://example.com/article' },
        { id: 'unsafe', kind: 'link', title: '共享恶意网址', url: 'javascript:alert(1)' }
      ] },
      { id: 'top', kind: 'link', title: '共享首页', url: 'https://example.org/' }
    ],
    query: 'shared',
    ...dependencies
  });

  assert.deepEqual(result.notes.map(item => item.id), ['n5', 'n4', 'n3']);
  assert.deepEqual(result.bookmarks.map(item => item.id), ['safe']);
  assert.equal(result.notes[0].typeLabel, '普通笔记');
  assert.equal(result.notes[0].updatedLabel, '日期 50');
  assert.equal(result.bookmarks[0].path, 'Shared group');
  assert.equal(result.bookmarks[0].hostname, 'example.com');
});

test('global search keeps the newest twelve notes and bookmarks and includes all when query is blank', () => {
  const notes = Array.from({ length: 15 }, (_, index) => note(`n${index}`, { updated: index }));
  const bookmarks = Array.from({ length: 15 }, (_, index) => ({
    id: `b${index}`, kind: 'link', title: `链接 ${index}`, url: `https://example.com/${index}`
  }));
  const result = createGlobalSearchSnapshot({ notes, bookmarks, query: '', ...dependencies });

  assert.equal(result.notes.length, 12);
  assert.equal(result.notes[0].id, 'n14');
  assert.equal(result.notes.at(-1).id, 'n3');
  assert.equal(result.bookmarks.length, 12);
  assert.equal(result.bookmarks[0].id, 'b0', 'bookmark order follows its saved folder order');
});

test('global search store opens with a command query and reacts to vault replacement', () => {
  setActivePinia(createPinia());
  const vault = useVaultStore();
  const store = useGlobalSearchStore();
  store.configure(dependencies);
  vault.replace({ categories: [], notes: [note('n1', { title: '部署记录' })], bookmarks: [] });

  store.show('部署');
  assert.equal(store.open, true);
  assert.equal(store.query, '部署');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);

  store.setQuery('其他');
  assert.deepEqual(store.snapshot.notes, []);

  vault.replace({ categories: [], notes: [note('n2', { title: '其他内容' })], bookmarks: [] });
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n2']);
  store.close();
  assert.equal(store.open, false);
});
