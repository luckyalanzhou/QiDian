import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createViteTestServer as createServer } from '../../support/vite-test-server.mjs';
import { fileURLToPath } from 'node:url';
import { applyVaultChanges } from '../../../shared/vault-changes.js';
import { createCurrentVaultSnapshot } from '../../../src/features/sync/current-vault-snapshot.ts';

test('production autosave writes directly to cloud and never puts note data into IndexedDB', async () => {
  const old = { window: globalThis.window, indexedDB: globalThis.indexedDB, fetch: globalThis.fetch };
  const localWrites = [];
  const requests = [];
  const listeners = [];
  globalThis.window = { addEventListener: (name, listener) => listeners.push([name, listener]) };
  globalThis.indexedDB = {
    open() {
      const request = {};
      const db = {
        objectStoreNames: { contains: () => true },
        transaction() {
          const tx = {};
          tx.objectStore = () => ({
            put(value) { localWrites.push(['put', value]); queueMicrotask(() => tx.oncomplete?.()); return { result: undefined }; },
            delete(key) { localWrites.push(['delete', key]); queueMicrotask(() => tx.oncomplete?.()); return { result: undefined }; },
            get() { return { result: undefined }; }
          });
          return tx;
        }
      };
      queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
      return request;
    }
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ revision: 1 }) };
  };

  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    define: { 'import.meta.env.DEV': 'false' },
    server: { middlewareMode: true },
    appType: 'custom'
  });
  try {
    const cloud = await server.ssrLoadModule('/src/cloud.js');
    const statuses = [];
    cloud.setOwner('account-test');
    cloud.onStatus(status => statuses.push(status));
    cloud.queueSave({
      notes: [{ id: 'note-test', title: '仅云端保存', type: 'note', category: '未分类', tags: [], body: '', source: '', created: 1, updated: 1, pinned: false }],
      categories: [], noteTypes: [{ id: 'note', name: '普通笔记' }], bookmarks: [], trash: [], theme: 'light', pasteMode: 'rich'
    });
    await new Promise(resolve => setTimeout(resolve, 30));

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/vault/changes');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(JSON.parse(requests[0].options.body).changes.notes.upsert[0].data.title, '仅云端保存');
    assert.ok(localWrites.every(([operation]) => operation === 'delete'), 'production may clear a legacy draft but must not put note data in IndexedDB');
    assert.deepEqual(statuses, ['正在保存到 Docker 数据目录…', '✓ 已保存到 Docker 数据目录']);
    assert.equal(listeners[0]?.[0], 'online');
  } finally {
    await server.close();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('foreground revision refresh merges another device update and saves independent local edits to cloud', async () => {
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};
  const writes=[],requests=[],updates=[];let visibleVault=null,putCount=0,releaseFirstPut,markFirstPutStarted;
  const firstPutStarted=new Promise(resolve=>{markFirstPutStarted=resolve});
  const firstPutGate=new Promise(resolve=>{releaseFirstPut=resolve});
  const makeNote=(id,title,body)=>({id,title,type:'note',category:'未分类',tags:[],body,source:'',created:1,updated:1,pinned:false});
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[makeNote('one','一','<p>原文</p>')],bookmarks:[],theme:'light',pasteMode:'rich'};
  const remote=structuredClone(base);remote.notes.push(makeNote('two','另一设备新增','<p>云端内容</p>'));
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(key){writes.push(['delete',key]);queueMicrotask(()=>tx.oncomplete?.());return{}},put(value,key){writes.push(['put',key]);queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  let currentRevision=2,savedVault=structuredClone(remote);
  globalThis.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(url==='/api/auth/session')return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:1,data:base})};
    if(url==='/api/vault/revision')return{ok:true,json:async()=>({revision:currentRevision})};
    if(url.startsWith('/api/vault/changes?after='))return{ok:true,json:async()=>({revision:currentRevision,resetRequired:true,changes:[]})};
    if(url==='/api/vault/changes'&&options.method==='POST'){
      const body=JSON.parse(options.body);putCount++;
      if(putCount===1){assert.equal(body.revision,2);markFirstPutStarted();await firstPutGate}
      else assert.equal(body.revision,currentRevision);
      savedVault=applyVaultChanges(savedVault,body.changes);currentRevision++;
      return{ok:true,json:async()=>({revision:currentRevision})};
    }
    if(url==='/api/vault')return{ok:true,json:async()=>({revision:currentRevision,data:savedVault})};
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);cloud.onRemoteUpdate(data=>{updates.push(data);visibleVault=structuredClone(data)});
    const local=structuredClone(initial.data);local.notes[0].body='<p>本设备独立修改</p>';local.notes[0].updated=4;
    const refreshing=cloud.refreshCloud(()=>local);
    await firstPutStarted;
    assert.equal(visibleVault.notes.find(note=>note.id==='two').title,'另一设备新增','合并视图必须先进入页面内存');
    visibleVault.notes[0].title='同步期间继续编辑';visibleVault.notes[0].updated=5;
    cloud.queueSave(visibleVault);
    releaseFirstPut();
    assert.equal(await refreshing,true);
    assert.equal(requests[1].url,'/api/vault/revision','轻量检测只读取 revision');
    assert.equal(requests[2].url,'/api/vault/changes?after=1','先尝试下载增量变更');
    assert.equal(requests[3].url,'/api/vault','变更历史不可用时回退下载完整内容');
    assert.equal(requests[4].options.method,'POST','非重叠改动自动合并后保存回云端');
    assert.equal(putCount,2,'同步进行时的新输入应排在合并保存后继续提交');
    assert.equal(savedVault.notes.find(note=>note.id==='one').body,'<p>本设备独立修改</p>');
    assert.equal(savedVault.notes.find(note=>note.id==='one').title,'同步期间继续编辑');
    assert.equal(savedVault.notes.find(note=>note.id==='two').title,'另一设备新增');
    assert.equal(updates.length,1);
    assert.ok(writes.every(([operation])=>operation==='delete'),'生产同步不得将笔记正文写入本地 IndexedDB');
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});

