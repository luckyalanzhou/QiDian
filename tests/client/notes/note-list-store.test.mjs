import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { createViteTestServer as createServer } from '../../support/vite-test-server.mjs';
import { fileURLToPath } from 'node:url';

const note = (overrides = {}) => ({
  id: 'note', title: '笔记', type: 'note', category: '网络', tags: [], body: '<p>内容</p>',
  source: '', created: 1, updated: 1, pinned: false, ...overrides
});

test('Pinia owns note-list filtering, headings, draft projection, and vault invalidation', async t => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());

  const [{ useVaultStore }, { useNavigationStore }, { useNoteListStore }] = await Promise.all([
    server.ssrLoadModule('/src/features/vault/store.ts'),
    server.ssrLoadModule('/src/features/navigation/store.ts'),
    server.ssrLoadModule('/src/features/notes/store.ts')
  ]);
  const pinia = createPinia();
  const vault = useVaultStore(pinia);
  const navigation = useNavigationStore(pinia);
  const noteList = useNoteListStore(pinia);
  let bodyTextCalls = 0;
  vault.replace({ noteTypes: [{ id: 'note', name: '普通笔记' }, { id: 'command', name: '命令速查' }], notes: [
    note({ id: 'router', title: '路由器设置', category: '网络', tags: ['WAN'], body: '<p>Network guide</p>', updated: 10, pinned: true }),
    note({ id: 'docker', title: '容器部署', type: 'command', category: '服务', body: '<p>Compose</p>', updated: 30 }),
    note({
      id: 'draft', title: '新的网络草稿', body: '<p>未发布内容</p>', updated: 40, status: 'draft',
      publishedSnapshot: { title: '已发布标题', type: 'note', category: '网络', tags: [], body: '<p>旧内容</p>', source: '', updated: 5 }
    }),
    note({
      id: 'pending', title: '工作副本', body: '<p>草稿关键词</p>', updated: 20,
      publishedSnapshot: { title: '已发布版本', type: 'note', category: '网络', tags: [], body: '<p>旧内容</p>', source: '', updated: 15 }
    }),
    note({ id: 'empty-draft', title: '', body: '', updated: 50, status: 'draft' })
  ] });

  noteList.configure({
    hasDraftContent: item => !!(item.title.trim() || item.body.trim()),
    bodyText: body => { bodyTextCalls++; return body.replace(/<[^>]*>/g, ' '); },
    noteCard: item => ({ id: item.id, title: item.title, type: item.type, typeName: item.type, tags: item.tags, description: item.body, updatedLabel: String(item.updated), pinned: item.pinned }),
    typeName: id => id === 'command' ? '命令速查' : '其他类型',
    displayTypeName: type => type.name
  });

  assert.equal(noteList.snapshot.resultCount, 3, 'published notes exclude drafts');
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['router', 'docker', 'pending'], 'pinned notes sort ahead of the remaining notes');
  assert.deepEqual(noteList.snapshot.noteTypes, [{ id: 'note', name: '普通笔记' }, { id: 'command', name: '命令速查' }]);

  navigation.typeFilter = 'command';
  navigation.active = 'pinned';
  assert.equal(noteList.snapshot.resultCount, 0);
  assert.equal(noteList.snapshot.emptyMessage, '命令速查类型下暂无重要收藏的笔记。');
  navigation.active = 'all';
  navigation.noteQuery = '不存在';
  assert.equal(noteList.snapshot.emptyMessage, '当前筛选条件下没有找到匹配的笔记。');
  assert.equal(bodyTextCalls, 1, 'the first search prepares its filtered candidate body once');
  navigation.typeFilter = 'all';
  assert.equal(noteList.snapshot.emptyMessage, '没有找到匹配的笔记。');
  navigation.noteQuery = '';

  navigation.noteQuery = 'network guide';
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['router'], 'search includes extracted body text');
  assert.equal(bodyTextCalls, 3, 'the next query reuses the prepared body text');
  navigation.noteQuery = 'compose';
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['docker']);
  assert.equal(bodyTextCalls, 3, 'typing another query does not reprocess note bodies');
  navigation.noteQuery = '旧内容';
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['pending'], 'published lists search the published snapshot');
  navigation.noteQuery = '';
  navigation.typeFilter = 'command';
  assert.equal(noteList.snapshot.heading, '命令速查');
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['docker']);

  navigation.typeFilter = 'all';
  navigation.active = 'recent';
  assert.equal(noteList.snapshot.heading, '最近编辑');
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['docker', 'pending', 'router'], 'recent notes sort by latest published update');

  navigation.active = 'drafts';
  assert.equal(noteList.snapshot.heading, '草稿箱');
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['draft', 'pending'], 'empty draft is excluded and editable versions are shown');
  assert.equal(noteList.snapshot.notes[0].title, '新的网络草稿');
  navigation.noteQuery = '草稿关键词';
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['pending'], 'draft searches use the editable body, not its published snapshot');
  assert.equal(bodyTextCalls, 5, 'switching to drafts prepares the draft view body once');
  navigation.noteQuery = '';

  navigation.active = '网络';
  assert.equal(noteList.snapshot.heading, '全部笔记', 'a stale category route falls back to all notes');
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['router', 'docker', 'pending'], 'note categories no longer filter the list');

  navigation.active = 'all';
  vault.mutate(value => value.notes.push(note({ id: 'new', title: '新笔记', type: 'command', body: '<p>新增正文</p>', updated: 60 })));
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['router', 'new', 'docker', 'pending'], 'vault generation invalidates the computed list');
  navigation.noteQuery = '新增正文';
  assert.deepEqual(noteList.snapshot.notes.map(item => item.id), ['new'], 'a vault update is searchable immediately');
  assert.equal(bodyTextCalls, 9, 'a new vault generation rebuilds the search text cache');
  assert.equal(noteList.active, false, 'the list remains inactive outside its route');
  navigation.page = 'home';
  assert.equal(noteList.active, true);
});
