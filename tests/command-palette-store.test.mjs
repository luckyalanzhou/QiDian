import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useCommandPaletteStore } from '../src/features/command-palette/store.ts';

test('command palette opens, resets its query, and toggles closed', () => {
  setActivePinia(createPinia());
  const store = useCommandPaletteStore();
  store.setQuery('书签');
  store.setActiveIndex(2, 5);

  store.toggle();
  assert.equal(store.open, true);
  assert.equal(store.query, '');
  assert.equal(store.activeIndex, 0);

  store.toggle();
  assert.equal(store.open, false);
});

test('command palette wraps active item navigation and handles empty results', () => {
  setActivePinia(createPinia());
  const store = useCommandPaletteStore();
  store.setActiveIndex(-1, 3);
  assert.equal(store.activeIndex, 2);
  store.setActiveIndex(3, 3);
  assert.equal(store.activeIndex, 0);
  store.setActiveIndex(4, 0);
  assert.equal(store.activeIndex, 0);
});