test('the next foreground check retries a retained cloud save after a temporary network error',async()=>{
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};const requests=[];let writes=0;
  const note={id:'retry-note',title:'待保存',type:'note',category:'未分类',tags:[],body:'正文',source:'',created:1,updated:1,pinned:false};
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[note],bookmarks:[],theme:'light',pasteMode:'rich'};
  let savedVault=structuredClone(base);
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(){queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result},put(){queueMicrotask(()=>tx.oncomplete?.());return{}}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  globalThis.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(url==='/api/auth/session')return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:4,data:base})};
    if(url==='/api/vault/changes'&&options.method==='POST'){
      writes++;
      if(writes===1)return{ok:false,status:503,json:async()=>({error:'暂时离线'})};
      const body=JSON.parse(options.body);
      savedVault=applyVaultChanges(savedVault,body.changes);
      return{ok:true,json:async()=>({revision:5})};
    }
    if(url.startsWith('/api/vault/changes?after='))return{ok:false,status:503,json:async()=>({error:'暂时离线'})};
    if(url==='/api/vault/revision')return{ok:true,json:async()=>({revision:5})};
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);
    const changed=structuredClone(initial.data);changed.notes[0].title='网络恢复后保存';cloud.queueSave(changed);
    assert.equal(await cloud.flush(),false);assert.equal(cloud.hasUnsaved(),true);
    assert.equal(await cloud.refreshCloud(()=>changed),false,'云端保存重试成功，但没有新的远端内容需要应用');
    assert.equal(writes,2,'前台检查应自动重试保留在内存中的版本');
    assert.equal(cloud.hasUnsaved(),false);
    assert.equal(requests.at(-1).url,'/api/vault/revision');
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});

