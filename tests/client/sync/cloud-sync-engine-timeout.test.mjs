import test from 'node:test';
import assert from 'node:assert/strict';
import { createViteTestServer } from '../../support/vite-test-server.mjs';
import { fileURLToPath } from 'node:url';
import { applyVaultChanges, diffVaultChanges } from '../../../shared/vault-changes.js';

test('a lost save response is reconciled with the server before retrying', async t => {
  const server = await createViteTestServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const snapshot = { notes: [{ id: 'one', body: 'saved' }] };
  let saved = null;
  let writes = 0;
  const state = {
    revision: 4, pending: null, draining: false, blocked: false, requiresLogin: false,
    baseVault: { notes: [{ id: 'one', body: 'old' }] }, syncConflict: null, lastError: '',
    refreshing: false, owner: 'account-test'
  };
  const engine = createCloudSyncEngine({
    dev: false, state,
    getStatusListener: () => () => undefined,
    getAuthenticationListener: () => () => undefined,
    getRemoteUpdateListener: () => () => undefined,
    saveLocalDraft: async () => undefined, clearLocalDraft: async () => undefined,
    getVaultRevision: async () => ({ revision: 5 }),
    getVault: async () => ({ revision: 5, data: saved }),
    putVault: async (_revision, data) => {
      writes += 1;
      saved = structuredClone(data);
      throw new TypeError('response lost after commit');
    },
    validateVault: value => value,
    mergeVault: () => null
  });

  await engine.commitSave(snapshot);
  assert.equal(writes, 1, 'the ambiguous write is not repeated');
  assert.equal(state.revision, 5);
  assert.equal(state.pending, null);
  assert.equal(state.lastError, '');
});

test('an invalid vault is rejected before network access and retained for recovery', async t => {
  const server = await createViteTestServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const snapshot = { invalidRecord: true };
  let writes = 0;
  const messages = [];
  const state = {
    revision: 4, pending: null, draining: false, blocked: false, requiresLogin: false,
    baseVault: { notes: [] }, syncConflict: null, lastError: '', refreshing: false, owner: 'account-test'
  };
  const engine = createCloudSyncEngine({
    dev: false, state,
    getStatusListener: () => message => messages.push(message),
    getAuthenticationListener: () => () => undefined,
    getRemoteUpdateListener: () => () => undefined,
    saveLocalDraft: async () => undefined, clearLocalDraft: async () => undefined,
    getVaultRevision: async () => ({ revision: 4 }),
    getVault: async () => ({ revision: 4, data: { notes: [] } }),
    putVault: async () => { writes += 1; return { revision: 5 }; },
    validateVault: value => {
      if (value.invalidRecord) throw Object.assign(new Error('笔记正文格式或长度无效'), { status: 400 });
      return value;
    },
    mergeVault: () => null
  });

  await assert.rejects(engine.commitSave(snapshot), /格式或长度无效/);
  assert.equal(writes, 0);
  assert.deepEqual(state.pending, snapshot);
  assert.match(state.lastError, /格式或长度无效/);
  assert.ok(messages.includes(state.lastError));
});

