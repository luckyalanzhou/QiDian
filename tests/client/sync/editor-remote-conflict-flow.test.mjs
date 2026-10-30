import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRemoteEditorRefresh } from '../../../src/features/editor/remote-refresh.ts';
import { createCloudSyncEngine } from '../../../src/features/sync/cloud-sync-engine.ts';

function vault(body) {
  return {
    categories: [],
    noteTypes: [{ id: 'note', name: '普通笔记' }],
    notes: [{ id: 'n1', title: '笔记', type: 'note', category: '未分类', tags: [], source: '', body, created: 1, updated: 1, pinned: false, status: 'published' }],
    bookmarks: [], trash: [], theme: 'light', pasteMode: 'rich'
  };
}

test('remote refresh preserves a conflicting editor version and blocks its stale save', async () => {
  const base = vault('<p>编辑时版本</p>');
  const localDraft = structuredClone(base.notes[0]);
  localDraft.body = '<p>本地编辑版本</p>';
  const remote = vault('<p>已保存的远端版本</p>');
  const state = {
    revision: 7, pending: null, draining: false, blocked: false, requiresLogin: false,
    baseVault: structuredClone(remote), syncConflict: null, lastError: '', refreshing: false,
    owner: 'account-test'
  };
  const statuses = [];
  let writes = 0;
  const engine = createCloudSyncEngine({
    dev: false,
    state,
    getStatusListener: () => message => statuses.push(message),
    getAuthenticationListener: () => () => {},
    getRemoteUpdateListener: () => () => {},
    saveLocalDraft: async () => {},
    clearLocalDraft: async () => {},
    getVaultRevision: async () => ({ revision: 7 }),
    getVault: async () => ({ revision: 7, data: remote }),
    putVault: async () => { writes++; return { revision: 8 }; },
    validateVault: value => structuredClone(value),
    mergeVault: () => null
  });
  const dom = new JSDOM('<input id="editTitle"><input id="editType"><input id="editTags"><input id="editSource"><input id="editCategory">');
  let editingDraft = localDraft;
  let baseline = JSON.stringify(base.notes[0]);
  const editor = {
    html: localDraft.body,
    state: { selection: { from: 1 }, doc: { content: { size: 20 } } },
    getHTML() { return this.html; },
    commands: { setContent(html) { editor.html = html; }, setTextSelection() {} }
  };
  const refresh = createRemoteEditorRefresh({
    document: dom.window.document,
    getEditingDraft: () => editingDraft,
    getBaseline: () => baseline,
    setEditingDraft: value => { editingDraft = value; },
    setBaseline: value => { baseline = value; },
    snapshot: value => JSON.stringify({ title: value.title, type: value.type, category: value.category, tags: value.tags, source: value.source, body: value.body }),
    cleanBody: value => value,
    getEditor: () => editor,
    syncToolbarState() {},
    onConflict: ({ base: baseNote, local, remote: remoteNote }) => engine.holdEditorConflict({
      noteId: remoteNote.id,
      baseNote,
      localNote: local
    })
  });

  refresh.refresh(remote.notes[0], true);

  assert.equal(editingDraft.body, localDraft.body, 'the local editor content remains available');
  assert.equal(baseline, JSON.stringify(base.notes[0]), 'the local draft is not rebased onto the remote version');
  assert.equal(state.blocked, true);
  assert.equal(state.syncConflict.base.notes[0].body, base.notes[0].body);
  assert.equal(state.syncConflict.local.notes[0].body, localDraft.body);
  assert.equal(state.syncConflict.remote.notes[0].body, remote.notes[0].body);
  assert.equal(await engine.flush(), false);
  assert.equal(writes, 0, 'saving cannot overwrite the server version before conflict resolution');
  assert.deepEqual(statuses, ['修改存在重叠；双方版本均已保留，可在设置中整理']);
  dom.window.close();
});