test('an expired session pauses cloud writes and requests re-login without losing queued changes', async () => {
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};
  const requests=[],statuses=[];let authenticationPrompts=0;
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(){queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result},put(){queueMicrotask(()=>tx.oncomplete?.());return{}}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  globalThis.fetch=async(url,options={})=>{requests.push({url,options});return{ok:false,status:401,json:async()=>({error:'登录已过期，请重新登录'})}};
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');cloud.setOwner('account-test');cloud.onStatus(status=>statuses.push(status));cloud.onAuthenticationRequired(()=>authenticationPrompts++);
    cloud.queueSave({
      categories: [], noteTypes: [{ id: 'note', name: '普通笔记' }],
      notes: [{ id: 'pending-note', title: '当前页面保留', type: 'note', category: '未分类', tags: [], body: '', source: '', created: 1, updated: 1, pinned: false }],
      bookmarks: [], trash: [], theme: 'light', pasteMode: 'rich'
    });
    assert.equal(await cloud.flush(),false);
    assert.equal(cloud.hasUnsaved(),true);
    assert.equal(authenticationPrompts,1);
    assert.match(statuses.at(-1),/登录状态已失效/);
    assert.equal(cloud.retrySync(),false,'retry must not repeat a request with the same invalid session');
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(requests.length,1);
    assert.equal(authenticationPrompts,2,'manual retry should reopen the in-page login prompt');
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});

test('a password login confirms the cookie-backed session before opening the workspace', async () => {
  const old = { window: globalThis.window, indexedDB: globalThis.indexedDB, fetch: globalThis.fetch };
  const requests = [];
  globalThis.window = { addEventListener() {} };
  globalThis.indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = { objectStoreNames: { contains: () => true } }; request.onsuccess?.(); }); return request; } };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === '/api/auth/challenge') return { ok: true, json: async () => ({ id: 'challenge-test', salt: 'AAAAAAAAAAAAAAAAAAAAAA==', iterations: 600000 }) };
    if (url === '/api/auth/verify') return { ok: true, json: async () => ({ id: 'account-test' }) };
    if (url === '/api/auth/session') return { ok: false, status: 401, json: async () => ({ error: '请登录栖点账号' }) };
    throw new Error(`Unexpected request: ${url}`);
  };
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), define: { 'import.meta.env.DEV': 'false' }, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const cloud = await server.ssrLoadModule('/src/cloud.js');
    await assert.rejects(cloud.loginAccount('alan', 'Valid-password-2!', () => {}), /没有建立登录会话/);
    assert.deepEqual(requests.map(request => request.url), ['/api/auth/challenge', '/api/auth/verify', '/api/auth/session']);
  } finally { await server.close(); for (const [key, value] of Object.entries(old)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test('re-login merges the retained page changes with newer Docker cloud data before saving', async()=>{
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};
  const note=(id,title,body)=>({id,title,type:'note',category:'未分类',tags:[],body,source:'',created:1,updated:1,pinned:false,status:'published',publishedAt:1});
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[note('local','原标题','<p>A</p>'),note('remote','另一篇','<p>旧内容</p>')],bookmarks:[],theme:'light',pasteMode:'rich'};
  const remote=structuredClone(base);remote.notes[1].body='<p>另一设备已更新</p>';remote.notes[1].updated=3;
  const requests=[],records=new Map();let firstPut=true,saved,sessionReads=0;
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({get(key){const result={};queueMicrotask(()=>{result.result=structuredClone(records.get(key));tx.oncomplete?.()});return result},put(value,key){records.set(key,structuredClone(value));queueMicrotask(()=>tx.oncomplete?.());return{}},delete(key){records.delete(key);queueMicrotask(()=>tx.oncomplete?.());return{}}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  globalThis.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(url==='/api/auth/session'){sessionReads++;return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:sessionReads===1?1:2,data:sessionReads===1?base:remote})};}
    if(url==='/api/auth/challenge')return{ok:true,json:async()=>({id:'challenge-test',salt:'AAAAAAAAAAAAAAAAAAAAAA==',iterations:600000})};
    if(url==='/api/auth/verify')return{ok:true,json:async()=>({id:'account-test'})};
    if(url==='/api/vault/changes'&&options.method==='POST'){
      if(firstPut){firstPut=false;return{ok:false,status:401,json:async()=>({error:'登录已过期'})};}
      saved=applyVaultChanges(remote,JSON.parse(options.body).changes);
      return{ok:true,json:async()=>({revision:3})};
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');
    const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);
    const local=structuredClone(base);local.notes[0].title='本机新标题';local.notes[0].updated=2;
    cloud.queueSave(local);
    assert.equal(await cloud.flush(),false);
    const result=await cloud.reauthenticateAccount('alan','Valid-password-2!',()=>{});
    assert.equal(result.conflict,false);
    assert.equal(result.synced,true);
    assert.equal(saved.notes.find(item=>item.id==='local').title,'本机新标题');
    assert.equal(saved.notes.find(item=>item.id==='remote').body,'<p>另一设备已更新</p>');
    assert.equal(requests.filter(request=>request.url==='/api/vault/changes'&&request.options.method==='POST').length,2);
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});

