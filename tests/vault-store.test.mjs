import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { createViteTestServer as createServer } from './vite-test-server.mjs';
import { fileURLToPath } from 'node:url';

test('Pinia owns the active vault snapshot and invalidates dashboard projections through vault generations', async t => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { useVaultStore } = await server.ssrLoadModule('/src/features/vault/store.ts');
  const { useDashboardStore } = await server.ssrLoadModule('/src/features/dashboard/store.ts');
  const { useNavigationStore } = await server.ssrLoadModule('/src/features/navigation/store.ts');
  const pinia = createPinia();
  const store = useVaultStore(pinia);
  const dashboard = useDashboardStore(pinia);
  const navigation = useNavigationStore(pinia);

  assert.equal(store.ready, false);
  assert.equal(dashboard.active, false);
  const source = { categories: [], notes: [{ id: 'note-1', title: '第一篇', updated: 1, status: 'published' }], bookmarks: [], theme: 'light', pasteMode: 'rich' };
  assert.strictEqual(store.replace(source), source);
  assert.strictEqual(store.value, source);
  assert.equal(store.ready, true);
  assert.equal(store.generation, 1);
  assert.equal(dashboard.active, true, 'dashboard activity follows the active route once the vault is ready');
  navigation.page = 'home';
  assert.equal(dashboard.active, false, 'dashboard deactivates as soon as navigation leaves it');
  dashboard.configure({
    isDraft: note => note.status === 'draft',
    publishedView: note => note,
    noteCard: note => ({ id: note.id, title: note.title, type: 'note', typeName: '普通笔记', category: '', tags: [], description: '', updatedLabel: String(note.updated), pinned: false }),
    isSafeUrl: url => /^https?:\/\//.test(url)
  });
  assert.equal(dashboard.snapshot.noteCount, 1);

  const dashboardActions = [];
  dashboard.bindActions({
    saveFolder: (id, open) => dashboardActions.push(['saveFolder', id, open]),
    setLayout: layout => dashboardActions.push(['setLayout', layout]),
    setAllFolders: (ids, open) => dashboardActions.push(['setAllFolders', [...ids], open])
  });
  dashboard.saveFolder('folder-1', true);
  dashboard.setLayout('double');
  dashboard.setAllFolders(['folder-1', 'folder-2'], false);
  assert.deepEqual(dashboardActions, [
    ['saveFolder', 'folder-1', true],
    ['setLayout', 'double'],
    ['setAllFolders', ['folder-1', 'folder-2'], false]
  ]);

  const copy = store.snapshot();
  assert.deepEqual(copy, source);
  assert.notStrictEqual(copy, source);
  copy.categories.push('本地快照');
  assert.deepEqual(source.categories, []);

  const result = store.mutate(vault => {
    vault.notes.push({ id: 'note-2', title: '第二篇', updated: 2, status: 'published' });
    return vault.notes.length;
  });
  assert.equal(result, 2);
  assert.equal(store.value.notes.length, 2);
  assert.equal(store.generation, 2);
  assert.equal(dashboard.snapshot.noteCount, 2, 'vault generation invalidates the dashboard projection derived inside the feature store');

  assert.throws(() => store.mutate(vault => {
    vault.notes.push({ id: 'note-partial', title: '部分写入', updated: 3, status: 'published' });
    throw new Error('操作失败');
  }), /操作失败/);
  assert.deepEqual(store.value.notes.map(note => note.id), ['note-1', 'note-2', 'note-partial']);
  assert.equal(store.generation, 3, 'partial writes still invalidate snapshots when a mutation throws');

  const replacement = { categories: ['新分类'], notes: [], bookmarks: [] };
  store.replace(replacement);
  assert.strictEqual(store.value, replacement);
  assert.equal(store.generation, 4);
});
