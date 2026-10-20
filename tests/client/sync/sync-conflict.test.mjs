import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { useSyncConflictStore } from '../../../src/features/sync/store.ts';
import { createSyncConflictController } from '../../../src/features/sync/sync-conflict-controller.ts';

const note = (id, title, body = '') => ({ id, title, body, type:'note', category:'开发', tags:[], source:'', updated:1 });
const vault = notes => ({ notes, categories:['开发'], trash:[] });

test('sync conflict store dispatches dialog actions through its bound feature runtime', async () => {
  const store = useSyncConflictStore(createPinia());
  const actions = [];
  store.bindActions(async action => actions.push(action));

  await store.dispatch('download-backup');
  await store.dispatch('restore-cloud');
  assert.deepEqual(actions, ['download-backup', 'restore-cloud']);
});

test('sync conflict review snapshots changed note summaries after preserving the active editor', () => {
  const base = vault([note('one','原始标题','<p>原文</p>'), note('two','待删除','<p>删除内容</p>'), note('same','保持不变')]);
  const local = vault([note('one','本机标题','<p>本机正文</p>'), note('same','保持不变')]);
  const remote = vault([note('one','原始标题','<p>原文</p>'), note('two','待删除','<p>删除内容</p>'), note('same','云端修改'), note('new','新笔记','<p>新内容</p>')]);
  const conflict = { base, local, remote };
  const store = useSyncConflictStore(createPinia());
  let prepared = 0;
  const controller = createSyncConflictController({
    store,
    getConflict:() => conflict,
    getPreviewText:html => html.replace(/<[^>]+>/g,'').trim(),
    prepareEditor:() => { prepared++; local.notes[0].body='<p>已进入编辑器保存队列</p>'; },
    exportConflict:async () => undefined,
    confirmRestore:async () => false,
    reloadCloud:async () => remote,
    replaceWorkspace:() => undefined,
    notify:() => undefined
  });

  assert.equal(controller.open(),true);
  assert.equal(prepared,1);
  assert.equal(store.visible,true);
  assert.equal(store.local?.changedCount,2);
  assert.deepEqual(store.local?.notes.map(item => item.title),['本机标题','待删除']);
  assert.equal(store.local?.notes[1].deleted,true);
  assert.equal(store.local?.notes[0].excerpt,'已进入编辑器保存队列');
  assert.equal(store.remote?.changedCount,2);
  assert.deepEqual(store.remote?.notes.map(item => item.title),['云端修改','新笔记']);
});

test('sync conflict restore stays locked until a comparison backup succeeds and keeps failures reviewable', async () => {
  const base = vault([note('one','原文')]);
  const conflict = { base, local:vault([note('one','本机')]), remote:vault([note('one','服务端')]) };
  const store = useSyncConflictStore(createPinia());
  const messages = [];
  let confirm = false, exportFails = true, reloadFails = true, reloads = 0;
  const controller = createSyncConflictController({
    store,
    getConflict:() => conflict,
    getPreviewText:html => html,
    prepareEditor:() => undefined,
    exportConflict:async () => { if(exportFails)throw Error('备份下载失败'); },
    confirmRestore:async () => confirm,
    reloadCloud:async () => { reloads++; if(reloadFails)throw Error('服务端暂不可用'); return conflict.remote; },
    replaceWorkspace:() => undefined,
    notify:message => messages.push(message)
  });

  controller.open();
  assert.equal(await controller.restoreCloudVersion(),false);
  assert.equal(messages.at(-1),'请先下载两版对照备份');
  assert.equal(await controller.downloadBackup(),false);
  assert.equal(store.backupReady,false);
  assert.equal(store.status,'备份下载失败');

  exportFails=false;
  assert.equal(await controller.downloadBackup(),true);
  assert.equal(store.backupReady,true);
  assert.equal(store.statusTone,'success');
  assert.equal(await controller.restoreCloudVersion(),false,'a dismissed confirmation does not reload cloud data');
  assert.equal(reloads,0);

  confirm=true;
  assert.equal(await controller.restoreCloudVersion(),false);
  assert.equal(reloads,1);
  assert.equal(store.visible,true);
  assert.equal(store.backupReady,true);
  assert.equal(store.restoring,false);
  assert.equal(store.status,'服务端暂不可用');
});

test('sync conflict restore replaces the workspace only after confirmation and closes after success', async () => {
  const cloud = vault([note('cloud','已保存版本')]);
  const store = useSyncConflictStore(createPinia());
  let replacements = 0, messages = [];
  const controller = createSyncConflictController({
    store,
    getConflict:() => ({ base:vault([]), local:vault([note('local','本机版本')]), remote:cloud }),
    getPreviewText:html => html,
    prepareEditor:() => undefined,
    exportConflict:async () => undefined,
    confirmRestore:async () => true,
    reloadCloud:async () => cloud,
    replaceWorkspace:restored => { replacements++; assert.equal(restored.notes[0].title,'已保存版本'); },
    notify:message => messages.push(message)
  });

  controller.open();
  await controller.downloadBackup();
  assert.equal(await controller.restoreCloudVersion(),true);
  assert.equal(replacements,1);
  assert.equal(store.visible,false);
  assert.equal(store.restoring,false);
  assert.equal(messages.at(-1),'已载入保存版本；当前修改保存在刚下载的对照备份中');
});