test('a rejected attachment reference keeps the pending vault for explicit retry', async t => {
  const server = await createViteTestServer({
    configFile:false,
    root:fileURLToPath(new URL('../../../', import.meta.url)),
    server:{ middlewareMode:true },
    appType:'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const base = { categories:[], noteTypes:[{ id:'note', name:'普通笔记' }], notes:[], bookmarks:[], trash:[] };
  const snapshot = { ...base, notes:[{ id:'broken-reference', title:'附件引用', body:'/api/assets/123e4567-e89b-42d3-a456-426614174000' }] };
  const messages = [];
  let writes = 0, reads = 0;
  const state = { revision:4, pending:null, draining:false, blocked:false, requiresLogin:false,
    baseVault:structuredClone(base), syncConflict:null, lastError:'', refreshing:false, owner:'account-test' };
  const engine = createCloudSyncEngine({
    dev:false, state,
    getStatusListener:() => message => messages.push(message),
    getAuthenticationListener:() => () => undefined,
    getRemoteUpdateListener:() => () => undefined,
    saveLocalDraft:async () => undefined, clearLocalDraft:async () => undefined,
    getVaultRevision:async () => { reads++; return { revision:4 }; },
    getVault:async () => { reads++; return { revision:4, data:base }; },
    putVault:async () => { throw Error('full save should not be used'); },
    putVaultChanges:async () => { writes++; throw Object.assign(new Error('附件不存在或尚未上传完成'), { status:422 }); },
    validateVault:value => value,
    mergeVault:() => null
  });

  assert.equal(await engine.commitSave(snapshot).then(() => false, error => /附件不存在/.test(error.message)),true);
  assert.equal(writes,1,'422 is not retried as a revision conflict');
  assert.equal(reads,0,'422 does not trigger a remote merge read');
  assert.deepEqual(state.pending,snapshot);
  assert.equal(state.revision,4);
  assert.match(state.lastError,/附件不存在/);
  assert.ok(messages.includes(state.lastError));
});

test('a failed local draft write retains the latest snapshot for an explicit retry', async t => {
  const server = await createViteTestServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const snapshot = { notes: [{ id: 'one', body: 'still recoverable' }] };
  const saved = [];
  let writes = 0;
  const state = {
    revision: 0, pending: null, draining: false, blocked: false, requiresLogin: false,
    baseVault: null, syncConflict: null, lastError: '', refreshing: false, owner: 'local'
  };
  const engine = createCloudSyncEngine({
    dev: true, state,
    getStatusListener: () => () => undefined,
    getAuthenticationListener: () => () => undefined,
    getRemoteUpdateListener: () => () => undefined,
    saveLocalDraft: async vault => {
      writes++;
      if (writes === 1) throw new Error('IndexedDB temporarily unavailable');
      saved.push(structuredClone(vault));
    },
    clearLocalDraft: async () => undefined,
    getVaultRevision: async () => ({ revision: 0 }),
    getVault: async () => ({ revision: 0, data: snapshot }),
    putVault: async () => ({ revision: 1 }),
    validateVault: value => value,
    mergeVault: () => null
  });

  await assert.rejects(engine.commitSave(snapshot), /本地草稿保存失败/);
  assert.deepEqual(state.pending, snapshot);
  assert.equal(engine.retrySync(), true);
  assert.equal(await engine.flush(), true);
  assert.equal(writes, 2);
  assert.deepEqual(saved, [snapshot]);
  assert.equal(state.pending, null);
  assert.equal(state.lastError, '');
});

test('cloud saves send only changed records and use the expected revision', async t => {
  const server = await createViteTestServer({
    configFile:false,
    root:fileURLToPath(new URL('../../../', import.meta.url)),
    server:{ middlewareMode:true },
    appType:'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const original = { categories:[], noteTypes:[{ id:'note', name:'普通笔记' }], notes:[{ id:'keep', title:'保留' }], bookmarks:[], trash:[] };
  const changed = { ...original, notes:[{ id:'keep', title:'修改' }, { id:'new', title:'新增' }] };
  let stored = structuredClone(original);
  const sent = [];
  const state = {
    revision:8, pending:null, draining:false, blocked:false, requiresLogin:false,
    baseVault:structuredClone(original), syncConflict:null, lastError:'', refreshing:false, owner:'account-test'
  };
  const engine = createCloudSyncEngine({
    dev:false, state,
    getStatusListener:() => () => undefined,
    getAuthenticationListener:() => () => undefined,
    getRemoteUpdateListener:() => () => undefined,
    saveLocalDraft:async () => undefined, clearLocalDraft:async () => undefined,
    getVaultRevision:async () => ({ revision:8 }),
    getVault:async () => ({ revision:8, data:stored }),
    putVault:async () => { throw new Error('legacy full-snapshot endpoint should not be used'); },
    putVaultChanges:async (revision, changes) => {
      sent.push({ revision, changes });
      stored = applyVaultChanges(stored, changes);
      return { revision:revision + 1 };
    },
    validateVault:value => value,
    mergeVault:() => null
  });

  await engine.commitSave(changed);
  assert.equal(sent.length,1);
  assert.equal(sent[0].revision,8);
  assert.deepEqual(sent[0].changes.notes.upsert.map(row => row.id), ['keep','new']);
  assert.deepEqual(sent[0].changes.notes.delete, []);
  assert.deepEqual(stored,changed);
  assert.equal(state.revision,9);
});

test('cloud refresh reconstructs the remote vault from revision deltas', async t => {
  const server = await createViteTestServer({
    configFile:false,
    root:fileURLToPath(new URL('../../../', import.meta.url)),
    server:{ middlewareMode:true },
    appType:'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const base = { categories:[], noteTypes:[{ id:'note', name:'普通笔记' }], notes:[], bookmarks:[], trash:[] };
  const remote = { ...base, notes:[{ id:'remote-note', title:'另一设备保存' }] };
  const entry = { revision:12, changes:diffVaultChanges(base,remote) };
  const state = {
    revision:11, pending:null, draining:false, blocked:false, requiresLogin:false,
    baseVault:structuredClone(base), syncConflict:null, lastError:'', refreshing:false, owner:'account-test'
  };
  let applied = null;
  const engine = createCloudSyncEngine({
    dev:false, state,
    getStatusListener:() => () => undefined,
    getAuthenticationListener:() => () => undefined,
    getRemoteUpdateListener:() => vault => { applied = vault; },
    saveLocalDraft:async () => undefined, clearLocalDraft:async () => undefined,
    getVaultRevision:async () => ({ revision:12 }),
    getVault:async () => { throw new Error('delta history should avoid a full vault fetch'); },
    getVaultChanges:async afterRevision => ({ revision:12, resetRequired:false, hasMore:false, changes:afterRevision === 11 ? [entry] : [] }),
    putVault:async () => ({ revision:13 }),
    validateVault:value => value,
    mergeVault:(_base, _local, latest) => latest
  });

  assert.equal(await engine.refreshCloud(() => base),true);
  assert.deepEqual(applied,remote);
  assert.equal(state.revision,12);
  assert.deepEqual(state.baseVault,remote);
});

test('a local save queued during cloud refresh cannot apply an older revision over a newer sync baseline', async t => {
  const server = await createViteTestServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const { mergeVault } = await server.ssrLoadModule('/src/features/sync/vault-merge.js');
  const original = { id: 'local-note', title: '原内容', type: 'note', category: '未分类', tags: [], body: '原文', source: '', created: 1, updated: 1, pinned: false };
  const remoteAddition = { id: 'remote-note', title: '另一设备新增', type: 'note', category: '未分类', tags: [], body: '云端内容', source: '', created: 2, updated: 2, pinned: false };
  const base = { categories: [], noteTypes: [{ id: 'note', name: '普通笔记' }], notes: [original], bookmarks: [], trash: [] };
  const remote = { ...base, notes: [original, remoteAddition] };
  const local = { ...base, notes: [{ ...original, title: '本机修改', body: '本机正文', updated: 3 }] };
  let serverVault = structuredClone(remote);
  let serverRevision = 2;
  let changeReads = 0;
  let writes = 0;
  let releaseFirstRead;
  let signalFirstRead;
  let resolveRevisionThree;
  const firstReadStarted = new Promise(resolve => { signalFirstRead = resolve; });
  const firstReadGate = new Promise(resolve => { releaseFirstRead = resolve; });
  const revisionThreeCommitted = new Promise(resolve => { resolveRevisionThree = resolve; });
  const history = new Map([[1, structuredClone(base)], [2, structuredClone(remote)]]);
  let visibleVault = structuredClone(base);
  const state = {
    revision: 1, pending: null, draining: false, blocked: false, requiresLogin: false,
    baseVault: structuredClone(base), syncConflict: null, lastError: '', refreshing: false, owner: 'account-test'
  };
  const engine = createCloudSyncEngine({
    dev: false, state,
    getStatusListener: () => () => undefined,
    getAuthenticationListener: () => () => undefined,
    getRemoteUpdateListener: () => vault => { visibleVault = structuredClone(vault); },
    saveLocalDraft: async () => undefined, clearLocalDraft: async () => undefined,
    getVaultRevision: async () => ({ revision: serverRevision }),
    getVault: async () => ({ revision: serverRevision, data: structuredClone(serverVault) }),
    getVaultChanges: async afterRevision => {
      changeReads++;
      const capturedRevision = serverRevision;
      const changes = [];
      for (let revision = afterRevision + 1; revision <= capturedRevision; revision++) {
        changes.push({ revision, changes: diffVaultChanges(history.get(revision - 1), history.get(revision)) });
      }
      const page = { revision: capturedRevision, resetRequired: false, hasMore: false, changes };
      if (changeReads === 1) {
        signalFirstRead();
        await firstReadGate;
      }
      return page;
    },
    putVaultChanges: async (revision, changes) => {
      writes++;
      if (revision !== serverRevision) throw Object.assign(new Error('stale revision'), { status: 409 });
      serverVault = applyVaultChanges(serverVault, changes);
      serverRevision++;
      history.set(serverRevision, structuredClone(serverVault));
      if (serverRevision === 3) resolveRevisionThree();
      return { revision: serverRevision };
    },
    putVault: async () => { throw new Error('legacy full-snapshot write should not be used'); },
    validateVault: value => value,
    mergeVault
  });

  const refresh = engine.refreshCloud(() => structuredClone(visibleVault));
  await firstReadStarted;
  visibleVault = structuredClone(local);
  engine.queueSave(visibleVault);
  const saveStartedDuringRefresh = writes > 0;
  if (saveStartedDuringRefresh) {
    await revisionThreeCommitted;
    for (let attempt = 0; attempt < 100 && state.draining; attempt++) await new Promise(resolve => setTimeout(resolve, 0));
  }
  releaseFirstRead();

  assert.equal(await refresh, true);
  assert.equal(serverRevision, 3, 'the remote and local edits should be committed together once');
  assert.equal(state.revision, serverRevision, 'the client sync revision must not move behind the server');
  assert.equal(state.pending, null);
  assert.equal(state.blocked, false);
  assert.deepEqual(serverVault.notes.map(note => note.id), ['local-note', 'remote-note']);
  assert.equal(serverVault.notes.find(note => note.id === 'local-note')?.title, '本机修改');
  assert.equal(visibleVault.notes.some(note => note.id === 'remote-note'), true);
});

test('a queued local save resumes after a cloud refresh finds no newer revision', async t => {
  const server = await createViteTestServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const base = { notes: [{ id: 'one', title: '原内容' }] };
  const local = { notes: [{ id: 'one', title: '本机修改' }] };
  let serverData = structuredClone(base);
  let serverRevision = 1;
  let releaseRevisionRead;
  let signalRevisionRead;
  let resolveWrite;
  const revisionReadStarted = new Promise(resolve => { signalRevisionRead = resolve; });
  const revisionReadGate = new Promise(resolve => { releaseRevisionRead = resolve; });
  const writeCompleted = new Promise(resolve => { resolveWrite = resolve; });
  const state = {
    revision: 1, pending: null, draining: false, blocked: false, requiresLogin: false,
    baseVault: structuredClone(base), syncConflict: null, lastError: '', refreshing: false, owner: 'account-test'
  };
  const engine = createCloudSyncEngine({
    dev: false, state,
    getStatusListener: () => () => undefined,
    getAuthenticationListener: () => () => undefined,
    getRemoteUpdateListener: () => () => undefined,
    saveLocalDraft: async () => undefined, clearLocalDraft: async () => undefined,
    getVaultRevision: async () => {
      signalRevisionRead();
      await revisionReadGate;
      return { revision: serverRevision };
    },
    getVault: async () => ({ revision: serverRevision, data: serverData }),
    getVaultChanges: async () => ({ revision: serverRevision, resetRequired: false, hasMore: false, changes: [] }),
    putVaultChanges: async (revision, changes) => {
      assert.equal(revision, serverRevision);
      serverData = applyVaultChanges(serverData, changes);
      serverRevision++;
      resolveWrite();
      return { revision: serverRevision };
    },
    putVault: async () => ({ revision: serverRevision + 1 }),
    validateVault: value => value,
    mergeVault: (_base, _local, remote) => remote
  });

  const refresh = engine.refreshCloud(() => local);
  await revisionReadStarted;
  engine.queueSave(local);
  releaseRevisionRead();
  assert.equal(await refresh, false, 'no remote revision changed during this refresh');
  await writeCompleted;
  for (let attempt = 0; attempt < 100 && state.draining; attempt++) await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(serverData.notes, local.notes);
  assert.equal(serverRevision, 2);
  assert.equal(state.revision, serverRevision);
  assert.equal(state.pending, null);
});

test('a newer local edit survives a 409 retry whose remote read expires the session', async t => {
  const server = await createViteTestServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const base = { notes: [{ id: 'one', body: 'original' }] };
  const firstEdit = { notes: [{ id: 'one', body: 'first edit' }] };
  const newestEdit = { notes: [{ id: 'one', body: 'newest edit' }] };
  const state = {
    revision: 4, pending: null, draining: false, blocked: false, requiresLogin: false,
    baseVault: structuredClone(base), syncConflict: null, lastError: '', refreshing: false, owner: 'account-test'
  };
  let signalRemoteRead;
  const remoteReadStarted = new Promise(resolve => { signalRemoteRead = resolve; });
  let rejectRemoteRead;
  const remoteRead = new Promise((_resolve, reject) => { rejectRemoteRead = reject; });
  const engine = createCloudSyncEngine({
    dev: false, state,
    getStatusListener: () => () => undefined,
    getAuthenticationListener: () => () => undefined,
    getRemoteUpdateListener: () => () => undefined,
    saveLocalDraft: async () => undefined, clearLocalDraft: async () => undefined,
    getVaultRevision: async () => ({ revision: 4 }),
    getVault: async () => { throw new Error('delta read should not fall back'); },
    getVaultChanges: async () => { signalRemoteRead(); return remoteRead; },
    putVault: async () => ({ revision: 5 }),
    putVaultChanges: async () => { throw Object.assign(new Error('stale revision'), { status: 409 }); },
    validateVault: value => value,
    mergeVault: () => null
  });

  engine.queueSave(firstEdit);
  const flush = engine.flush();
  await remoteReadStarted;
  engine.queueSave(newestEdit);
  rejectRemoteRead(Object.assign(new Error('expired session'), { status: 401 }));

  assert.equal(await flush, false);
  assert.deepEqual(state.pending, newestEdit);
  assert.equal(state.requiresLogin, true);
  assert.equal(state.blocked, true);
});

test('backup import blocks refresh, validates the captured revision and writes outside the retryable save queue', async t => {
  const server = await createViteTestServer({ configFile:false, root:fileURLToPath(new URL('../../../',import.meta.url)), server:{ middlewareMode:true }, appType:'custom' });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const vault = { notes:[{ id:'imported', body:'backup' }] };
  const writes = [];
  let revisionReads = 0;
  const state = { revision:7, pending:null, draining:false, blocked:false, requiresLogin:false,
    baseVault:{ notes:[{ id:'current', body:'safe' }] }, syncConflict:null, lastError:'', refreshing:false,
    owner:'account-test', importing:false, importWriteLocked:false };
  const engine = createCloudSyncEngine({ dev:false, state,
    getStatusListener:()=>()=>undefined, getAuthenticationListener:()=>()=>undefined, getRemoteUpdateListener:()=>()=>undefined,
    saveLocalDraft:async()=>undefined, clearLocalDraft:async()=>{},
    getVaultRevision:async()=>{ revisionReads++; return { revision:7 }; }, getVault:async()=>({ revision:7, data:vault }),
    putVault:async()=>{ throw Error('regular aggregate save must not be used for import'); },
    putVaultImport:async(scopeId,revision,data)=>{ writes.push(['import',scopeId,revision,structuredClone(data)]); return { revision:8 }; },
    getVaultImportScope:async()=>({ status:'staging', resultRevision:null }),
    validateVault:value=>value, mergeVault:()=>null
  });

  engine.beginVaultImport();
  assert.equal(await engine.refreshCloud(vault), false, 'background refresh is suspended for the whole import');
  const expectedRevision = await engine.prepareVaultImport();
  assert.equal(expectedRevision,7);
  assert.equal(state.importWriteLocked,true);
  assert.equal(engine.queueSave({ notes:[{ id:'should-not-queue' }] }),false);
  assert.equal(state.pending,null);
  await engine.commitVaultImport(expectedRevision,'123e4567-e89b-42d3-a456-426614174000',vault);
  assert.deepEqual(writes,[['import','123e4567-e89b-42d3-a456-426614174000',7,vault]]);
  assert.equal(state.revision,8);
  assert.deepEqual(state.baseVault,vault);
  assert.equal(state.pending,null);
  assert.equal(revisionReads,1);
  engine.finishVaultImport();
  assert.equal(state.importing,false);
});

test('backup import refuses to start from a revision already changed on another device', async t => {
  const server = await createViteTestServer({ configFile:false, root:fileURLToPath(new URL('../../../',import.meta.url)), server:{ middlewareMode:true }, appType:'custom' });
  t.after(() => server.close());
  const { createCloudSyncEngine } = await server.ssrLoadModule('/src/features/sync/cloud-sync-engine.ts');
  const state = { revision:7, pending:null, draining:false, blocked:false, requiresLogin:false,
    baseVault:{ notes:[] }, syncConflict:null, lastError:'', refreshing:false, owner:'account-test' };
  let writes = 0;
  const engine = createCloudSyncEngine({ dev:false, state,
    getStatusListener:()=>()=>undefined, getAuthenticationListener:()=>()=>undefined, getRemoteUpdateListener:()=>()=>undefined,
    saveLocalDraft:async()=>undefined, clearLocalDraft:async()=>undefined,
    getVaultRevision:async()=>({ revision:8 }), getVault:async()=>({ revision:8, data:{ notes:[] } }),
    putVault:async()=>{ writes++; return { revision:9 }; },
    putVaultImport:async()=>{ writes++; return { revision:9 }; }, getVaultImportScope:async()=>({ status:'staging', resultRevision:null }),
    validateVault:value=>value, mergeVault:()=>null
  });
  engine.beginVaultImport();
  await assert.rejects(engine.prepareVaultImport(),error=>error.status===409 && /其他设备更新/.test(error.message));
  assert.equal(state.importWriteLocked,false);
  assert.equal(writes,0);
  engine.finishVaultImport();
});
