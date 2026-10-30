import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DEFAULT_NOTE_TYPES, validateVault } from '../../../shared/vault-validation.js';
import { restoreTrashEntry } from '../../../src/domain/trash-data.js';
import { bookmarksHTML, mergeBookmarks, parseBookmarks } from '../../../src/features/bookmarks/data.js';
import { createBookmarkMutationActions } from '../../../src/features/bookmarks/mutation-actions.ts';
import { createVaultMutation } from '../../../src/features/vault/mutation.ts';

const BookmarkParser = new JSDOM('').window.DOMParser;

function fixture({ saveError = '', fetchMetadata, uploadAsset } = {}) {
  let vault = validateVault({
    categories: [],
    noteTypes: DEFAULT_NOTE_TYPES,
    notes: [],
    bookmarks: [
      { id: 'link-a', kind: 'link', title: 'A', url: 'https://a.example' },
      { id: 'link-b', kind: 'link', title: 'B', url: 'https://b.example' }
    ],
    trash: [],
    bookmarkFolderStates: {}
  });
  const saves = [];
  const notices = [];
  let editor = null;
  let deleteDialog = null;
  let bulkDialog = null;
  let importDialog = null;
  let resetsAfterClear = 0;
  const reconciledDeletes = [];
  const downloads = [];
  const viewState = { closed: new Set(), selected: new Set(), query: '', organizing: false, selectedFolder: '', pinnedOnly: false, directoryOpen: true };
  const mutation = createVaultMutation({
    getVault: () => vault,
    replaceVault: value => { vault = value; return value; },
    save: async () => {
      if (saveError) throw new Error(saveError);
      saves.push(structuredClone(vault));
    }
  });
  const actions = createBookmarkMutationActions({
    getBookmarks: () => vault.bookmarks,
    getVault: () => vault,
    getEditor: () => editor,
    getDeleteDialog: () => deleteDialog,
    getBulkDialog: () => bulkDialog,
    getImportDialog: () => importDialog,
    getSelectedVisibleIds: () => [...viewState.selected],
    viewState,
    openEditor: draft => { editor = {
      ...draft, description: draft.description || '', initialTitle: draft.title,
      initialDescription: draft.description || '', titleEdited: false, descriptionEdited: false,
      metadataFetchedFor: '', pendingFavicon: null, metadataLoading: false, metadataError: '', error: '', saving: false
    }; },
    closeEditor: () => { editor = null; },
    openDeleteDialog: request => { deleteDialog = { request, mode: 'keep', error: '', saving: false }; },
    closeDeleteDialog: () => { if (!deleteDialog?.saving) deleteDialog = null; },
    resetAfterClear: () => { resetsAfterClear++; },
    reconcileAfterDelete: (ids, parentId) => reconciledDeletes.push({ ids, parentId }),
    clearSelection: ids => ids.forEach(id => viewState.selected.delete(id)),
    openBulkDialog: (mode, ids) => { bulkDialog = { mode, ids: [...ids], targetId: '', error: '', saving: false }; },
    closeBulkDialog: () => { if (!bulkDialog?.saving) bulkDialog = null; },
    openImportDialog: draft => { importDialog = { ...draft, error: '', saving: false }; },
    closeImportDialog: () => { if (!importDialog?.saving) importDialog = null; },
    download: (blob, name) => downloads.push({ blob, name }),
    parseImport: html => parseBookmarks(html, BookmarkParser),
    mergeImport: mergeBookmarks,
    serializeExport: bookmarksHTML,
    setEditorError: message => { if (editor) editor.error = message; },
    mutation,
    notify: message => notices.push(message),
    ...(fetchMetadata ? { fetchMetadata } : {}),
    ...(uploadAsset ? { uploadAsset } : {})
  });
  return { actions, getVault: () => vault, getEditor: () => editor, getDeleteDialog: () => deleteDialog, getBulkDialog: () => bulkDialog, getImportDialog: () => importDialog, viewState, saves, notices, downloads, resetsAfterClear: () => resetsAfterClear, reconciledDeletes };
}

