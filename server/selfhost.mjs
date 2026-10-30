import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readSelfHostedConfig, QIDIAN_PORT } from './config.mjs';
import { openSelfHostedDatabase } from './sqlite-migrations.mjs';
import { createSelfHostedServer } from './http-server.mjs';
import { loadOrCreateTotpEncryptionKey } from './totp-key.mjs';
import * as assetRepository from './repositories/asset-repository.js';
import { createAssetService } from './application/asset-service.js';

export { QIDIAN_PORT };

export const ASSET_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startAssetCleanupScheduler(cleanup, {
  intervalMs = ASSET_CLEANUP_INTERVAL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  onError = error => console.error('Expired attachment cleanup failed', error)
} = {}) {
  let stopped = false;
  let inFlight = null;

  const run = () => {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(cleanup).catch(error => {
      try { onError(error); } catch {}
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
  const timer = setIntervalFn(() => { void run(); }, intervalMs);
  timer?.unref?.();
  void run();

  return async () => {
    if (!stopped) {
      stopped = true;
      clearIntervalFn(timer);
    }
    if (inFlight) await inFlight;
  };
}

async function main() {
  const config = readSelfHostedConfig();
  const DB = await openSelfHostedDatabase({
    databasePath: resolve(config.dataDir, 'qidian.sqlite'),
    migrationsDir: config.migrationsDir,
    backupsDir: config.backupsDir
  });
  const server = createSelfHostedServer({
    DB,
    root: config.staticDir,
    storagePath: config.dataDir,
    getTotpEncryptionKey: () => loadOrCreateTotpEncryptionKey(config.dataDir),
    registrationEnabled: config.registrationEnabled,
    trustProxy: config.trustProxy,
    trustedProxies: config.trustedProxies,
    updateRequestDir: config.updateRequestDir,
    updateStatusDir: config.updateStatusDir,
    qidianVersion: config.qidianVersion
  });
  const assetService = createAssetService(assetRepository);
  let stopAssetCleanup = async () => {};
  let shuttingDown = false;
  server.listen(config.port, config.host, () => {
    console.log('Qidian self-hosted server listening on ' + config.host + ':' + config.port);
    if (!shuttingDown) stopAssetCleanup = startAssetCleanupScheduler(() => assetService.cleanupExpiredUploads(DB));
  });
  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('Received ' + signal + '; closing the server');
    server.close(async () => {
      await stopAssetCleanup();
      DB.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
