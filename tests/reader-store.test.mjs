import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPinia } from 'pinia';
import { createViteTestServer as createServer } from './vite-test-server.mjs';
import { fileURLToPath } from 'node:url';
import { isDraftNote, needsPublish, publishedNoteView } from '../src/features/notes/selectors.ts';

test('Pinia reader projection follows the selected published version, preview mode, vault updates and route state', async t => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());

  const [{ useVaultStore }, { useNavigationStore }, { useReaderStore }] = await Promise.all([
    server.ssrLoadModule('/src/features/vault/store.ts'),
    server.ssrLoadModule('/src/features/navigation/store.ts'),
    server.ssrLoadModule('/src/features/reader/store.ts')
  ]);
  const pinia = createPinia();
  const vault = useVaultStore(pinia);
  const navigation = useNavigationStore(pinia);
  const reader = useReaderStore(pinia);
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  t.after(() => dom.window.close());
  reader.configure({
    document: dom.window.document,
    readableNoteBody: body => ({ html: String(body || '') }),
    typeLabel: () => '普通笔记',
    formatDate: timestamp => `date-${timestamp}`,
    safeUrl: value => /^https?:\/\//.test(value),
    isDraft: isDraftNote,
    needsPublish,
    publishedView: publishedNoteView
  });

  vault.replace({ notes: [{
    id: 'one', title: '编辑中的标题', type: 'note', category: '网络', tags: ['指南'],
    body: '<h2>编辑章节</h2><p>本地内容</p>', source: 'https://example.test/source', created: 1, updated: 4, pinned: true,
    status: 'published', publishedSnapshot: {
      title: '发布版本', type: 'note', category: '网络', tags: ['已发布'],
      body: '<h2>发布章节</h2><p>公开内容</p>', source: '', updated: 2
    }
  }] });

  assert.equal(reader.active, false);
  assert.equal(reader.snapshot.noteId, '');

  navigation.page = 'note';
  navigation.noteId = 'one';
  assert.equal(reader.active, true);
  assert.equal(reader.snapshot.title, '发布版本');
  assert.match(reader.snapshot.bodyHtml, /公开内容/);
  assert.deepEqual(reader.snapshot.tags, ['已发布']);
  assert.equal(reader.snapshot.updatedLabel, 'date-2');
  assert.equal(reader.snapshot.showPendingChanges, true);
  navigation.previewing = true;
  assert.equal(reader.snapshot.title, '编辑中的标题');
  assert.equal(reader.snapshot.bodyHtml.includes('本地内容'), true);
  assert.equal(reader.snapshot.working, true);
  assert.equal(reader.snapshot.editLabel, '继续编辑');

  vault.mutate(value => { value.notes[0].title = '最新编辑'; });
  assert.equal(reader.snapshot.title, '最新编辑');

  navigation.editing = true;
  assert.equal(reader.active, false, 'reader hides while the editor owns the note route');
});