test('bookmark Vue mutations use the Vault transaction and persist only valid changes', async () => {
  const state = fixture();

  assert.equal(await state.actions.execute({ type: 'toggle-pin', id: 'link-a' }), true);
  assert.equal(state.getVault().bookmarks[0].pinned, true);
  assert.equal(state.saves[0].bookmarks[0].pinned, true);

  assert.equal(await state.actions.execute({ type: 'move', id: 'link-b', direction: 'up' }), true);
  assert.deepEqual(state.getVault().bookmarks.map(item => item.id), ['link-b', 'link-a']);
  assert.deepEqual(state.saves[1].bookmarks.map(item => item.id), ['link-b', 'link-a']);

  assert.equal(await state.actions.execute({ type: 'toggle-pin', id: 'missing' }), true);
  assert.equal(await state.actions.execute({ type: 'search', query: 'docs' }), false);
  assert.equal(state.saves.length, 2);
  assert.deepEqual(state.notices, []);
});

test('failed bookmark persistence rolls back the Vault and reports the write error', async () => {
  const state = fixture({ saveError: 'SQLite 写入失败' });

  assert.equal(await state.actions.execute({ type: 'toggle-pin', id: 'link-a' }), true);
  assert.equal(state.getVault().bookmarks[0].pinned, undefined);
  assert.deepEqual(state.notices, ['SQLite 写入失败']);
  assert.equal(state.saves.length, 0);
});

test('bookmark folder and directory disclosure preferences persist through the Vault transaction', async () => {
  const state = fixture();
  state.getVault().bookmarks.push({ id: 'folder-a', kind: 'folder', title: '资料', children: [
    { id: 'folder-b', kind: 'folder', title: '子分组', children: [] }
  ] });
  state.getVault().bookmarkFolderStates = { 'folder-a': true };

  await state.actions.execute({ type: 'toggle-folder', id: 'folder-a' });
  await state.actions.execute({ type: 'toggle-directory', open: false });

  assert.equal(state.getVault().bookmarkFolderStates['folder-a'], false);
  assert.equal(state.getVault().bookmarkDirectoryOpen, false);
  assert.equal(state.viewState.directoryOpen, false);
  assert.equal(state.saves.length, 2);
  assert.deepEqual(state.notices, []);
});

test('failed disclosure preference writes restore the prior view and Vault state', async () => {
  const state = fixture({ saveError: 'SQLite 写入失败' });
  state.getVault().bookmarks.push({ id: 'folder-a', kind: 'folder', title: '资料', children: [] });
  await state.actions.execute({ type: 'toggle-directory', open: false });
  await state.actions.execute({ type: 'toggle-folder', id: 'folder-a' });

  assert.equal(state.viewState.directoryOpen, true);
  assert.equal(state.getVault().bookmarkDirectoryOpen, null);
  assert.deepEqual(state.getVault().bookmarkFolderStates, {});
  assert.deepEqual(state.notices, ['SQLite 写入失败', 'SQLite 写入失败']);
});

test('bookmark forms add and edit links under selected folders through the Vault transaction', async () => {
  const state = fixture();
  state.getVault().bookmarks.push({ id: 'folder-a', kind: 'folder', title: '资料', children: [] });

  assert.equal(await state.actions.execute({ type: 'add-link', parentId: 'folder-a' }), true);
  state.getEditor().title = '参考文档';
  state.getEditor().url = 'https://docs.example.test/start';
  assert.equal(await state.actions.execute({ type: 'save-editor' }), true);
  const added = state.getVault().bookmarks.find(item => item.id === 'folder-a').children[0];
  assert.deepEqual({ title: added.title, url: added.url }, { title: '参考文档', url: 'https://docs.example.test/start' });
  assert.equal(state.getEditor(), null);

  await state.actions.execute({ type: 'edit', id: added.id });
  state.getEditor().title = '新版文档';
  state.getEditor().url = 'https://docs.example.test/v2';
  state.getEditor().parentId = '';
  await state.actions.execute({ type: 'save-editor' });
  assert.deepEqual(state.getVault().bookmarks.find(item => item.id === added.id), {
    id: added.id, kind: 'link', title: '新版文档', url: 'https://docs.example.test/v2'
  });
  assert.equal(state.getVault().bookmarks.find(item => item.id === 'folder-a').children.length, 0);
  assert.equal(state.saves.length, 2);
});

