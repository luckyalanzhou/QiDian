import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { JSDOM } from 'jsdom';
import { createGlobalSearchSnapshot } from '../../../src/features/search/snapshot.ts';
import { useGlobalSearchStore } from '../../../src/features/search/store.ts';
import { useVaultStore } from '../../../src/features/vault/store.ts';
import { createDraftContentTools } from '../../../src/features/notes/draft-content.ts';

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

const draftContent = createDraftContentTools({
  cleanHTML: html => String(html || ''),
  parseHTML: html => new JSDOM(html).window.document
});

const dependencies = {
  bodyText: body => body.replace(/<[^>]*>/g, ' '),
  hasDraftContent: draftContent.hasDraftContent,
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

test('global search keeps the newest twelve notes and bookmarks and reports when results continue', () => {
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
  assert.equal(result.hasMoreNotes, true);
  assert.equal(result.hasMoreBookmarks, true);

  const exactLimit = createGlobalSearchSnapshot({
    notes: notes.slice(0, 12),
    bookmarks: bookmarks.slice(0, 12),
    query: '',
    ...dependencies
  });
  assert.equal(exactLimit.hasMoreNotes, false, 'exactly twelve notes do not imply hidden matches');
  assert.equal(exactLimit.hasMoreBookmarks, false, 'exactly twelve bookmarks do not imply hidden matches');
});

test('global bookmark search stops traversing after twelve safe matches at the 10000-item limit', () => {
  const bookmarks = [{
    id: 'root',
    kind: 'folder',
    title: '常用',
    children: Array.from({ length: 10_000 }, (_, index) => ({
      id: `b${index}`,
      kind: 'link',
      title: index < 3 ? `其他链接 ${index}` : 'common result',
      url: index < 3 ? `https://example.com/other-${index}`
        : index < 5 ? `javascript:common-${index}`
          : `https://example.com/common-${index}`
    }))
  }];
  let safeUrlChecks = 0;
  const result = createGlobalSearchSnapshot({
    notes: [],
    bookmarks,
    query: 'common',
    ...dependencies,
    isSafeUrl: url => {
      safeUrlChecks += 1;
      return dependencies.isSafeUrl(url);
    }
  });

  assert.deepEqual(result.bookmarks.map(item => item.id), Array.from({ length: 12 }, (_, index) => `b${index + 5}`));
  assert.equal(safeUrlChecks, 18, 'search visits three non-matches, two unsafe matches, twelve results and one lookahead');
  assert.equal(result.hasMoreBookmarks, true, 'the lookahead reports that more matching bookmarks remain');
});

test('global search omits empty and untouched template drafts but keeps meaningful drafts and published notes', () => {
  const result = createGlobalSearchSnapshot({
    notes: [
      note('n1', { title: '', body: '<p></p>', status: 'draft' }),
      note('n2', { title: '', type: 'command', body: '<h2>用途</h2><p></p><h2>命令</h2><pre><code>在这里输入命令</code></pre>', status: 'draft' }),
      note('n3', { title: '可搜索草稿', body: '<p>有实际内容</p>', status: 'draft' }),
      note('n4', { title: '已发布笔记', status: 'published' })
    ],
    bookmarks: [],
    query: '',
    ...dependencies
  });

  assert.deepEqual(result.notes.map(item => item.id), ['n4', 'n3']);
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

test('global search store reuses its note text index across queries and rebuilds after vault mutations', () => {
  setActivePinia(createPinia());
  const vault = useVaultStore();
  const store = useGlobalSearchStore();
  let bodyTextCalls = 0;
  store.configure({
    ...dependencies,
    bodyText: body => {
      bodyTextCalls += 1;
      return body.replace(/<[^>]*>/g, ' ');
    }
  });
  vault.replace({ categories: [], notes: [
    note('n1', { body: '<p>alpha content</p>' }),
    note('n2', { body: '<p>beta content</p>' })
  ], bookmarks: [] });

  store.show('alpha');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);
  assert.equal(bodyTextCalls, 2);

  store.setQuery('beta');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n2']);
  assert.equal(bodyTextCalls, 2, 'changing the query reuses normalized note text');

  vault.mutate(value => { value.notes[0].body = '<p>changed content</p>'; });
  store.setQuery('changed');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);
  assert.equal(bodyTextCalls, 4, 'a vault generation change rebuilds the note index');
});

test('global search refreshes an open query after a remote vault replacement', () => {
  setActivePinia(createPinia());
  const vault = useVaultStore();
  const store = useGlobalSearchStore();
  store.configure(dependencies);
  vault.replace({ categories: [], notes: [note('n1', { body: '<p>remote-old-token</p>' })], bookmarks: [] });

  store.show('remote-old-token');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);

  vault.replace({ categories: [], notes: [note('n1', { body: '<p>remote-new-token</p>' })], bookmarks: [] });
  assert.deepEqual(store.snapshot.notes, [], 'the still-open query drops content replaced by a remote sync');

  store.setQuery('remote-new-token');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);
});

test('global search avoids building its note index for blank queries and invalidates it when dependencies change or the dialog closes', () => {
  setActivePinia(createPinia());
  const vault = useVaultStore();
  const store = useGlobalSearchStore();
  let firstConverterCalls = 0;
  let nextConverterCalls = 0;
  store.configure({
    ...dependencies,
    bodyText: body => { firstConverterCalls += 1; return body.replace(/<[^>]*>/g, ' '); }
  });
  vault.replace({ categories: [], notes: [note('n1', { body: '<p>searchable body</p>' })], bookmarks: [] });

  store.show();
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);
  assert.equal(firstConverterCalls, 0, 'blank queries do not need body text conversion');

  store.setQuery('searchable');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);
  assert.equal(firstConverterCalls, 1);

  store.configure({
    ...dependencies,
    bodyText: body => { nextConverterCalls += 1; return `${body} alternate`; }
  });
  store.setQuery('alternate');
  assert.deepEqual(store.snapshot.notes.map(item => item.id), ['n1']);
  assert.equal(nextConverterCalls, 1, 'changing search dependencies rebuilds the note index');

  store.close();
  store.show('no match');
  assert.deepEqual(store.snapshot.notes, []);
  assert.equal(nextConverterCalls, 2, 'closing the search dialog releases and rebuilds the cached index');
});