test('a stale browser draft is preserved for recovery while cloud edits remain unblocked', async () => {
  const old = { window: globalThis.window, indexedDB: globalThis.indexedDB, fetch: globalThis.fetch, confirm: globalThis.confirm };
  const records = new Map();
  const writes = [];
  const requests = [];
  let confirmationRequested = false;
  const noteTypes = [{ id: 'note', name: '普通笔记' }];
  const makeNote = title => ({ id: 'note-test', title, type: 'note', category: '未分类', tags: [], body: '', source: '', created: 1, updated: 1, pinned: false });
  const staleDraft = {
    owner: 'account-test', pending: true, revision: 3,
    data: { categories: [], noteTypes, notes: [makeNote('旧设备草稿')], theme: 'light', pasteMode: 'rich' }
  };
  const cloudData = {
    categories: [], noteTypes, notes: [makeNote('较新的云端版本')], theme: 'light', pasteMode: 'rich'
  };
  records.set('vault:account-test', structuredClone(staleDraft));
  globalThis.confirm = () => { confirmationRequested = true; return true; };
  globalThis.window = { addEventListener() {} };
  globalThis.indexedDB = {
    open() {
      const request = {};
      const db = {
        objectStoreNames: { contains: () => true },
        transaction() {
          const tx = {};
          tx.objectStore = () => ({
            get(key) { const result = {}; queueMicrotask(() => { result.result = structuredClone(records.get(key)); tx.oncomplete?.(); }); return result; },
            put(value, key) { writes.push(['put', key]); records.set(key, structuredClone(value)); queueMicrotask(() => tx.oncomplete?.()); return {}; },
            delete(key) { writes.push(['delete', key]); records.delete(key); queueMicrotask(() => tx.oncomplete?.()); return {}; }
          });
          return tx;
        }
      };
      queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
      return request;
    }
  };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === '/api/auth/session') return { ok: true, json: async () => ({ id: 'account-test', username: 'alan', revision: 4, data: cloudData }) };
    if (url === '/api/vault/changes' && options.method === 'POST') return { ok: true, json: async () => ({ revision: 5 }) };
    if (url.startsWith('/api/vault/changes?after=')) return { ok: true, json: async () => ({ revision: 5, resetRequired: true, changes: [] }) };
    if (url === '/api/vault') return { ok: true, json: async () => ({ revision: 5, data: { ...cloudData, notes: [makeNote('新的网页编辑')] } }) };
    throw new Error(`Unexpected request: ${url}`);
  };

  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    define: { 'import.meta.env.DEV': 'false' },
    server: { middlewareMode: true },
    appType: 'custom'
  });
  try {
    const cloud = await server.ssrLoadModule('/src/cloud.js');
    const initial = await cloud.bootstrap();
    assert.equal(requests.filter(request => request.options.method !== 'PUT').length, 1, 'session and initial vault load should share one request');
    assert.equal(confirmationRequested, false, 'stale recovery must not block app startup with a conflict prompt');
    assert.equal(initial.data.notes[0].title, '较新的云端版本', 'the latest cloud vault is the editing base');
    assert.equal(initial.ignoredDraft, true);
    assert.equal(records.has('vault:account-test'), false);
    assert.deepEqual(records.get('ignored:account-test').data, staleDraft.data, 'the old draft remains recoverable');

    cloud.setOwner(initial.owner);
    cloud.queueSave({ ...initial.data, notes: [makeNote('新的网页编辑')] });
    assert.equal(await cloud.flush(), true);
    const save = requests.find(request => request.options.method === 'POST');
    assert.ok(save, 'subsequent edits should be sent directly to the cloud API');
    assert.equal(JSON.parse(save.options.body).revision, 4);
    assert.equal(JSON.parse(save.options.body).changes.notes.upsert[0].data.title, '新的网页编辑');
    assert.deepEqual(writes.slice(0, 2), [['put', 'ignored:account-test'], ['delete', 'vault:account-test']]);
    assert.ok(writes.slice(2).every(([operation, key]) => operation === 'delete' && key === 'vault:account-test'), 'production writes should only clear the obsolete active draft');

    const restored = await cloud.restoreIgnoredDraft();
    assert.equal(restored.conflict, true);
    assert.equal(restored.data.notes[0].title, '旧设备草稿');
    assert.equal(cloud.getSyncConflict().local.notes[0].title, '旧设备草稿');
    assert.equal(cloud.getSyncConflict().remote.notes[0].title, '新的网页编辑');
    assert.equal(records.has('ignored:account-test'), true, 'keep the recovery copy until explicit cloud-version selection');
    const latest = await cloud.reloadCloud();
    assert.equal(latest.notes[0].title, '新的网页编辑');
    assert.equal(cloud.getSyncConflict(), null);
    assert.equal(records.has('ignored:account-test'), false, 'remove the old local recovery copy only after cloud loading succeeds');
  } finally {
    await server.close();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('a stale full-vault save rebases independent notes and non-overlapping body edits', async () => {
  const old = { window:globalThis.window, indexedDB:globalThis.indexedDB, fetch:globalThis.fetch };
  const localWrites=[], requests=[];
  const makeNote=(id,title,body)=>({id,title,type:'note',category:'未分类',tags:[],body,source:'',created:1,updated:1,pinned:false});
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[makeNote('a','A','<p>A</p>'),makeNote('b','B','<p>B</p>'),makeNote('c','C','<p>系统：Debian</p><p>端口：443</p>')],bookmarks:[],theme:'light',pasteMode:'rich'};
  const remote=structuredClone(base);remote.notes[1].body='<p>B from another device</p>';remote.notes[1].updated=3;remote.notes[2].body='<p>系统：CentOS</p><p>端口：443</p>';remote.notes[2].updated=3;
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(key){localWrites.push(['delete',key]);queueMicrotask(()=>tx.oncomplete?.());return{}},put(value,key){localWrites.push(['put',key]);queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  let putCount=0;
  globalThis.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(url==='/api/auth/session')return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:5,data:base})};
    if(url==='/api/vault/changes'&&options.method==='POST'){
      putCount++;
      if(putCount===1)return{ok:false,status:409,json:async()=>({error:'version changed'})};
      const sent=JSON.parse(options.body);
      assert.equal(sent.revision,6);
      const merged=applyVaultChanges(remote,sent.changes);
      assert.equal(merged.notes.find(note=>note.id==='a').body,'<p>A from this device</p>');
      assert.equal(merged.notes.find(note=>note.id==='b').body,'<p>B from another device</p>');
      assert.equal(merged.notes.find(note=>note.id==='c').body,'<p>系统：CentOS</p><p>端口：8443</p>');
      return{ok:true,json:async()=>({revision:7})};
    }
    if(url.startsWith('/api/vault/changes?after='))return{ok:true,json:async()=>({revision:6,resetRequired:true,changes:[]})};
    if(url==='/api/vault')return{ok:true,json:async()=>({revision:6,data:remote})};
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');
    const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);
    const local=structuredClone(initial.data);local.notes[0].body='<p>A from this device</p>';local.notes[0].updated=4;local.notes[2].body='<p>系统：Debian</p><p>端口：8443</p>';local.notes[2].updated=4;
    cloud.queueSave(local);
    assert.equal(await cloud.flush(),true);
    assert.equal(putCount,2);
    assert.equal(requests.filter(request=>request.url==='/api/vault'&&!request.options.method).length,1);
    assert.ok(localWrites.every(([op])=>op==='delete'));
  }finally{
    await server.close();
    for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}
  }
});