test('bookmark editor keeps invalid data visible and does not persist it', async () => {
  const state = fixture();

  await state.actions.execute({ type: 'add-link' });
  state.getEditor().title = '非法网址';
  state.getEditor().url = 'javascript:alert(1)';
  await state.actions.execute({ type: 'save-editor' });

  assert.equal(state.getVault().bookmarks.length, 2);
  assert.equal(state.getEditor().error, '书签只支持不含登录凭据的 HTTP / HTTPS 网址');
  assert.equal(state.getEditor().saving, false);
  assert.equal(state.saves.length, 0);
});

test('failed bookmark form writes roll back and leave the editor open with an error', async () => {
  const state = fixture({ saveError: 'SQLite 写入失败' });

  await state.actions.execute({ type: 'add-folder' });
  state.getEditor().title = '待创建';
  await state.actions.execute({ type: 'save-editor' });

  assert.equal(state.getVault().bookmarks.length, 2);
  assert.equal(state.getEditor().error, 'SQLite 写入失败');
  assert.equal(state.getEditor().saving, false);
  assert.equal(state.saves.length, 0);
});

test('deleting a populated folder keeps children in the parent and restores the folder with its contents', async () => {
  const state = fixture();
  state.getVault().bookmarks.push({ id: 'folder-parent', kind: 'folder', title: '父级', children: [
    { id: 'link-before', kind: 'link', title: '之前', url: 'https://before.example' },
    { id: 'folder-target', kind: 'folder', title: '目标分组', children: [
      { id: 'link-inside', kind: 'link', title: '组内', url: 'https://inside.example' }
    ] }
  ] });

  await state.actions.execute({ type: 'delete', id: 'folder-target' });
  assert.equal(state.getVault().trash.length, 0);
  state.getDeleteDialog().mode = 'keep';
  await state.actions.execute({ type: 'confirm-delete' });

  const parent = state.getVault().bookmarks.find(item => item.id === 'folder-parent');
  assert.deepEqual(parent.children.map(item => item.id), ['link-before', 'link-inside']);
  const entry = state.getVault().trash[0];
  assert.deepEqual(entry.releasedChildren, ['link-inside']);
  assert.deepEqual(state.reconciledDeletes[0], { ids: ['folder-target'], parentId: 'folder-parent' });

  restoreTrashEntry(state.getVault(), entry.id);
  const restored = state.getVault().bookmarks.find(item => item.id === 'folder-parent').children;
  assert.deepEqual(restored.map(item => item.id), ['link-before', 'folder-target']);
  assert.deepEqual(restored[1].children.map(item => item.id), ['link-inside']);
});

test('deleting a folder with all descendants creates one recoverable trash entry', async () => {
  const state = fixture();
  state.getVault().bookmarks.push({ id: 'folder-target', kind: 'folder', title: '目标分组', children: [
    { id: 'folder-child', kind: 'folder', title: '子分组', children: [
      { id: 'link-inside', kind: 'link', title: '组内', url: 'https://inside.example' }
    ] }
  ] });

  await state.actions.execute({ type: 'delete', id: 'folder-target' });
  state.getDeleteDialog().mode = 'delete';
  await state.actions.execute({ type: 'confirm-delete' });

  assert.equal(state.getVault().bookmarks.some(item => item.id === 'folder-target'), false);
  assert.equal(state.getVault().trash.length, 1);
  assert.deepEqual(state.reconciledDeletes[0].ids, ['folder-target', 'folder-child', 'link-inside']);
  restoreTrashEntry(state.getVault(), state.getVault().trash[0].id);
  assert.equal(state.getVault().bookmarks.find(item => item.id === 'folder-target').children[0].children[0].id, 'link-inside');
});

test('clearing bookmarks moves each root item to trash and keeps notes intact', async () => {
  const state = fixture();
  state.getVault().notes.push({ id: 'note-safe', title: '保留笔记', type: 'note', category: '', tags: [], body: '', source: '', created: 1, updated: 1, pinned: false, status: 'published' });
  state.getVault().bookmarks.push({ id: 'folder-a', kind: 'folder', title: '资料', children: [
    { id: 'link-c', kind: 'link', title: 'C', url: 'https://c.example' }
  ] });
  state.getVault().bookmarkFolderStates = { 'folder-a': false };

  await state.actions.execute({ type: 'clear' });
  assert.deepEqual(state.getDeleteDialog().request, { kind: 'all', linkCount: 3, folderCount: 1 });
  await state.actions.execute({ type: 'confirm-delete' });

  assert.deepEqual(state.getVault().bookmarks, []);
  assert.equal(state.getVault().trash.length, 3);
  assert.deepEqual(state.getVault().notes.map(note => note.id), ['note-safe']);
  assert.deepEqual(state.getVault().bookmarkFolderStates, {});
  assert.equal(state.resetsAfterClear(), 1);
  assert.equal(state.getDeleteDialog(), null);
});

