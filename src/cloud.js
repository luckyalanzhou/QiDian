import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { validateVault } from '../server/validation.js';
import { makeRegistrationCredential, makeLoginVerifier } from './credentials.js';
import { draftRecoveryState } from './draft-recovery.js';
import { mergeVault } from './vault-merge.js';
const DEV = import.meta.env.DEV;
let revision = 0, pending, draining = false, blocked = false, requiresLogin = false, baseVault = null, syncConflict = null;
let listener = () => {}, authenticationListener = () => {}, remoteUpdateListener = () => {}, lastError = '', refreshing = false;
const DB_NAME = DEV ? 'qidian-development' : 'qidian-private-drafts';
const idb = new Promise((resolve, reject) => {
  const r = indexedDB.open(DB_NAME, 2);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('drafts')) r.result.createObjectStore('drafts'); };
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
});
const draftKey = (owner, slot = 'active') => slot === 'ignored' ? `ignored:${owner}` : owner === 'local' || owner === 'legacy' ? 'vault' : `vault:${owner}`;
async function draftOp(method, value, owner = 'local', slot = 'active') {
  const db = await idb;
  const key = draftKey(owner, slot);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', method === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('drafts');
    const request = method === 'get' ? store.get(key) : method === 'put' ? store.put(value, key) : store.delete(key);
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `请求失败 (${response.status})`); error.status = response.status; error.details = body; throw error;
  }
  return response;
}
export async function getSystemVersion({ installedOnly = false } = {}) { return (await api(`/system/version${installedOnly?'?installed=1':''}`)).json(); }
export async function requestSystemUpdate() {
  return (await api('/system/update', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ action:'update' }) })).json();
}
export async function getSystemUpdateStatus() { return (await api('/system/update-status')).json(); }
export async function getAuthConfig() { return (await api('/auth/config')).json(); }
export async function registerAccount(username, password) {
  const credential = await makeRegistrationCredential(password);
  const result = await (await api('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, ...credential }) })).json();
  if (result.legacyClaimed) {
    const legacy = await draftOp('get', undefined, 'legacy').catch(() => null);
    if (legacy?.pending) await draftOp('put', { ...legacy, owner: result.id }, result.id);
  }
  return result;
}
async function verifyAccount(username, password, onStage = () => {}) {
  onStage('challenge');
  const challenge = await (await api('/auth/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })).json();
  onStage('derive');
  const verifier = await makeLoginVerifier(password, challenge.salt);
  onStage('verify');
  const verified = await (await api('/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: challenge.id, verifier }) })).json();
  onStage('load');
  let session;
  try { session = await (await api('/auth/session')).json(); }
  catch (error) {
    if (error.status === 401) throw new Error('密码验证成功，但浏览器没有建立登录会话。请允许本站 Cookie，并确认访问地址与 HTTP / HTTPS 代理设置一致。');
    throw error;
  }
  if (session.id !== verified.id) throw new Error('登录会话与当前账号不一致，请重新登录');
  return session;
}
export async function loginAccount(username, password, onStage = () => {}) {
  const session = await verifyAccount(username, password, onStage);
  return prepareInitialData(session);
}
export async function reauthenticateAccount(username, password, onStage = () => {}) {
  const session = await verifyAccount(username, password, onStage);
  if (owner !== 'local' && session.id !== owner) {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    throw new Error('请使用发生同步错误的原账号重新登录；当前修改仍保留在此页面');
  }
  const remote = validateVault(session.data);
  const retained = pending ? structuredClone(pending) : null;
  const previousBase = baseVault;
  const previousRevision = revision;
  revision = session.revision;
  baseVault = remote;
  requiresLogin = false;
  if (!retained) {
    blocked = false; lastError = ''; syncConflict = null;
    listener('✓ 已重新连接 Docker 私人服务');
    return { data: structuredClone(remote), conflict: false, synced: true };
  }
  const merged = previousBase ? mergeVault(previousBase, retained, remote) : null;
  if (!merged) {
    revision = previousRevision;
    baseVault = previousBase;
    blocked = true;
    syncConflict = { base:previousBase ? structuredClone(previousBase) : null, local:structuredClone(retained), remote:structuredClone(remote), revision:session.revision };
    lastError = '修改有重叠，已保留两个版本。';
    listener(lastError);
    return { data: retained, conflict: true, synced: false };
  }
  pending = merged;
  blocked = false; lastError = ''; syncConflict = null;
  listener('正在合并已保存的修改…');
  await drain();
  const synced = await flush();
  return { data: structuredClone(synced ? baseVault : pending || merged), conflict: false, synced };
}
export async function logoutAccount() { await api('/auth/logout', { method: 'POST' }); }
export async function getAccountProfile() { return (await api('/account/profile')).json(); }
export async function getAccountAvatar() { return (await api('/account/avatar')).blob(); }
export async function saveAccountAvatar(file) {
  return (await api('/account/avatar', { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })).json();
}
export async function removeAccountAvatar() { return (await api('/account/avatar', { method: 'DELETE' })).json(); }
export async function changeAccountPassword(currentPassword, newPassword) {
  const credential = await (await api('/account/password-salt')).json();
  const [currentVerifier, next] = await Promise.all([
    makeLoginVerifier(currentPassword, credential.salt),
    makeRegistrationCredential(newPassword)
  ]);
  return (await api('/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentVerifier, ...next }) })).json();
}
async function prepareInitialData(session) {
  revision = session.revision;
  baseVault = validateVault(session.data);
  const [cached, ignoredDraft] = await Promise.all([
    draftOp('get', undefined, session.id).catch(() => null),
    draftOp('get', undefined, session.id, 'ignored').catch(() => null)
  ]);
  let ignored = ignoredDraft;
  const recovery = cached?.owner === session.id ? draftRecoveryState(cached, revision) : 'none';
  if (recovery === 'restore') {
    return { data: validateVault(cached.data), local: false, owner: session.id, username: session.username, restoreDraft: true, restoreConflict: false, ignoredDraft: !!ignored?.pending };
  }
  if (recovery === 'ask' || recovery === 'restore-conflict') {
    // Never load a stale full-vault snapshot over newer cloud data. Keep it in
    // the one-time recovery slot and start this session from the cloud version.
    await draftOp('put', { ...cached, owner: session.id, pending: true, conflictAcceptedCloudRevision: revision }, session.id, 'ignored');
    await draftOp('delete', undefined, session.id);
    ignored = cached;
  }
  return { data: validateVault(session.data), local: false, owner: session.id, username: session.username, ignoredDraft: !!ignored?.pending };
}
export async function bootstrap() {
  // Vite is an explicitly local development mode; production never falls back around authentication.
  if (DEV) {
    const cached = await draftOp('get').catch(() => null);
    const data = validateVault(cached?.data || { categories: [], noteTypes: undefined, notes: [], theme: 'light', pasteMode: 'rich' });
    baseVault = structuredClone(data);
    return { data, local: true };
  }
  const session = await (await api('/auth/session')).json();
  return prepareInitialData(session);
}
export async function restoreIgnoredDraft() {
  const cached = await draftOp('get', undefined, owner, 'ignored');
  if (!cached?.pending || cached.owner !== owner) throw Error('未找到此账号的本地草稿');
  const conflict = cached.revision !== revision;
  if (conflict) {
    const local = validateVault(cached.data);
    blocked = true; pending = structuredClone(local);
    syncConflict = { base:null, local:structuredClone(local), remote:structuredClone(baseVault), revision, origin:'ignoredDraft' };
    lastError = '旧版暂存内容与已保存版本不同；请先导出暂存内容，再载入已保存版本';
    listener(lastError);
    // Keep the recovery copy until the user exports both versions and explicitly
    // chooses the cloud copy. Production still makes no new local note-body writes.
  } else {
    blocked = false; lastError = ''; syncConflict = null; pending = structuredClone(cached.data);
    await draftOp('delete', undefined, owner, 'ignored');
  }
  return { data: validateVault(cached.data), conflict };
}
export async function reloadCloud() {
  if (DEV) {
    const cached = await draftOp('get');
    const data = validateVault(cached?.data || { categories: [], notes: [], theme: 'light', pasteMode: 'rich' });
    baseVault = structuredClone(data);
    return data;
  }
  const cloud = await (await api('/vault')).json();
  const resolvingIgnoredDraft = syncConflict?.origin === 'ignoredDraft';
  revision = cloud.revision; pending = null; blocked = false; lastError = ''; syncConflict = null;
  await draftOp('delete', undefined, owner);
  if (resolvingIgnoredDraft) await draftOp('delete', undefined, owner, 'ignored');
  listener(owner === 'local' ? '✓ 已载入本地预览数据库' : '✓ 已载入最新Docker 服务端版本');
  baseVault = validateVault(cloud.data);
  return structuredClone(baseVault);
}
let owner = 'local';
export function setOwner(value) { owner = value || 'local'; }
export function onStatus(fn) { listener = fn; if (blocked) fn(lastError); }
export function onAuthenticationRequired(fn) { authenticationListener = fn || (() => {}); }
export function onRemoteUpdate(fn) { remoteUpdateListener = fn || (() => {}); }
export function getSyncConflict() { return syncConflict ? structuredClone(syncConflict) : null; }
export async function exportSyncConflict() {
  if (!syncConflict) throw Error('当前没有待处理的Docker 服务端冲突');
  const stamp = new Date().toLocaleDateString('sv-SE');
  const files = {
    '本机版本/vault.json':strToU8(JSON.stringify({ version:2, exportedAt:new Date().toISOString(), ...syncConflict.local })),
    'Docker服务端版本/vault.json':strToU8(JSON.stringify({ version:2, exportedAt:new Date().toISOString(), ...syncConflict.remote })),
    'assets.json':strToU8(JSON.stringify(DEV ? [] : await (await api('/assets')).json()))
  };
  if (!DEV) {
    const assets = JSON.parse(strFromU8(files['assets.json']));
    for (const asset of assets) files[`assets/${asset.id}`] = new Uint8Array(await (await api(`/assets/${asset.id}`)).arrayBuffer());
  }
  download(new Blob([zipSync(files, { level:0 })], { type:'application/zip' }), `栖点-同步冲突对照-${stamp}.zip`);
  return true;
}
export async function refreshCloud(getLocalData = () => null) {
  if (DEV || owner === 'local' || refreshing || draining || blocked || requiresLogin || !baseVault) return false;
  refreshing = true;
  try {
    if (pending) {
      listener('网络恢复后正在自动重试Docker 服务端保存…');
      await drain();
      if (pending || blocked || requiresLogin || lastError) return false;
    }
    const current = await (await api('/vault/revision')).json();
    if (!Number.isSafeInteger(current.revision) || current.revision < 0 || current.revision === revision) return false;
    if (draining || blocked || requiresLogin) return false;
    const latest = await (await api('/vault')).json();
    if (!Number.isSafeInteger(latest.revision) || latest.revision < 0 || latest.revision === revision) return false;
    if (draining || blocked || requiresLogin) return false;
    const remote = validateVault(latest.data);
    const currentLocal = typeof getLocalData === 'function' ? getLocalData() : getLocalData;
    const local = validateVault(pending || currentLocal || baseVault);
    const merged = mergeVault(baseVault, local, remote);
    if (!merged) {
      pending = structuredClone(local);
      blocked = true;
      syncConflict = { base:structuredClone(baseVault), local:structuredClone(local), remote:structuredClone(remote), revision:latest.revision };
      lastError = '修改存在重叠；双方版本均已保留，可在设置中整理';
      listener(lastError);
      return false;
    }
    revision = latest.revision;
    baseVault = structuredClone(remote);
    if (JSON.stringify(merged) === JSON.stringify(remote)) {
      pending = null; blocked = false; lastError = ''; syncConflict = null;
      remoteUpdateListener(structuredClone(remote));
      listener('✓ 已载入最新保存内容');
      return true;
    }
    pending = merged; blocked = false; lastError = ''; syncConflict = null;
    listener('正在合并已保存的修改…');
    // Publish the merged in-memory view before awaiting the write so edits made
    // during the request include remote additions and cannot re-save a stale vault.
    remoteUpdateListener(structuredClone(merged));
    await drain();
    const saved = await flush();
    return saved;
  } catch (error) {
    if (error.status === 401) {
      blocked = true; requiresLogin = true;
      lastError = '登录状态已失效；请重新登录继续同步';
      listener(lastError); authenticationListener();
    }
    return false;
  } finally { refreshing = false; }
}
export function queueSave(data) {
  pending = structuredClone(data);
  if (blocked && syncConflict) syncConflict.local = structuredClone(data);
  listener(DEV ? '本地开发预览：正在保存到此设备…' : blocked ? lastError : '正在保存到 Docker 数据目录…');
  void drain();
}
export function retrySync() {
  if (requiresLogin) { authenticationListener(); return false; }
  if (!pending) return false;
  blocked = false;
  lastError = '';
  listener('正在重试 Docker 服务同步…');
  void drain();
  return true;
}
async function drain() {
  if (draining) return;
  draining = true;
  let mergeAttempts = 0;
  try {
    while (pending) {
      const snapshot = pending; pending = null;
      if (DEV) {
        await draftOp('put', { data: snapshot, revision, pending: false, owner }, owner);
        baseVault = structuredClone(snapshot); lastError = '';
        if (!pending) listener('✓ 已保存到此设备（开发模式）');
        continue;
      }
      if (blocked) { pending = snapshot; listener(lastError); break; }
      try {
        const result = await (await api('/vault', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, data: snapshot }) })).json();
        revision = result.revision; baseVault = structuredClone(snapshot); lastError = ''; syncConflict = null; mergeAttempts = 0;
        if (!pending) {
          // Clear a pre-cloud-version recovery copy only after the cloud confirms the write.
          await draftOp('delete', undefined, owner).catch(() => {});
          listener('✓ 已保存到 Docker 数据目录');
        }
      } catch (error) {
        const localVersion = pending || snapshot;
        if (error.status === 409 && mergeAttempts < 8) {
          mergeAttempts++;
          await new Promise(resolve => setTimeout(resolve, Math.min(25 * 2 ** (mergeAttempts - 1), 320)));
          try {
            const latest = await (await api('/vault')).json();
            const remote = validateVault(latest.data);
            const localVersion = pending || snapshot;
            const rebased = mergeVault(baseVault, localVersion, remote);
            if (!rebased) {
              blocked = true;
              syncConflict = { base:structuredClone(baseVault), local:structuredClone(localVersion), remote:structuredClone(remote), revision:latest.revision };
              lastError = '修改内容存在重叠；已保留双方版本，可在设置中整理';
            } else {
              revision = latest.revision; baseVault = structuredClone(remote); pending = rebased;
              listener('正在合并已保存的修改…');
              continue;
            }
          } catch (mergeError) {
            if (mergeError.status === 401) {
              blocked = true; requiresLogin = true; pending = localVersion;
              lastError = '登录状态已失效；本次修改仍保留在当前页面，请重新登录后继续同步';
              listener(lastError); authenticationListener();
            } else lastError = `检测到Docker 服务端版本变化，但读取最新版本失败：${mergeError.message || '请重试同步'}`;
          }
        } else if (error.status === 409) {
          lastError = '修改暂未写入；内容仍保留，请稍后重试';
        } else if (error.status === 401) {
          blocked = true; requiresLogin = true;
          lastError = '登录状态已失效；本次修改仍保留在当前页面，请重新登录后继续同步';
          listener(lastError);
          authenticationListener();
        } else {
          lastError = `${error.message || 'Docker 服务端保存失败'}；修改仍在当前页面，请保持页面打开并重试`;
        }
        listener(lastError);
        // Keep the newest unsaved version in memory; production never persists note bodies locally.
        if (!pending) pending = localVersion;
        break;
      }
    }
  } catch { lastError = '本地草稿保存失败，请立即导出；尚未同步'; listener(lastError); }
  finally { draining = false; }
}
export async function flush() {
  if (pending && !draining) await drain();
  while (draining) await new Promise(r => setTimeout(r, 40));
  return !blocked && !pending && !lastError;
}
export function hasUnsaved() { return draining || !!pending || blocked || !!lastError; }
export async function upload(file) {
  if (DEV) throw Error('文件上传需要启动本地 SQLite 完整预览；当前为界面开发模式');
  if (!file.size || file.size > 8 * 1024 * 1024) throw Error('单个文件须介于 1 字节与 8 MB 之间');
  return (await api('/assets', { method: 'POST', headers: { 'X-File-Name': encodeURIComponent(file.name.slice(0,200)), 'Content-Type': 'application/octet-stream' }, body: file })).json();
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function exportBackup(data) {
  await flush();
  const files = { 'vault.json': strToU8(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), ...data })) };
  const assets = DEV ? [] : await (await api('/assets')).json();
  files['assets.json'] = strToU8(JSON.stringify(assets));
  for (const asset of assets) files[`assets/${asset.id}`] = new Uint8Array(await (await api(`/assets/${asset.id}`)).arrayBuffer());
  // Store without compression: minimizes CPU/memory for already compressed images.
  download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `栖点-完整备份-${new Date().toLocaleDateString('sv-SE')}.zip`);
}
export async function exportHTML(note, sanitizedHTML) {
  const doc = new DOMParser().parseFromString(sanitizedHTML, 'text/html');
  for (const el of doc.querySelectorAll('img[src], a[href]')) {
    const attr = el.tagName === 'IMG' ? 'src' : 'href', raw = el.getAttribute(attr);
    if (!/^\/api\/assets\/[a-f0-9-]{36}(?:\?download=1)?$/.test(raw)) continue;
    const response = await api(raw.slice(4));
    const blob = await response.blob();
    const uri = await new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(el.tagName==='IMG'?blob:new Blob([blob],{type:'application/octet-stream'})); });
    el.setAttribute(attr, uri);
    if (el.tagName === 'A') { el.setAttribute('download',el.textContent.trim() || '附件'); el.removeAttribute('target'); }
  }
  const title = document.createElement('h1'); title.textContent = note.title;
  doc.body.prepend(title); doc.title = note.title;
  const meta = doc.createElement('meta');meta.setAttribute('charset','utf-8');doc.head.prepend(meta);
  const style = doc.createElement('style');style.textContent='body{max-width:900px;margin:40px auto;padding:0 24px;font:16px/1.8 system-ui;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}pre{overflow:auto;background:#f1f3f8;padding:16px}blockquote,.callout{background:#eef0ff;padding:12px}';doc.head.append(style);
  download(new Blob(['<!doctype html>'+doc.documentElement.outerHTML],{type:'text/html'}),note.title+'.html');
}
export async function readBackup(file) {
  if (file.size > 130 * 1024 * 1024) throw Error('备份文件过大');
  if (!file.name.toLowerCase().endsWith('.zip')) return validateVault(JSON.parse(await file.text()));
  // Reject unexpected entries and oversized zip entries before decompression.
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(entry) {
    if (!['vault.json','assets.json'].includes(entry.name) && !/^assets\/[a-f0-9-]{36}$/.test(entry.name)) throw Error('备份包含未知文件');
    total += entry.originalSize;
    if (entry.originalSize > 8 * 1024 * 1024 || total > 110 * 1024 * 1024) throw Error('备份解压大小超限');
    return true;
  } });
  if (!files['vault.json'] || !files['assets.json']) throw Error('备份结构不完整');
  const data = validateVault(JSON.parse(strFromU8(files['vault.json'])));
  const assets = JSON.parse(strFromU8(files['assets.json']));
  if (!Array.isArray(assets) || assets.length > 10000) throw Error('附件清单无效');
  if (assets.length && DEV) throw Error('含附件的备份须在 SQLite 完整预览模式导入');
  const existing = DEV ? [] : await (await api('/assets')).json();
  for (const asset of assets) {
    if (!/^[a-f0-9-]{36}$/.test(asset.id) || typeof asset.name !== 'string') throw Error('附件清单无效');
    const bytes = files[`assets/${asset.id}`];
    if (!bytes || bytes.byteLength !== asset.size) throw Error('备份附件缺失或长度不符');
    // Reuse only when contents match, including restores to a different database.
    const found = existing.find(a => a.id === asset.id && a.size === asset.size);
    let same = false;
    if (found) {
      const stored = new Uint8Array(await (await api(`/assets/${asset.id}`)).arrayBuffer());
      same = stored.length === bytes.length && stored.every((v, i) => v === bytes[i]);
    }
    if (same) continue;
    const created = await upload(new File([bytes], asset.name));
    for (const note of data.notes) note.body = note.body.replaceAll(`/api/assets/${asset.id}`, created.url);
  }
  return data;
}
export async function listBackups() { return DEV ? [] : (await api('/backups')).json(); }
export async function getBackup(id) { return (await (await api(`/backups/${id}`)).json()).data; }
window.addEventListener('online', () => { if (pending && !blocked) void drain(); });