test('overlapping writes to the same note stop rather than replace either device version', async()=>{
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};
  const makeNote=(body)=>({id:'same',title:'同一笔记',type:'note',category:'未分类',tags:[],body,source:'',created:1,updated:1,pinned:false});
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[makeNote('<p>原文</p>')],bookmarks:[],theme:'light',pasteMode:'rich'};
  const remote={...structuredClone(base),notes:[makeNote('<p>另一设备正文</p>')]};
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(){queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result},put(){queueMicrotask(()=>tx.oncomplete?.());return{}}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/auth/session')return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:1,data:base})};
    if(url==='/api/vault/changes'&&options.method==='POST')return{ok:false,status:409,json:async()=>({error:'stale'})};
    if(url.startsWith('/api/vault/changes?after='))return{ok:true,json:async()=>({revision:2,resetRequired:true,changes:[]})};
    if(url==='/api/vault')return{ok:true,json:async()=>({revision:2,data:remote})};
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);
    const local=structuredClone(initial.data);local.notes[0].body='<p>本设备正文</p>';local.notes[0].updated=3;cloud.queueSave(local);
    assert.equal(await cloud.flush(),false);
    assert.equal(cloud.hasUnsaved(),true);
    const conflict=cloud.getSyncConflict();
    assert.equal(conflict.revision,2);
    assert.equal(conflict.local.notes[0].body,'<p>本设备正文</p>');
    assert.equal(conflict.remote.notes[0].body,'<p>另一设备正文</p>');
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});

