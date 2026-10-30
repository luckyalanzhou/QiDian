import { HttpError } from '../validation.js';
import { ASSET_CHUNK_BYTES } from '../repositories/asset-repository.js';
import { collectAssetReferences } from './asset-references.js';

export const ASSET_PRUNE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const ASSET_PRUNE_BATCH_SIZE = 100;
const ASSET_REFERENCE_PAGE_SIZE = 500;
const ASSET_REFERENCE_SOURCES = ['notes', 'bookmarks', 'trash', 'snapshots'];
export const ASSET_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const ASSET_IMPORT_SCOPE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_CHUNKS = 16;
const MAX_IMPORT_CHUNK_BATCH_BYTES = ASSET_CHUNK_BYTES * MAX_PENDING_CHUNKS;
const MIME_PREFIX_BYTES = 12;

function detectMime(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(new TextDecoder().decode(bytes.slice(0, 6)))) return 'image/gif';
  if (new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
  return 'application/octet-stream';
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value || []);
}

/** Coordinates account-scoped attachment use cases with bounded-memory chunk IO. */
export function createAssetService(repository, { now = Date.now, createId = () => crypto.randomUUID() } = {}) {
  async function expireImportScopes(db, accountId) {
    if (!repository.findExpiredAccountAssetImportScopes || !repository.abortAccountAssetImportScope) return;
    const cutoff = now() - ASSET_IMPORT_SCOPE_TTL_MS;
    const { results = [] } = await repository.findExpiredAccountAssetImportScopes(db, accountId, cutoff);
    for (const { id } of results) {
      await repository.abortAccountAssetImportScope(db, { accountId, id, updated: now(), olderThan: cutoff });
    }
  }

  async function pruneOrphanedAssets(db, accountId, cutoff) {
    if (!repository.findAccountAssetPruneRevision || !repository.listAccountAssetReferencePage ||
      !repository.findExpiredAccountAssetCandidates) return { removed:0, bytes:0 };
    const firstCandidates = await repository.findExpiredAccountAssetCandidates(
      db, accountId, cutoff, '', ASSET_PRUNE_BATCH_SIZE
    );
    if (!firstCandidates.results?.length) return { removed:0, bytes:0 };
    const initialRevision = await repository.findAccountAssetPruneRevision(db, accountId);
    if (!Number.isSafeInteger(initialRevision?.revision)) return { removed:0, bytes:0 };
    const references = new Set();
    for (const source of ASSET_REFERENCE_SOURCES) {
      let cursor = '';
      for (;;) {
        const { results = [] } = await repository.listAccountAssetReferencePage(
          db, accountId, source, cursor, ASSET_REFERENCE_PAGE_SIZE
        );
        for (const row of results) collectAssetReferences(row.data, references);
        if (results.length < ASSET_REFERENCE_PAGE_SIZE) break;
        cursor = String(results[results.length - 1].id);
      }
    }
    const scannedRevision = await repository.findAccountAssetPruneRevision(db, accountId);
    if (scannedRevision?.revision !== initialRevision.revision) return { removed:0, bytes:0 };

    let afterId = '', removed = 0, bytes = 0, candidates = firstCandidates;
    for (;;) {
      const { results = [] } = candidates;
      if (!results.length) break;
      const ids = results.filter(asset => !references.has(String(asset.id).toLowerCase())).map(asset => asset.id);
      const deleted = new Set(await repository.deleteAccountAssets(db, accountId, ids, cutoff, initialRevision.revision));
      for (const asset of results) {
        if (!deleted.has(asset.id)) continue;
        removed += 1;
        bytes += Number(asset.size || 0);
      }
      afterId = String(results[results.length - 1].id);
      if (ids.length && deleted.size === 0) break;
      candidates = await repository.findExpiredAccountAssetCandidates(
        db, accountId, cutoff, afterId, ASSET_PRUNE_BATCH_SIZE
      );
    }
    return { removed, bytes };
  }

  async function list(db, accountId) {
    await repository.deleteExpiredAccountAssetUploads(db, accountId, now() - ASSET_UPLOAD_TTL_MS);
    await expireImportScopes(db, accountId);
    const { results } = await repository.listAccountAssets(db, accountId);
    return results;
  }

  async function cleanupExpiredUploads(db) {
    const { results:accounts = [] } = await repository.listAssetAccountIds(db);
    const currentTime = now();
    const uploadCutoff = currentTime - ASSET_UPLOAD_TTL_MS;
    const importScopeCutoff = currentTime - ASSET_IMPORT_SCOPE_TTL_MS;
    const summary = { accountsScanned:accounts.length, importScopesExpired:0, importAssetsRemoved:0, uploadsRemoved:0, assetsRemoved:0, assetBytesRemoved:0 };
    const failures = [];

    for (const { accountId } of accounts) {
      try {
        const { results:scopes = [] } = await repository.findExpiredAccountAssetImportScopes(db, accountId, importScopeCutoff);
        for (const { id } of scopes) {
          const results = await repository.abortAccountAssetImportScope(db, {
            accountId, id, updated:currentTime, olderThan:importScopeCutoff
          });
          summary.importScopesExpired += Number(results?.[0]?.meta?.changes || 0);
          summary.importAssetsRemoved += Number(results?.[2]?.meta?.changes || 0);
        }
        const removed = await repository.deleteExpiredAccountAssetUploads(db, accountId, uploadCutoff);
        summary.uploadsRemoved += Number(removed?.meta?.changes || 0);
        const pruned = await pruneOrphanedAssets(db, accountId, currentTime - ASSET_PRUNE_GRACE_MS);
        summary.assetsRemoved += pruned.removed;
        summary.assetBytesRemoved += pruned.bytes;
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length) {
      const error = new AggregateError(failures, `Expired attachment cleanup failed for ${failures.length} account(s)`);
      error.cleanupSummary = summary;
      throw error;
    }
    return summary;
  }

  async function create(db, accountId, name, stream, importScopeId = null) {
    if (typeof name !== 'string' || !name || name.length > 200) throw new HttpError(400, '文件名太长');
    if (importScopeId && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(importScopeId)) {
      throw new HttpError(400, '附件导入作用域无效');
    }
    const reader = stream?.getReader?.();
    if (!reader) throw new HttpError(400, '文件为空');

    const id = createId(), created = now();
    let size = 0;
    let ordinal = 0;
    let buffered = 0;
    let chunk = new Uint8Array(ASSET_CHUNK_BYTES);
    const prefix = new Uint8Array(MIME_PREFIX_BYTES);
    let prefixSize = 0;
    let pending = [];

    async function flushChunk() {
      pending.push({ ordinal: ordinal++, bytes: chunk.slice(0, buffered) });
      buffered = 0;
      chunk = new Uint8Array(ASSET_CHUNK_BYTES);
      if (pending.length >= MAX_PENDING_CHUNKS) {
        await repository.appendAccountAssetUploadChunks(db, accountId, id, pending, now(), importScopeId);
        pending = [];
      }
    }

    try {
      await repository.deleteExpiredAccountAssetUploads(db, accountId, created - ASSET_UPLOAD_TTL_MS);
      if (importScopeId) await expireImportScopes(db, accountId);
      const begun = await repository.beginAccountAssetUpload(db, {
        accountId, id, name, created, ...(importScopeId ? { importScopeId } : {})
      });
      if (importScopeId && Number(begun?.meta?.changes || 0) !== 1) throw new HttpError(404, '附件导入作用域不存在或已结束');
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const bytes = asBytes(value);
        if (!bytes.length) continue;
        size += bytes.length;
        if (!Number.isSafeInteger(size)) throw new HttpError(413, '文件超出当前运行环境可处理的大小');
        if (prefixSize < MIME_PREFIX_BYTES) {
          const count = Math.min(MIME_PREFIX_BYTES - prefixSize, bytes.length);
          prefix.set(bytes.subarray(0, count), prefixSize);
          prefixSize += count;
        }

        let offset = 0;
        while (offset < bytes.length) {
          const count = Math.min(ASSET_CHUNK_BYTES - buffered, bytes.length - offset);
          chunk.set(bytes.subarray(offset, offset + count), buffered);
          buffered += count;
          offset += count;
          if (buffered === ASSET_CHUNK_BYTES) await flushChunk();
        }
      }
      if (!size) throw new HttpError(400, '文件为空');
      if (buffered) await flushChunk();
      if (pending.length) await repository.appendAccountAssetUploadChunks(db, accountId, id, pending, now(), importScopeId);

      const mime = detectMime(prefix.subarray(0, prefixSize));
      await repository.finalizeAccountAssetUpload(db, {
        accountId, id, name, mime, size, created, ...(importScopeId ? { importScopeId } : {})
      });
      return { id, name, mime, size, created };
    } catch (error) {
      await reader.cancel().catch(() => {});
      await repository.deleteAccountAssetUpload(db, accountId, id).catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  async function prune(db, accountId) {
    await expireImportScopes(db, accountId);
    const cutoff = now() - ASSET_PRUNE_GRACE_MS;
    return pruneOrphanedAssets(db, accountId, cutoff);
  }

  async function read(db, accountId, id) {
    await expireImportScopes(db, accountId);
    const metadata = await repository.findAccountAsset(db, accountId, id);
    if (!metadata) throw new HttpError(404, '附件不存在');
    if (!Number.isSafeInteger(metadata.size) || metadata.size < 1) throw new HttpError(500, '附件数据不完整');

    let ordinal = 0;
    let sent = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        if (sent === metadata.size) {
          controller.close();
          return;
        }
        try {
          const row = await repository.getAccountAssetChunk(db, accountId, id, ordinal);
          if (!row) throw new HttpError(500, '附件数据不完整');
          const bytes = asBytes(row.data);
          const expected = Math.min(ASSET_CHUNK_BYTES, metadata.size - sent);
          if (bytes.byteLength !== expected) throw new HttpError(500, '附件数据不完整');
          sent += bytes.byteLength;
          ordinal += 1;
          controller.enqueue(bytes);
          if (sent === metadata.size) controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
    return { stream, mime: metadata.mime, name: metadata.name, size: metadata.size };
  }

  async function createImportScope(db, accountId) {
    await expireImportScopes(db, accountId);
    const id = createId(), created = now();
    await repository.createAccountAssetImportScope(db, { accountId, id, created });
    const scope = await repository.findAccountAssetImportScope(db, accountId, id);
    if (!scope) throw new HttpError(500, '无法创建附件导入作用域');
    return scope;
  }

  async function readImportScope(db, accountId, id) {
    await expireImportScopes(db, accountId);
    const scope = await repository.findAccountAssetImportScope(db, accountId, id);
    if (!scope) throw new HttpError(404, '附件导入作用域不存在');
    return scope;
  }

  async function beginImportAssetUpload(db, accountId, scopeId, name, size) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(scopeId || '')) {
      throw new HttpError(400, '附件导入作用域无效');
    }
    if (typeof name !== 'string' || !name || name.length > 200) throw new HttpError(400, '文件名太长');
    if (!Number.isSafeInteger(size) || size < 1) throw new HttpError(400, '附件大小无效');
    await expireImportScopes(db, accountId);
    const id = createId(), created = now();
    const result = await repository.beginAccountAssetImportUpload(db, { accountId, id, name, size, created, importScopeId: scopeId });
    if (Number(result?.meta?.changes || 0) !== 1) throw new HttpError(404, '附件导入作用域不存在或已结束');
    return { id, name, size };
  }

  async function appendImportAssetChunkBatch(db, accountId, scopeId, id, startOrdinal, stream) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(scopeId || '') ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id || '')) {
      throw new HttpError(400, '附件导入标识无效');
    }
    if (!Number.isSafeInteger(startOrdinal) || startOrdinal < 0) throw new HttpError(400, '附件分块位置无效');
    const upload = await repository.findAccountAssetImportUpload(db, accountId, id, scopeId);
    if (!upload) throw new HttpError(404, '附件导入上传不存在或已结束');
    const reader = stream?.getReader?.();
    if (!reader) throw new HttpError(400, '附件分块为空');
    const chunks = [];
    let bytesInRequest = 0, ordinal = startOrdinal, buffered = 0;
    let chunk = new Uint8Array(ASSET_CHUNK_BYTES);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const bytes = asBytes(value);
        bytesInRequest += bytes.byteLength;
        if (bytesInRequest > MAX_IMPORT_CHUNK_BATCH_BYTES) throw new HttpError(413, '单次分块请求过大');
        let offset = 0;
        while (offset < bytes.byteLength) {
          const expected = Math.min(ASSET_CHUNK_BYTES, upload.size - ordinal * ASSET_CHUNK_BYTES);
          if (expected <= 0) throw new HttpError(400, '附件分块超出声明大小');
          const count = Math.min(expected - buffered, bytes.byteLength - offset);
          chunk.set(bytes.subarray(offset, offset + count), buffered);
          buffered += count;
          offset += count;
          if (buffered === expected) {
            chunks.push({ ordinal, bytes: chunk.slice(0, buffered) });
            ordinal += 1;
            buffered = 0;
            chunk = new Uint8Array(ASSET_CHUNK_BYTES);
            if (chunks.length > MAX_PENDING_CHUNKS) throw new HttpError(413, '单次分块请求过大');
          }
        }
      }
      if (!bytesInRequest || buffered || chunks.length === 0) throw new HttpError(400, '附件分块长度无效');
      try {
        await repository.appendAccountAssetImportChunks(db, accountId, id, chunks, now(), scopeId);
      } catch (error) {
        if (/conflicts with an earlier attempt/i.test(String(error?.message))) throw new HttpError(409, '附件分块与已有上传内容冲突');
        if (/invalid range/i.test(String(error?.message))) throw new HttpError(400, '附件分块范围无效');
        throw error;
      }
      return { id, chunks: chunks.length, bytes: bytesInRequest };
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  async function completeImportAssetUpload(db, accountId, scopeId, id) {
    const upload = await repository.findAccountAssetImportUpload(db, accountId, id, scopeId);
    if (!upload) throw new HttpError(404, '附件导入上传不存在或已结束');
    const first = await repository.getAccountAssetChunk(db, accountId, id, 0);
    if (!first) throw new HttpError(400, '附件数据不完整');
    const prefix = asBytes(first.data).subarray(0, MIME_PREFIX_BYTES);
    const mime = detectMime(prefix), created = now();
    await repository.finalizeAccountAssetUpload(db, {
      accountId, id, name: upload.name, mime, size: upload.size, created, importScopeId: scopeId
    });
    return { id, name: upload.name, mime, size: upload.size, created, url: `/api/assets/${id}` };
  }

  async function abortImportScope(db, accountId, id) {
    const scope = await repository.findAccountAssetImportScope(db, accountId, id);
    if (!scope) throw new HttpError(404, '附件导入作用域不存在');
    if (scope.status === 'staging') await repository.abortAccountAssetImportScope(db, { accountId, id, updated: now() });
    return readImportScope(db, accountId, id);
  }

  return { list, create, cleanupExpiredUploads, prune, read, createImportScope, readImportScope, abortImportScope,
    beginImportAssetUpload, appendImportAssetChunkBatch, completeImportAssetUpload };
}
