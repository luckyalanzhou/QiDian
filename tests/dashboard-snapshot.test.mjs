import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardSnapshot } from '../src/features/dashboard/snapshot.ts';

function note(id, updated, { pinned = false, status = 'published' } = {}) {
  return {
    id,
    title: id,
    type: 'note',
    category: '开发',
    tags: [],
    body: '',
    source: '',
    created: updated,
    updated,
    pinned,
    status
  };
}

function snapshot(notes, bookmarks = [], overrides = {}) {
  return createDashboardSnapshot({
    notes,
    bookmarks,
    isDraft: item => item.status === 'draft',
    publishedView: item => ({ ...item, title: `published:${item.title}` }),
    noteCard: item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      typeName: '普通笔记',
      category: item.category,
      tags: [...item.tags],
      description: item.title,
      updatedLabel: String(item.updated),
      pinned: item.pinned
    }),
    isSafeUrl: value => /^https?:\/\//.test(value),
    ...overrides
  });
}

test('dashboard notes show published versions and feature pinned notes before recent notes', () => {
  const notes = [
    note('pinned-old', 1, { pinned: true }),
    note('pinned-next', 2, { pinned: true }),
    note('recent-1', 8),
    note('recent-2', 7),
    note('recent-3', 6),
    note('recent-4', 5),
    note('recent-5', 4),
    note('draft', 9, { status: 'draft' })
  ];

  const result = snapshot(notes);

  assert.equal(result.noteCount, 7);
  assert.deepEqual(result.notes.map(item => item.id), [
    'pinned-next', 'pinned-old', 'recent-1', 'recent-2', 'recent-3', 'recent-4'
  ]);
  assert.equal(result.notes[0].title, 'published:pinned-next');
  assert.ok(result.notes.every(item => item.id !== 'draft'));
  assert.deepEqual(notes.map(item => item.title), ['pinned-old', 'pinned-next', 'recent-1', 'recent-2', 'recent-3', 'recent-4', 'recent-5', 'draft']);
});

test('dashboard bookmark counts include nested links and preserve folder paths and expansion', () => {
  const bookmarks = [
    { id: 'root-link', kind: 'link', title: 'Root', url: 'https://example.com' },
    {
      id: 'team',
      kind: 'folder',
      title: 'Team',
      children: [
        { id: 'nested', kind: 'folder', title: 'Engineering', children: [
          { id: 'fav', kind: 'link', title: 'Docs', url: 'https://docs.example.com', pinned: true }
        ] },
        { id: 'unsafe', kind: 'link', title: 'Unsafe', url: 'javascript:alert(1)', pinned: true }
      ]
    },
    { id: 'empty', kind: 'folder', title: 'Empty', children: [] }
  ];
  const folderStates = { team: false, nested: true };

  const result = snapshot([], bookmarks, { folderStates, layout: 'double' });

  assert.equal(result.bookmarkCount, 3);
  assert.equal(result.folderCount, 2);
  assert.equal(result.layout, 'double');
  assert.deepEqual(result.groups.map(item => item.title), ['未分组', 'Team', 'Empty']);
  assert.equal(result.groups[0].defaultOpen, true);
  assert.equal(result.groups[1].defaultOpen, false);
  assert.equal(result.groups[1].children[0].defaultOpen, true);
  assert.deepEqual(result.pinnedLinks, [{
    id: 'fav', kind: 'link', title: 'Docs', url: 'https://docs.example.com', path: 'Team / Engineering'
  }]);
  assert.deepEqual(folderStates, { team: false, nested: true });
});

test('dashboard falls back to a single column and caps pinned links at eight', () => {
  const bookmarks = Array.from({ length: 10 }, (_, index) => ({
    id: `fav-${index}`,
    kind: 'link',
    title: `Favorite ${index}`,
    url: `https://example.com/${index}`,
    pinned: true
  }));

  const result = snapshot([], bookmarks, { layout: 'unexpected' });

  assert.equal(result.layout, 'single');
  assert.equal(result.pinnedLinks.length, 8);
  assert.equal(result.groups[0].defaultOpen, true);
});
