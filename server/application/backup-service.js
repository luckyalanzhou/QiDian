import { HttpError, validateVault } from '../validation.js';
import { collectAssetReferences } from './asset-references.js';
import { createZip64StoreStream } from '../adapters/zip64-store-stream.mjs';

/** Coordinates account-scoped snapshot use cases independently of HTTP. */
export function createBackupService(repository, { now = Date.now } = {}) {
  async function list(db, accountId) {
    const { results } = await repository.listVaultSnapshots(db, accountId);
    return results;
  }

  async function create(db, accountId) {
    const snapshot = await repository.createCurrentVaultSnapshot(db, accountId, now());
    if (!snapshot) throw new HttpError(404, '知识库不存在');
    return snapshot;
  }

  async function read(db, accountId, revision) {
    const row = await repository.findVaultSnapshot(db, accountId, revision);
    if (!row) throw new HttpError(404, '备份不存在');
    return { revision: row.revision, data: validateVault(JSON.parse(row.data)) };
  }

  async function exportFull(db, accountId) {
    const current = await repository.findVault(db, accountId);
    if (!current) throw new HttpError(404, '知识库不存在');
    const data = validateVault(JSON.parse(current.data));
    const { results = [] } = await repository.listAccountAssets(db, accountId);
    const assets = results;
    if (assets.length > 10_000) throw new HttpError(413, '附件数量超过备份格式可处理范围');
    const availableAssetIds = new Set(assets.map(asset => String(asset.id).toLowerCase()));
    const missingAssetCount = [...collectAssetReferences(data)].filter(id => !availableAssetIds.has(id)).length;
    if (missingAssetCount) throw new HttpError(422, `完整备份中有 ${missingAssetCount} 个附件引用不可用，请检查附件后重试`);
    const exportedAt = new Date(now()).toISOString();
    const vaultBytes = new TextEncoder().encode(JSON.stringify({ version: 2, exportedAt, ...data }));
    const manifestBytes = new TextEncoder().encode(JSON.stringify(assets));
    const bufferStream = bytes => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    const assetStream = asset => {
      let ordinal = 0, sent = 0;
      return new ReadableStream({
        async pull(controller) {
          if (sent === asset.size) { controller.close(); return; }
          try {
            const row = await repository.getAccountAssetChunk(db, accountId, asset.id, ordinal);
            if (!row) throw new Error('附件数据不完整');
            const bytes = row.data instanceof Uint8Array ? row.data : row.data instanceof ArrayBuffer
              ? new Uint8Array(row.data) : new Uint8Array(row.data || []);
            const expected = Math.min(256 * 1024, asset.size - sent);
            if (bytes.byteLength !== expected) throw new Error('附件数据不完整');
            sent += bytes.byteLength;
            ordinal += 1;
            controller.enqueue(bytes);
            if (sent === asset.size) controller.close();
          } catch (error) { controller.error(error); }
        }
      });
    };
    const entries = [
      { name: 'vault.json', size: vaultBytes.byteLength, stream: bufferStream(vaultBytes) },
      ...assets.map(asset => ({ name: `assets/${asset.id}`, size: asset.size, stream: assetStream(asset) })),
      { name: 'assets.json', size: manifestBytes.byteLength, stream: bufferStream(manifestBytes) }
    ];
    return createZip64StoreStream(entries);
  }

  return { list, create, read, exportFull };
}