test('bookmark deletion detects stale data and rolls back a failed server write', async () => {
  const stale = fixture();
  await stale.actions.execute({ type: 'delete', id: 'link-a' });
  stale.getVault().bookmarks[0].title = '外部修改';
  await stale.actions.execute({ type: 'confirm-delete' });
  assert.equal(stale.getVault().trash.length, 0);
  assert.match(stale.getDeleteDialog().error, /内容已变更/);
  assert.equal(stale.saves.length, 0);

  const failed = fixture({ saveError: 'SQLite 写入失败' });
  const original = structuredClone(failed.getVault().bookmarks);
  await failed.actions.execute({ type: 'delete', id: 'link-a' });
  await failed.actions.execute({ type: 'confirm-delete' });
  assert.deepEqual(failed.getVault().bookmarks, original);
  assert.equal(failed.getVault().trash.length, 0);
  assert.equal(failed.getDeleteDialog().error, 'SQLite 写入失败');
  assert.equal(failed.getDeleteDialog().saving, false);
});

test('bulk moves only the visible selection, validates the destination and persists through Vault', async () => {
  const state = fixture();
  state.getVault().bookmarks.push({ id: 'folder-target', kind: 'folder', title: '目标', children: [
    { id: 'link-c', kind: 'link', title: 'C', url: 'https://c.example' },
    { id: 'link-d', kind: 'link', title: 'D', url: 'https://d.example' }
  ] });
  state.viewState.selected.add('link-a');
  state.viewState.selected.add('link-c');

  await state.actions.execute({ type: 'bulk-move' });
  assert.deepEqual(state.getBulkDialog().ids, ['link-a', 'link-c']);
  state.getBulkDialog().targetId = 'folder-target';
  await state.actions.execute({ type: 'confirm-bulk' });

  assert.deepEqual(state.getVault().bookmarks.map(item => item.id), ['link-b', 'folder-target']);
  assert.deepEqual(state.getVault().bookmarks[1].children.map(item => item.id), ['link-d', 'link-a', 'link-c']);
  assert.equal(state.viewState.selected.size, 0);
  assert.equal(state.getBulkDialog(), null);
  assert.equal(state.saves.length, 1);
});

test('bulk deletion creates individually restorable entries and retains unselected content', async () => {
  const state = fixture();
  state.getVault().bookmarks.push({ id: 'folder-a', kind: 'folder', title: '资料', children: [
    { id: 'link-c', kind: 'link', title: 'C', url: 'https://c.example' }
  ] });
  state.viewState.selected.add('link-a');
  state.viewState.selected.add('link-c');

  await state.actions.execute({ type: 'bulk-delete' });
  await state.actions.execute({ type: 'confirm-bulk' });

  assert.deepEqual(state.getVault().bookmarks.map(item => item.id), ['link-b', 'folder-a']);
  assert.equal(state.getVault().bookmarks[1].children.length, 0);
  assert.deepEqual(state.getVault().trash.map(entry => entry.item.id), ['link-a', 'link-c']);
  for (const entry of [...state.getVault().trash]) restoreTrashEntry(state.getVault(), entry.id);
  assert.deepEqual(state.getVault().bookmarks.map(item => item.id), ['link-a', 'link-b', 'folder-a']);
  assert.equal(state.getVault().bookmarks[2].children[0].id, 'link-c');
});

test('failed bulk bookmark writes roll back and leave the selection and dialog available', async () => {
  const state = fixture({ saveError: 'SQLite 写入失败' });
  state.viewState.selected.add('link-a');
  const original = structuredClone(state.getVault().bookmarks);
  await state.actions.execute({ type: 'bulk-delete' });
  await state.actions.execute({ type: 'confirm-bulk' });

  assert.deepEqual(state.getVault().bookmarks, original);
  assert.equal(state.getVault().trash.length, 0);
  assert.equal(state.viewState.selected.has('link-a'), true);
  assert.equal(state.getBulkDialog().error, 'SQLite 写入失败');
  assert.equal(state.getBulkDialog().saving, false);
});

