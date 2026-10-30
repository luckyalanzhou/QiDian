import { strToU8, zipSync } from 'fflate';

type SyncConflictExportDependencies = {
  getConflict: () => { local: Record<string, unknown>; remote: Record<string, unknown> } | null;
  dev: boolean;
  listAssets: () => Promise<Array<{ id: string }>>;
  getAssetResponse: (id: string) => Promise<Response>;
  download: (blob: Blob, name: string) => void;
  now?: () => Date;
};

export function createSyncConflictExportService(dependencies: SyncConflictExportDependencies) {
  async function exportSyncConflict(): Promise<true> {
    const conflict = dependencies.getConflict();
    if (!conflict) throw new Error('当前没有待处理的 Docker 服务端冲突');

    const timestamp = (dependencies.now ?? (() => new Date()))();
    const assets = dependencies.dev ? [] : await dependencies.listAssets();
    const files: Record<string, Uint8Array> = {
      '本机版本/vault.json': strToU8(JSON.stringify({ version: 2, exportedAt: timestamp.toISOString(), ...conflict.local })),
      'Docker服务端版本/vault.json': strToU8(JSON.stringify({ version: 2, exportedAt: timestamp.toISOString(), ...conflict.remote })),
      'assets.json': strToU8(JSON.stringify(assets))
    };

    for (const asset of assets) {
      files[`assets/${asset.id}`] = new Uint8Array(await (await dependencies.getAssetResponse(asset.id)).arrayBuffer());
    }

    dependencies.download(
      new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }),
      `栖点-同步冲突对照-${timestamp.toLocaleDateString('sv-SE')}.zip`
    );
    return true;
  }

  return { exportSyncConflict };
}
