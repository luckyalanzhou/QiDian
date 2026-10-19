import { createBackupArchive, parseBackupArchive, type BackupAssetMetadata, type BackupArchiveAsset } from './backup-archive.ts';

type BackupVault = { notes: Array<{ body: string; [key: string]: unknown }>; [key: string]: unknown };
type BackupFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;
type BackupServiceAsset = BackupAssetMetadata;

export type BackupDataServiceDependencies<TVault extends BackupVault> = {
  dev: boolean;
  getRevision: () => number;
  flush: () => Promise<boolean>;
  getLastError: () => string;
  listAssets: () => Promise<BackupServiceAsset[]>;
  getAssetResponse: (id: string) => Promise<Response>;
  upload: (file: File) => Promise<{ url: string }>;
  validateVault: (value: unknown) => TVault;
  download: (blob: Blob, name: string) => void;
  listSnapshots: () => Promise<unknown>;
  createSnapshot: () => Promise<unknown>;
  getSnapshot: (id: string | number) => Promise<{ data: unknown }>;
  now?: () => number;
  date?: () => string;
};

export function createBackupDataService<TVault extends BackupVault>(dependencies: BackupDataServiceDependencies<TVault>) {
  async function exportBackup(data: TVault) {
    if (!await dependencies.flush()) throw Error(dependencies.getLastError() || '当前修改尚未写入 Docker 服务端，暂不能生成一致备份');
    const metadata = dependencies.dev ? [] : await dependencies.listAssets();
    const assets: BackupArchiveAsset[] = [];
    for (const asset of metadata) {
      const bytes = new Uint8Array(await (await dependencies.getAssetResponse(asset.id)).arrayBuffer());
      assets.push({ ...asset, bytes });
    }
    const archive = createBackupArchive(data, assets);
    const date = dependencies.date?.() || new Date().toLocaleDateString('sv-SE');
    const blobBytes = new ArrayBuffer(archive.byteLength);
    new Uint8Array(blobBytes).set(archive);
    dependencies.download(new Blob([blobBytes], { type: 'application/zip' }), `栖点-完整备份-${date}.zip`);
  }

  async function readBackup(file: BackupFile): Promise<TVault> {
    if (file.size > 130 * 1024 * 1024) throw Error('备份文件过大');
    const { data, assets, assetBytes } = parseBackupArchive(file.name, new Uint8Array(await file.arrayBuffer()), dependencies.validateVault);
    if (assets.length && dependencies.dev) throw Error('含附件的备份须在 SQLite 完整预览模式导入');
    const existing = dependencies.dev ? [] : await dependencies.listAssets();
    for (const asset of assets) {
      const bytes = assetBytes[asset.id];
      const found = existing.find(item => item.id === asset.id && item.size === asset.size);
      let same = false;
      if (found) {
        const stored = new Uint8Array(await (await dependencies.getAssetResponse(asset.id)).arrayBuffer());
        same = stored.length === bytes.length && stored.every((value, index) => value === bytes[index]);
      }
      if (same) continue;
      const fileBytes = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(fileBytes).set(bytes);
      const created = await dependencies.upload(new File([fileBytes], asset.name));
      for (const note of data.notes) note.body = note.body.replaceAll(`/api/assets/${asset.id}`, created.url);
    }
    return data;
  }

  async function createBackupSnapshot() {
    if (dependencies.dev) return { revision: dependencies.getRevision(), created: dependencies.now?.() ?? Date.now() };
    return dependencies.createSnapshot();
  }

  async function getBackup(id: string | number) {
    return (await dependencies.getSnapshot(id)).data;
  }

  return {
    exportBackup,
    readBackup,
    listBackups: () => dependencies.dev ? Promise.resolve([]) : dependencies.listSnapshots(),
    createBackupSnapshot,
    getBackup
  };
}