test('bookmark import previews a safe merged tree and commits only after explicit confirmation', async () => {
  const state = fixture();
  const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>资料</H3><DL><p><DT><A HREF="https://docs.example/start">说明文档</A></DL><p><DT><A HREF="https://a.example">重复链接</A></DL><p>';
  const file = { size: html.length, text: async () => html };

  await state.actions.execute({ type: 'import-file', file });
  assert.deepEqual({ added: state.getImportDialog().added, duplicates: state.getImportDialog().duplicates, folders: state.getImportDialog().folders.map(folder => folder.path) }, {
    added: 1, duplicates: 1, folders: ['资料']
  });
  assert.equal(state.getVault().bookmarks.length, 2, 'preview does not mutate saved bookmarks');

  await state.actions.execute({ type: 'confirm-import' });
  assert.equal(state.getVault().bookmarks.length, 3);
  assert.equal(state.getVault().bookmarks.find(item => item.kind === 'folder' && item.title === '资料').children[0].title, '说明文档');
  assert.equal(state.getImportDialog(), null);
  assert.equal(state.saves.length, 1);
});

test('bookmark import preview and confirmation deduplicate normalized URLs across groups', async () => {
  const state = fixture();
  state.getVault().bookmarks = [{ id: 'existing-group', kind: 'folder', title: '已有分组', children: [
    { id: 'existing-link', kind: 'link', title: '已保存', url: 'https://example.com/shared?item=1' }
  ] }];
  const html = '<DL><DT><H3>导入分组 A</H3><DL><DT><A HREF="https://EXAMPLE.com:443/shared?item=1">已有链接</A><DT><A HREF="https://example.com/new?item=1">新链接</A></DL><DT><H3>导入分组 B</H3><DL><DT><A HREF="https://EXAMPLE.com:443/new?item=1">跨组重复</A><DT><A HREF="https://example.com/new?item=2">不同参数</A></DL></DL>';
  const file = { size: html.length, text: async () => html };
  const original = structuredClone(state.getVault().bookmarks);

  await state.actions.execute({ type: 'import-file', file });
  assert.deepEqual({ added: state.getImportDialog().added, duplicates: state.getImportDialog().duplicates }, { added: 2, duplicates: 2 });
  assert.deepEqual(state.getVault().bookmarks, original, 'the preview does not persist or mutate the saved tree');
  assert.equal(state.saves.length, 0);

  await state.actions.execute({ type: 'confirm-import' });
  const savedGroups = state.getVault().bookmarks.filter(item => item.kind === 'folder');
  assert.deepEqual(savedGroups.map(folder => folder.children.map(link => link.url)), [
    ['https://example.com/shared?item=1'],
    ['https://example.com/new?item=1'],
    ['https://example.com/new?item=2']
  ]);
  assert.equal(state.getImportDialog(), null);
  assert.equal(state.saves.length, 1);
});

test('bookmark import rejects stale previews and retains the dialog after SQLite failure', async () => {
  const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://new.example">New</A></DL><p>';
  const file = { size: html.length, text: async () => html };
  const stale = fixture();
  await stale.actions.execute({ type: 'import-file', file });
  stale.getVault().bookmarks[0].title = 'changed elsewhere';
  await stale.actions.execute({ type: 'confirm-import' });
  assert.match(stale.getImportDialog().error, /知识库已变更/);
  assert.equal(stale.saves.length, 0);

  const failed = fixture({ saveError: 'SQLite 写入失败' });
  const original = structuredClone(failed.getVault().bookmarks);
  await failed.actions.execute({ type: 'import-file', file });
  await failed.actions.execute({ type: 'confirm-import' });
  assert.deepEqual(failed.getVault().bookmarks, original);
  assert.equal(failed.getImportDialog().error, 'SQLite 写入失败');
  assert.equal(failed.getImportDialog().saving, false);
});

