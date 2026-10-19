import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type BackupAssetMetadata = {
  id: string;
  name: string;
  size: number;
  [key: string]: unknown;
};

export type BackupArchiveAsset = BackupAssetMetadata & { bytes: Uint8Array };

export type ParsedBackupArchive<T> = {
  data: T;
  assets: BackupAssetMetadata[];
  assetBytes: Record<string, Uint8Array>;
};

const ASSET_ID = /^[a-f0-9-]{36}$/;
const MAX_FILE_BYTES = 130 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 110 * 1024 * 1024;

export function createBackupArchive(data: unknown, assets: BackupArchiveAsset[], exportedAt = new Date().toISOString()) {
  const files: Record<string, Uint8Array> = {
    'vault.json': strToU8(JSON.stringify({ version: 2, exportedAt, ...(data as object) }))
  };
  const manifest: BackupAssetMetadata[] = [];

  for (const asset of assets) {
    if (!ASSET_ID.test(asset.id) || typeof asset.name !== 'string' || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_ENTRY_BYTES) {
      throw Error('附件清单无效');
    }
    if (!(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength !== asset.size) throw Error('附件数据不完整');
    const { bytes, ...metadata } = asset;
    manifest.push(metadata);
    files[`assets/${asset.id}`] = bytes;
  }

  files['assets.json'] = strToU8(JSON.stringify(manifest));
  // Store without compression: minimizes CPU/memory for already compressed images.
  return zipSync(files, { level: 0 });
}

export function parseBackupArchive<T>(filename: string, bytes: Uint8Array, validateVault: (value: unknown) => T): ParsedBackupArchive<T> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw Error('备份文件过大');
  if (!filename.toLowerCase().endsWith('.zip')) {
    return { data: validateVault(JSON.parse(strFromU8(bytes))), assets: [], assetBytes: {} };
  }

  // Check entry names and declared sizes before decompression to reject unexpected paths and zip bombs.
  let total = 0;
  const files = unzipSync(bytes, { filter(entry) {
    if (!['vault.json', 'assets.json'].includes(entry.name) && !/^assets\/[a-f0-9-]{36}$/.test(entry.name)) throw Error('备份包含未知文件');
    total += entry.originalSize;
    if (entry.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) throw Error('备份解压大小超限');
    return true;
  } });

  if (!files['vault.json'] || !files['assets.json']) throw Error('备份结构不完整');
  const data = validateVault(JSON.parse(strFromU8(files['vault.json'])));
  const parsedManifest: unknown = JSON.parse(strFromU8(files['assets.json']));
  if (!Array.isArray(parsedManifest) || parsedManifest.length > 10000) throw Error('附件清单无效');

  const assets: BackupAssetMetadata[] = [];
  const assetBytes: Record<string, Uint8Array> = {};
  const seen = new Set<string>();
  for (const value of parsedManifest) {
    if (!value || typeof value !== 'object') throw Error('附件清单无效');
    const asset = value as Partial<BackupAssetMetadata>;
    if (typeof asset.id !== 'string' || !ASSET_ID.test(asset.id) || typeof asset.name !== 'string' ||
      !Number.isSafeInteger(asset.size) || (asset.size as number) < 1 || (asset.size as number) > MAX_ENTRY_BYTES || seen.has(asset.id)) {
      throw Error('附件清单无效');
    }
    const content = files[`assets/${asset.id}`];
    if (!content || content.byteLength !== asset.size) throw Error('备份附件缺失或长度不符');
    seen.add(asset.id);
    assets.push(asset as BackupAssetMetadata);
    assetBytes[asset.id] = content;
  }

  return { data, assets, assetBytes };
}
