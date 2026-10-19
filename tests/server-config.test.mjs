import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { QIDIAN_PORT, readSelfHostedConfig, validateTrustedProxyConfig } from '../server/config.mjs';
import { createSelfHostedServer } from '../server/http-server.mjs';

test('self-hosted configuration fixes the service port and resolves explicit data paths', () => {
  const config = readSelfHostedConfig({
    DATA_DIR: 'D:/qidian-data',
    STATIC_DIR: 'D:/qidian/dist',
    MIGRATIONS_DIR: 'D:/qidian/migrations',
    HOST: '127.0.0.1',
    PORT: '1234'
  });

  assert.equal(QIDIAN_PORT, 9908);
  assert.equal(config.port, 9908);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.dataDir, resolve('D:/qidian-data'));
  assert.equal(config.staticDir, resolve('D:/qidian/dist'));
  assert.equal(config.migrationsDir, resolve('D:/qidian/migrations'));
  assert.equal(config.backupsDir, resolve('D:/qidian-data', 'migration-backups'));
  assert.equal(Object.isFrozen(config), true);
});

test('proxy forwarding is fail-closed when the trusted proxy list is absent or invalid', () => {
  assert.throws(() => readSelfHostedConfig({ TRUST_PROXY: 'true' }), /TRUSTED_PROXY_IPS/);
  assert.throws(() => readSelfHostedConfig({ TRUST_PROXY: 'true', TRUSTED_PROXY_IPS: 'proxy.local' }), /invalid IP address/);

  const config = readSelfHostedConfig({
    TRUST_PROXY: 'true',
    TRUSTED_PROXY_IPS: '127.0.0.1, ::ffff:192.168.1.2'
  });
  assert.deepEqual(config.trustedProxies, ['127.0.0.1', '192.168.1.2']);
  assert.equal(Object.isFrozen(config.trustedProxies), true);
  assert.throws(() => validateTrustedProxyConfig(true, []), /TRUSTED_PROXY_IPS/);
  assert.throws(() => createSelfHostedServer({ DB: {}, trustProxy: true }), /TRUSTED_PROXY_IPS/);
});