test('bookmark import rejects oversized files without parsing or writing', async () => {
  const state = fixture();
  await state.actions.execute({ type: 'import-file', file: { size: 5 * 1024 * 1024 + 1, text: async () => { throw new Error('should not read'); } } });

  assert.deepEqual(state.notices, ['书签文件不能超过 5 MB']);
  assert.equal(state.getImportDialog(), null);
  assert.equal(state.saves.length, 0);
});

test('bookmark export downloads the current validated browser HTML format', async () => {
  const state = fixture();
  await state.actions.execute({ type: 'export' });

  assert.equal(state.downloads.length, 1);
  assert.equal(state.downloads[0].name, '栖点-书签.html');
  assert.match(await state.downloads[0].blob.text(), /https:\/\/a\.example/);
});

test('pasted bookmark metadata fills only untouched fields and saves its icon only with the bookmark', async () => {
  const uploadedFiles = [];
  const state = fixture({
    fetchMetadata: async () => ({ title: 'Fetched title', description: 'Fetched summary', favicon: { mime: 'image/png', data: 'iVBORw0KGgo=' } }),
    uploadAsset: async file => { uploadedFiles.push(file); return { url: '/api/assets/123e4567-e89b-42d3-a456-426614174001' }; }
  });
  await state.actions.execute({ type: 'add-link' });
  await state.actions.execute({ type: 'set-editor-url', value: 'https://example.com/' });
  await state.actions.execute({ type: 'set-editor-title', value: 'My title' });
  await state.actions.execute({ type: 'fetch-metadata', url: 'https://example.com/' });

  assert.equal(state.getEditor().title, 'My title');
  assert.equal(state.getEditor().description, 'Fetched summary');
  assert.equal(uploadedFiles.length, 0, 'cancelling before save must not upload the temporary favicon');

  await state.actions.execute({ type: 'save-editor' });
  const saved = state.getVault().bookmarks.find(item => item.kind === 'link' && item.url === 'https://example.com/');
  assert.equal(saved.title, 'My title');
  assert.equal(saved.description, 'Fetched summary');
  assert.equal(saved.favicon, '/api/assets/123e4567-e89b-42d3-a456-426614174001');
  assert.equal(uploadedFiles.length, 1);
  assert.equal(uploadedFiles[0].type, 'image/png');
  assert.deepEqual(new Uint8Array(await uploadedFiles[0].arrayBuffer()), new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
});

test('stale bookmark metadata responses cannot overwrite a newer URL or manual edits', async () => {
  let finishFetch;
  const state = fixture({ fetchMetadata: () => new Promise(resolve => { finishFetch = resolve; }) });
  await state.actions.execute({ type: 'add-link' });
  await state.actions.execute({ type: 'set-editor-url', value: 'https://first.example/' });
  const pending = state.actions.execute({ type: 'fetch-metadata', url: 'https://first.example/' });
  await state.actions.execute({ type: 'set-editor-title', value: 'Manual title' });
  await state.actions.execute({ type: 'set-editor-url', value: 'https://second.example/' });
  finishFetch({ title: 'Stale title', description: 'Stale summary', favicon: { mime: 'image/png', data: 'iVBORw0KGgo=' } });
  await pending;

  assert.equal(state.getEditor().url, 'https://second.example/');
  assert.equal(state.getEditor().title, 'Manual title');
  assert.equal(state.getEditor().description, '');
  assert.equal(state.getEditor().pendingFavicon, null);
  assert.equal(state.getEditor().metadataLoading, false);
});

test('failed bookmark metadata fetch leaves manual saving available and changing URL drops old metadata', async () => {
  const state = fixture({ fetchMetadata: async () => { throw Error('offline'); } });
  await state.actions.execute({ type: 'edit', id: 'link-a' });
  await state.actions.execute({ type: 'set-editor-url', value: 'https://replacement.example/' });
  await state.actions.execute({ type: 'fetch-metadata', url: 'https://replacement.example/' });
  assert.ok(state.getEditor().metadataError);
  await state.actions.execute({ type: 'set-editor-title', value: 'Manual replacement' });
  await state.actions.execute({ type: 'save-editor' });
  const saved = state.getVault().bookmarks.find(item => item.id === 'link-a');
  assert.equal(saved.title, 'Manual replacement');
  assert.equal(saved.url, 'https://replacement.example/');
  assert.equal(saved.description, undefined);
  assert.equal(saved.favicon, undefined);
});
