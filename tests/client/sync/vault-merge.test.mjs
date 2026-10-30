import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeVault } from '../../../src/features/sync/vault-merge.js';

const note = (id, title, body = '<p>正文</p>') => ({ id, title, type:'note', category:'未分类', tags:[], body, source:'', created:1, updated:1, pinned:false, status:'published' });
const vault = notes => ({ categories:[], noteTypes:[{id:'note',name:'普通笔记'}], notes, bookmarks:[], theme:'light', pasteMode:'rich' });

test('independent note edits from two devices merge while retaining both versions', () => {
  const base = vault([note('a','A'), note('b','B')]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.notes[0].body = '<p>本设备编辑 A</p>'; local.notes[0].updated = 3;
  remote.notes[1].body = '<p>另一设备编辑 B</p>'; remote.notes[1].updated = 4;
  const merged = mergeVault(base, local, remote);
  assert.equal(merged.notes.find(item=>item.id==='a').body, '<p>本设备编辑 A</p>');
  assert.equal(merged.notes.find(item=>item.id==='b').body, '<p>另一设备编辑 B</p>');
});

test('changes to separate fields on the same note can be combined', () => {
  const base = vault([note('a','A')]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.notes[0].body = '<p>更新正文</p>'; local.notes[0].updated = 3;
  remote.notes[0].title = '改标题'; remote.notes[0].updated = 4;
  const merged = mergeVault(base, local, remote);
  assert.equal(merged.notes[0].title, '改标题');
  assert.equal(merged.notes[0].body, '<p>更新正文</p>');
  assert.equal(merged.notes[0].updated, 4);
});

test('independent account folder preferences merge across devices', () => {
  const base = { ...vault([]), dashboardBookmarkFolders:{home:true,other:true}, bookmarkFolderStates:{parent:true,nested:true} };
  const local = structuredClone(base), remote = structuredClone(base);
  local.dashboardBookmarkFolders.home = false;
  local.bookmarkFolderStates.parent = false;
  remote.dashboardBookmarkFolders.other = false;
  remote.bookmarkFolderStates.nested = false;
  const merged = mergeVault(base, local, remote);
  assert.deepEqual(merged.dashboardBookmarkFolders,{home:false,other:false});
  assert.deepEqual(merged.bookmarkFolderStates,{parent:false,nested:false});
});

test('non-overlapping edits inside one note body merge without dropping either device change', () => {
  const body = '<h2>VPS 常用命令</h2><p>系统：Debian</p><p>端口：443</p><p>说明：日常使用</p>';
  const base = vault([note('a','VPS 常用命令',body)]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.notes[0].body = body.replace('Debian','Ubuntu'); local.notes[0].updated = 3;
  remote.notes[0].body = body.replace('443','8443'); remote.notes[0].updated = 4;
  const merged = mergeVault(base, local, remote);
  assert.match(merged.notes[0].body, /Ubuntu/);
  assert.match(merged.notes[0].body, /8443/);
  assert.match(merged.notes[0].body, /说明：日常使用/);
});

test('overlapping edits to the same note body are surfaced instead of overwritten', () => {
  const base = vault([note('a','A')]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.notes[0].body = '<p>本设备</p>';
  remote.notes[0].body = '<p>另一设备</p>';
  assert.equal(mergeVault(base, local, remote), null);
});

test('separate new notes and categories are merged', () => {
  const base = vault([]);
  const local = { ...structuredClone(base), categories:['本地分类'], notes:[note('a','A')] };
  const remote = { ...structuredClone(base), categories:['云端分类'], notes:[note('b','B')] };
  const merged = mergeVault(base, local, remote);
  assert.deepEqual(new Set(merged.categories), new Set(['本地分类','云端分类']));
  assert.deepEqual(new Set(merged.notes.map(item=>item.id)), new Set(['a','b']));
});

test('independent recycle-bin changes from two devices merge without losing either item', () => {
  const base = { ...vault([]), trash:[] };
  const local = structuredClone(base), remote = structuredClone(base);
  local.trash.push({ id:'trash-a', kind:'note', deletedAt:1, item:note('a','本地删除') });
  remote.trash.push({ id:'trash-b', kind:'note', deletedAt:2, item:note('b','另一设备删除') });
  const merged = mergeVault(base, local, remote);
  assert.deepEqual(new Set(merged.trash.map(item=>item.id)), new Set(['trash-a','trash-b']));
});

test('matching reorder operations keep independent additions from both devices', () => {
  const base = vault([note('a','A'), note('b','B'), note('c','C')]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.notes = [local.notes[1], local.notes[0], local.notes[2], note('x','X')];
  remote.notes = [remote.notes[1], remote.notes[0], remote.notes[2], note('y','Y')];
  const merged = mergeVault(base, local, remote);
  assert.deepEqual(merged.notes.map(item=>item.id), ['b','a','c','x','y']);
});
