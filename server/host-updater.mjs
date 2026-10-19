import { access, mkdir, open, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function queueQidianUpdate(requestDir, statusDir) {
  if (!requestDir) return false;
  if (statusDir) {
    const status = await readQidianUpdateStatus(statusDir, requestDir);
    if (status.state === 'queued' || status.state === 'running') return false;
  }
  await mkdir(requestDir, { recursive: true });
  let handle;
  try {
    handle = await open(join(requestDir, 'update-request'), 'wx', 0o600);
    await handle.writeFile('update\n', 'utf8');
    await handle.sync();
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function qidianUpdaterReady(statusDir) {
  if (!statusDir) return false;
  try { await access(join(statusDir, 'update-agent-ready')); return true; } catch { return false; }
}

export async function readQidianUpdateStatus(statusDir, requestDir) {
  if (!statusDir) throw Object.assign(new Error('设备更新服务尚未安装'), { status: 503 });
  const ready = await qidianUpdaterReady(statusDir);
  let state = ready ? 'idle' : 'unavailable', version = '', updatedAt = null, hasSavedState = false;
  try {
    const fields = (await readFile(join(statusDir, 'update-status'), 'utf8')).trimEnd().split('\t');
    if (['idle', 'queued', 'running', 'success', 'failed'].includes(fields[0])) {
      state = fields[0];
      hasSavedState = true;
    }
    version = /^\d+\.\d+\.\d+$/.test(fields[1] || '') ? fields[1] : '';
    updatedAt = Number.isSafeInteger(Number(fields[2])) ? Number(fields[2]) * 1000 : null;
  } catch {}
  let pendingRequest = false;
  try {
    await stat(join(requestDir, 'update-request'));
    if (!['queued', 'running'].includes(state)) {
      pendingRequest = true;
      state = 'queued';
      version = '';
      updatedAt = null;
    }
  } catch {}
  if (!ready && (!hasSavedState || state === 'idle') && state !== 'queued') state = 'unavailable';
  let log = '';
  let logUpdatedAt = null;
  let logHandle;
  try {
    logHandle = await open(join(statusDir, 'update.log'), 'r');
    const info = await logHandle.stat(), length = Math.min(info.size, 65536);
    logUpdatedAt = info.mtimeMs;
    const content = Buffer.alloc(length);
    const { bytesRead } = await logHandle.read(content, 0, length, Math.max(0, info.size - length));
    log = content.subarray(0, bytesRead).toString('utf8');
  } catch {} finally { await logHandle?.close().catch(() => {}); }
  return { state, version, updatedAt, logUpdatedAt:pendingRequest ? null : logUpdatedAt, log:pendingRequest ? '' : log };
}
