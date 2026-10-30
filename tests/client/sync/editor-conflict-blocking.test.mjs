import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSyncEngine } from '../../../src/features/sync/cloud-sync-engine.ts';

function vault(body) {
  return {
    categories: [],
    noteTypes: [{ id: 'note', name: '普通笔记' }],
    notes: [{ id: 'n1', title: '笔记', type: 'note', category: '未分类', tags: [], source: '', body, created: 1, updated: 1, pinned: false, status: 'published' }],
    bookmarks: [], trash: [], theme: 'light', pasteMode: 'rich'
  };
}

test('editor field conflicts block writes and retain both versions for the conflict workflow', async () => {
  const remote = vault('<p>已保存版本</p>');
  const base = vault('<p>编辑时基线</p>');
  const local = vault('<p>本地编辑版本</p>');
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

  engine.holdEditorConflict({ noteId: 'n1', baseNote: base.notes[0], localNote: local.notes[0] });

  assert.equal(state.blocked, true);
  assert.deepEqual(state.pending, local);
  assert.deepEqual(state.syncConflict, { base, local, remote, revision: 7 });
  assert.equal(await engine.flush(), false);
  assert.equal(writes, 0, 'the stale editor cannot be written over the server version');
  assert.deepEqual(statuses, ['修改存在重叠；双方版本均已保留，可在设置中整理']);
});

test('editor conflict keeps unrelated queued changes in the retained local version', () => {
  const remote = vault('<p>已保存版本</p>');
  remote.notes.push({ ...remote.notes[0], id: 'n2', title: '另一篇笔记' });
  const baseNote = { ...remote.notes[0], body: '<p>编辑时基线</p>' };
  const localNote = { ...baseNote, body: '<p>本地编辑版本</p>' };
  const pending = structuredClone(remote);
  pending.notes[1].title = '另一篇笔记的本地修改';
  const state = {
    revision: 7, pending, draining: false, blocked: false, requiresLogin: false,
    baseVault: structuredClone(remote), syncConflict: null, lastError: '', refreshing: false,
    owner: 'account-test'
  };
  const engine = createCloudSyncEngine({
    dev: false,
    state,
    getStatusListener: () => () => {},
    getAuthenticationListener: () => () => {},
    getRemoteUpdateListener: () => () => {},
    saveLocalDraft: async () => {},
    clearLocalDraft: async () => {},
    getVaultRevision: async () => ({ revision: 7 }),
    getVault: async () => ({ revision: 7, data: remote }),
    putVault: async () => ({ revision: 8 }),
    validateVault: value => structuredClone(value),
    mergeVault: () => null
  });

  engine.holdEditorConflict({ noteId: 'n1', baseNote, localNote });

  assert.equal(state.pending.notes[0].body, localNote.body);
  assert.equal(state.pending.notes[1].title, '另一篇笔记的本地修改');
  assert.equal(state.syncConflict.local.notes[1].title, '另一篇笔记的本地修改');
});