test('foreground refresh detects conflicts from unsaved active editor fields before applying a remote note', async()=>{
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};
  const makeNote=body=>({id:'active',title:'正在编辑',type:'note',category:'未分类',tags:[],body,source:'',created:1,updated:1,pinned:false});
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[makeNote('<p>原始正文</p>')],bookmarks:[],trash:[],theme:'light',pasteMode:'rich'};
  const remote={...structuredClone(base),notes:[makeNote('<p>另一设备更新</p>')]};
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(){queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result},put(){queueMicrotask(()=>tx.oncomplete?.());return{}}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/auth/session')return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:1,data:base})};
    if(url==='/api/vault/revision')return{ok:true,json:async()=>({revision:2})};
    if(url.startsWith('/api/vault/changes?after='))return{ok:true,json:async()=>({revision:2,resetRequired:true,changes:[]})};
    if(url==='/api/vault')return{ok:true,json:async()=>({revision:2,data:remote})};
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');
    const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);
    const vault=structuredClone(initial.data),editorDraft={...structuredClone(vault.notes[0]),body:'<p>本机未保存正文</p>',updated:3};
    const snapshot=createCurrentVaultSnapshot({
      getVault:()=>vault,isEditing:()=>true,getEditingDraft:()=>editorDraft,editorIsMounted:()=>true,
      updateDraftFromEditor:()=>{},isDraft:()=>false,hasDraftContent:()=>true,
      mutateVault:operation=>operation(vault)
    });

    assert.equal(await cloud.refreshCloud(snapshot),false,'重叠编辑应暂停远端应用');
    const conflict=cloud.getSyncConflict();
    assert.equal(conflict.local.notes[0].body,'<p>本机未保存正文</p>');
    assert.equal(conflict.remote.notes[0].body,'<p>另一设备更新</p>');
    assert.equal(cloud.hasUnsaved(),true,'本机修改必须保持待处理，不能静默覆盖远端');
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});

