import test from 'node:test';
import assert from 'node:assert/strict';
import { moveBookmark, toggleBookmarkPin } from '../../../src/features/bookmarks/operations.ts';

function items() {
  return [
    { id: 'link-a', kind: 'link', title: 'A', url: 'https://a.example' },
    { id: 'folder', kind: 'folder', title: 'Folder', children: [{ id: 'nested', kind: 'link', title: 'Nested', url: 'https://nested.example' }] },
    { id: 'link-b', kind: 'link', title: 'B', url: 'https://b.example' }
  ];
}

test('bookmark pin operation clones the tree and toggles only the requested nested link', () => {
  const original = items();
  const updated = toggleBookmarkPin(original, 'nested');

  assert.notEqual(updated, original);
  assert.equal(updated[1].children[0].pinned, true);
  assert.equal(original[1].children[0].pinned, undefined);
  assert.equal(toggleBookmarkPin(updated, 'nested')[1].children[0].pinned, undefined);
  assert.equal(toggleBookmarkPin(original, 'folder'), null);
  assert.equal(toggleBookmarkPin(original, 'missing'), null);
});

test('bookmark move operation reorders same-kind siblings without mutating the source tree', () => {
  const original = items();
  const updated = moveBookmark(original, 'link-b', 'up');

  assert.deepEqual(updated.map(item => item.id), ['link-b', 'folder', 'link-a']);
  assert.deepEqual(original.map(item => item.id), ['link-a', 'folder', 'link-b']);
  assert.equal(moveBookmark(original, 'link-a', 'up'), null);
  assert.equal(moveBookmark(original, 'missing', 'down'), null);
});
