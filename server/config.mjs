import { isIP } from 'node:net';
import { resolve } from 'node:path';

export const QIDIAN_PORT = 9908;

function normalizeAddress(value) {
  return String(value).trim().replace(/^::ffff:/, '');
}

export function validateTrustedProxyConfig(trustProxy, trustedProxies = []) {
  const normalizedProxies = Array.isArray(trustedProxies)
    ? trustedProxies.map(normalizeAddress).filter(Boolean)
    : [];
  if (trustProxy && !normalizedProxies.length) {
    throw new Error('TRUSTED_PROXY_IPS must contain the direct reverse proxy IP when TRUST_PROXY=true');
  }
  if (trustProxy && (!Array.isArray(trustedProxies) || normalizedProxies.some(address => isIP(address) === 0))) {
    throw new Error('TRUSTED_PROXY_IPS contains an invalid IP address');
  }
  return Object.freeze({ trustProxy, trustedProxies: Object.freeze(normalizedProxies) });
}

export function readSelfHostedConfig(env = process.env) {
  const proxyConfig = validateTrustedProxyConfig(
    env.TRUST_PROXY === 'true',
    String(env.TRUSTED_PROXY_IPS || '').split(',')
  );

  return Object.freeze({
    dataDir: resolve(env.DATA_DIR || '/data'),
    staticDir: resolve(env.STATIC_DIR || '/app/dist'),
    migrationsDir: resolve(env.MIGRATIONS_DIR || '/app/migrations'),
    backupsDir: resolve(env.DATA_DIR || '/data', 'migration-backups'),
    host: env.HOST || '0.0.0.0',
    port: QIDIAN_PORT,
    registrationEnabled: env.REGISTRATION_ENABLED === 'true',
    ...proxyConfig,
    updateRequestDir: env.UPDATE_REQUEST_DIR || undefined,
    updateStatusDir: env.UPDATE_STATUS_DIR || undefined,
    qidianVersion: env.QIDIAN_VERSION || undefined
  });
}