test('several overlapping cloud updates are retried automatically until the save settles', async()=>{
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};
  const note={id:'note',title:'原题',type:'note',category:'未分类',tags:[],body:'<p>正文</p>',source:'',created:1,updated:1,pinned:false};
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[note],bookmarks:[],theme:'light',pasteMode:'rich'};
  const statuses=[];let putCount=0,readCount=0;
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(){queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result},put(){queueMicrotask(()=>tx.oncomplete?.());return{}}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/auth/session')return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:1,data:base})};
    if(url==='/api/vault/changes'&&options.method==='POST'){
      putCount++;
      if(putCount<=4)return{ok:false,status:409,json:async()=>({error:'知识库版本已更新，需要重新同步'})};
      const sent=JSON.parse(options.body);
      assert.equal(sent.changes.notes.upsert[0].data.title,'本机新标题');
      return{ok:true,json:async()=>({revision:sent.revision+1})};
    }
    if(url.startsWith('/api/vault/changes?after='))return{ok:true,json:async()=>({revision:readCount+1,resetRequired:true,changes:[]})};
    if(url==='/api/vault'){readCount++;return{ok:true,json:async()=>({revision:readCount+1,data:base})};}
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);cloud.onStatus(status=>statuses.push(status));
    const local=structuredClone(initial.data);local.notes[0].title='本机新标题';local.notes[0].updated=2;cloud.queueSave(local);
    assert.equal(await cloud.flush(),true);
    assert.equal(putCount,5,'the fifth write succeeds after four revision races');
    assert.equal(cloud.hasUnsaved(),false);
    assert.equal(statuses.at(-1),'✓ 已保存到 Docker 数据目录');
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});

test('manual retry reuses the retained merged vault instead of replacing it with a stale page snapshot', async()=>{
  const old={window:globalThis.window,indexedDB:globalThis.indexedDB,fetch:globalThis.fetch};
  const makeNote=(id,title,body)=>({id,title,type:'note',category:'未分类',tags:[],body,source:'',created:1,updated:1,pinned:false});
  const base={categories:[],noteTypes:[{id:'note',name:'普通笔记'}],notes:[makeNote('local','原题','<p>正文</p>'),makeNote('remote','另一篇','<p>旧内容</p>')],bookmarks:[],theme:'light',pasteMode:'rich'};
  const remote=structuredClone(base);remote.notes[1].body='<p>另一设备已更新</p>';remote.notes[1].updated=3;
  let putCount=0,readCount=0,racing=true,saved;
  globalThis.window={addEventListener(){}};
  globalThis.indexedDB={open(){const request={},db={objectStoreNames:{contains:()=>true},transaction(){const tx={};tx.objectStore=()=>({delete(){queueMicrotask(()=>tx.oncomplete?.());return{}},get(){const result={result:undefined};queueMicrotask(()=>tx.oncomplete?.());return result},put(){queueMicrotask(()=>tx.oncomplete?.());return{}}});return tx}};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
  globalThis.fetch=async(url,options={})=>{
    if(url==='/api/auth/session')return{ok:true,json:async()=>({id:'account-test',username:'alan',revision:1,data:base})};
    if(url==='/api/vault/changes'&&options.method==='POST'){
      putCount++;
      if(racing)return{ok:false,status:409,json:async()=>({error:'知识库版本已更新，需要重新同步'})};
      saved=applyVaultChanges(remote,JSON.parse(options.body).changes);
      return{ok:true,json:async()=>({revision:JSON.parse(options.body).revision+1})};
    }
    if(url.startsWith('/api/vault/changes?after='))return{ok:true,json:async()=>({revision:readCount+1,resetRequired:true,changes:[]})};
    if(url==='/api/vault'){readCount++;return{ok:true,json:async()=>({revision:readCount+1,data:remote})};}
    throw new Error(`Unexpected request: ${url}`);
  };
  const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../', import.meta.url)),define:{'import.meta.env.DEV':'false'},server:{middlewareMode:true},appType:'custom'});
  try{
    const cloud=await server.ssrLoadModule('/src/cloud.js');const initial=await cloud.bootstrap();cloud.setOwner(initial.owner);
    const local=structuredClone(initial.data);local.notes[0].title='本机新标题';local.notes[0].updated=2;cloud.queueSave(local);
    assert.equal(await cloud.flush(),false);
    assert.equal(cloud.hasUnsaved(),true);
    racing=false;
    assert.equal(cloud.retrySync(),true);
    assert.equal(await cloud.flush(),true);
    assert.equal(saved.notes.find(note=>note.id==='local').title,'本机新标题');
    assert.equal(saved.notes.find(note=>note.id==='remote').body,'<p>另一设备已更新</p>');
  }finally{await server.close();for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});
