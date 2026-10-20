import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { createViteTestServer as createServer } from '../../support/vite-test-server.mjs';
import { fileURLToPath } from 'node:url';

test('bookmark store derives its snapshot from vault data and owns browser state', async t => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());

  const [{ useVaultStore }, { useBookmarkStore }, { useNavigationStore }] = await Promise.all([
    server.ssrLoadModule('/src/features/vault/store.ts'),
    server.ssrLoadModule('/src/features/bookmarks/store.ts'),
    server.ssrLoadModule('/src/features/navigation/store.ts')
  ]);
  const pinia = createPinia();
  const vault = useVaultStore(pinia);
  const bookmarks = useBookmarkStore(pinia);
  const navigation = useNavigationStore(pinia);
  vault.replace({ bookmarks: [], bookmarkFolderStates: {} });

  assert.equal(bookmarks.snapshot.bookmarkCount, 0);
  const dispatched = [];
  bookmarks.bindActions(action => { dispatched.push(action); });
  await bookmarks.dispatch({ type: 'toggle-pin', id: 'link-one' });
  assert.deepEqual(dispatched, [{ type: 'toggle-pin', id: 'link-one' }]);
  assert.equal(bookmarks.active, false);
  navigation.page = 'bookmarks';
  assert.equal(bookmarks.active, true);
  bookmarks.viewState.query = 'docs';
  vault.replace({ bookmarks: [
    { id: 'folder-one', kind: 'folder', title: 'Guides', children: [
      { id: 'link-one', kind: 'link', title: 'Docs', url: 'https://docs.example.test', pinned: true },
      { id: 'link-two', kind: 'link', title: 'Other', url: 'https://other.example.test' }
    ] }
  ], bookmarkFolderStates: { 'folder-one': true } });
  assert.equal(bookmarks.snapshot.bookmarkCount, 2);
  assert.equal(bookmarks.snapshot.folderCount, 1);
  assert.equal(bookmarks.snapshot.query, 'docs');
  assert.equal(bookmarks.snapshot.sections[0].links[0].title, 'Docs');
  assert.equal(bookmarks.snapshot.folders[0].expanded, true);
  bookmarks.viewState.organizing = false;
  bookmarks.viewState.selected.add('link-one');
  assert.equal(bookmarks.snapshot.selection.count, 1);
  assert.equal(bookmarks.snapshot.selection.visibleCount, 1);
  bookmarks.viewState.pinnedOnly = true;
  bookmarks.viewState.query = '';
  assert.deepEqual(bookmarks.snapshot.sections.flatMap(section => section.links).map(link => link.id), ['link-one']);

  await bookmarks.dispatch({ type: 'toggle-organizing' });
  await bookmarks.dispatch({ type: 'select-link', id: 'link-one', selected: true });
  await bookmarks.dispatch({ type: 'select-all', selected: true });
  assert.equal(bookmarks.snapshot.selection.count, 1);
  await bookmarks.dispatch({ type: 'search', query: '  docs  ' });
  assert.equal(bookmarks.snapshot.query, 'docs');
  assert.equal(bookmarks.snapshot.selection.count, 0);
  await bookmarks.dispatch({ type: 'select-folder', id: 'folder-one' });
  assert.equal(bookmarks.snapshot.selectedFolder, 'folder-one');
  assert.equal(bookmarks.snapshot.query, '');
  assert.equal(bookmarks.snapshot.pinnedOnly, false);
  assert.equal(bookmarks.snapshot.selection.count, 0);
  assert.deepEqual(dispatched, [{ type: 'toggle-pin', id: 'link-one' }]);

  bookmarks.viewState.query = 'stale';
  bookmarks.viewState.pinnedOnly = true;
  bookmarks.viewState.organizing = true;
  bookmarks.viewState.selected.add('link-one');
  bookmarks.syncPreferences();
  assert.equal(bookmarks.viewState.closed.has('folder-one'), false);
  assert.equal(bookmarks.viewState.directoryOpen, true);
  bookmarks.openFolder('folder-one', true);
  assert.equal(bookmarks.viewState.selectedFolder, 'folder-one');
  assert.equal(bookmarks.viewState.query, '');
  assert.equal(bookmarks.viewState.pinnedOnly, false);
  assert.equal(bookmarks.viewState.organizing, false);
  assert.equal(bookmarks.viewState.selected.size, 0);
  assert.equal(bookmarks.viewState.directoryOpen, false, 'opening a folder on mobile closes the directory pane');
  bookmarks.leave(320);
  assert.equal(bookmarks.viewState.organizing, false);
  assert.equal(bookmarks.viewState.selected.size, 0);
  assert.equal(bookmarks.resume(), 320, 're-entering the workspace restores the saved scroll position');
  assert.equal(bookmarks.viewState.directoryOpen, true, 'resume rehydrates the saved directory preference');
});
