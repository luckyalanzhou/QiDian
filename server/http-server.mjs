import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { readFileSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { validateTrustedProxyConfig } from './config.mjs';
import { handle } from './api.js';
import { qidianUpdaterReady, queueQidianUpdate, readQidianUpdateStatus } from './host-updater.mjs';
import { readStorageCapacity } from './storage-capacity.mjs';

const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HOP_BY_HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function normalizedAddress(value='') { return String(value).trim().replace(/^::ffff:/i,'').toLowerCase(); }
function proxyIsTrusted(request, trustProxy, trustedProxies=[]) {
  if (!trustProxy || !trustedProxies.length) return false;
  return trustedProxies.map(normalizedAddress).includes(normalizedAddress(request.socket.remoteAddress));
}

function externalOrigin(request, trustProxy, trustedProxies) {
  const trusted = proxyIsTrusted(request, trustProxy, trustedProxies);
  const forwardedProto = trusted ? request.headers['x-forwarded-proto'] : undefined;
  const forwardedHost = trusted ? request.headers['x-forwarded-host'] : undefined;
  const protoValue = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const hostValue = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const protocol = (typeof protoValue === 'string' ? protoValue : '').split(',')[0].trim()
    || (request.socket.encrypted ? 'https' : 'http');
  const host = (typeof hostValue === 'string' ? hostValue : '').split(',')[0].trim()
    || request.headers.host;
  if (!host || !['http', 'https'].includes(protocol)) throw new Error('A valid Host header is required');
  return `${protocol}://${host}`;
}

function forwardedClientIp(request, trustProxy, trustedProxies) {
  if (proxyIsTrusted(request, trustProxy, trustedProxies)) {
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof forwardedValue === 'string') {
      const trusted = new Set(trustedProxies.map(normalizedAddress));
      const chain = forwardedValue.split(',').map(normalizedAddress);
      for (let index = chain.length - 1; index >= 0; index -= 1) {
        const candidate = chain[index];
        if (!candidate || candidate.length > 128 || isIP(candidate) === 0) break;
        if (!trusted.has(candidate)) return candidate;
      }
    }
  }
  return request.socket.remoteAddress || 'unknown-client';
}

function writeHead(response, statusCode, headers = {}) {
  response.writeHead(statusCode, { ...headers, ...SECURITY_HEADERS });
}

function prepareResponseForIncompleteRequest(statusCode, incoming, outgoing, responseHeaders) {
  if (incoming.complete) return false;
  if (statusCode === 413) {
    outgoing.shouldKeepAlive = true;
    responseHeaders.Connection = 'keep-alive';
    return true;
  }
  outgoing.shouldKeepAlive = false;
  responseHeaders.Connection = 'close';
  return false;
}

function drainRejectedRequest(incoming) {
  if (incoming.complete || incoming.destroyed) return;
  const timeout = setTimeout(() => {
    if (!incoming.complete && !incoming.destroyed) incoming.destroy();
  }, 5_000);
  timeout.unref?.();
  const cleanup = () => clearTimeout(timeout);
  incoming.once('end', cleanup);
  incoming.once('close', cleanup);
  incoming.resume();
}

function safeStaticPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded === '/' ? '/index.html' : decoded;
  const path = resolve(root, `.${relative}`);
  return path === root || path.startsWith(`${root}${sep}`) ? path : null;
}

export function isImmutableStaticAsset(path) {
  const segments = String(path).split(/[\\/]/);
  const filename = segments.at(-1) || '';
  return segments.includes('assets') && /(?:^|[.-])[A-Za-z0-9_-]{8,}(?=[.-])/.test(filename);
}

export function createSelfHostedServer({ DB, root = resolve('dist'), storagePath, getStorageCapacity, registrationEnabled = false, trustProxy = false, trustedProxies = [],
  updateRequestDir, updateStatusDir, getTotpEncryptionKey, qidianVersion = PACKAGE_VERSION || '0.0.0', fetchRelease = globalThis.fetch } = {}) {
  if (!DB) throw new Error('A configured SQLite database is required before serving requests');
  ({ trustProxy, trustedProxies } = validateTrustedProxyConfig(trustProxy, trustedProxies));
  const staticRoot = resolve(root);
  const storageCapacityReader = getStorageCapacity || (storagePath ? () => readStorageCapacity(storagePath) : undefined);
  const handler = async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url || '/', externalOrigin(incoming, trustProxy, trustedProxies));
      if (url.pathname === '/healthz' && incoming.method === 'GET') {
        writeHead(outgoing, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        outgoing.end('ok');
        return;
      }
      if (url.pathname === '/readyz' && incoming.method === 'GET') {
        const ready = await DB.prepare('SELECT 1 AS ready').first();
        if (ready?.ready !== 1) throw new Error('Database readiness check failed');
        writeHead(outgoing, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        outgoing.end('ready');
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        const body = ['GET', 'HEAD'].includes(incoming.method || 'GET')
          ? undefined
          : Readable.toWeb(incoming);
        const headers = new Headers();
        for (const [name, raw] of Object.entries(incoming.headers)) {
          const key = name.toLowerCase();
          if (HOP_BY_HOP_HEADERS.has(key) || raw === undefined) continue;
          headers.set(key, Array.isArray(raw) ? raw.join(', ') : String(raw));
        }
        headers.set('X-Client-IP', forwardedClientIp(incoming, trustProxy, trustedProxies));
        const request = new Request(url, {
          method: incoming.method || 'GET', headers,
          ...(body ? { body, duplex: 'half' } : {})
        });
        const response = await handle(request, {
          DB,
          SELF_HOSTED: 'true',
          REGISTRATION_ENABLED: registrationEnabled ? 'true' : 'false',
          QIDIAN_VERSION: qidianVersion,
          fetchRelease,
          ...(getTotpEncryptionKey ? { getTotpEncryptionKey } : {}),
          ...(storageCapacityReader ? { readStorageCapacity: storageCapacityReader } : {}),
          ...(updateRequestDir && updateStatusDir ? {
            requestQidianUpdate: () => queueQidianUpdate(updateRequestDir, updateStatusDir),
            readQidianUpdateStatus: () => readQidianUpdateStatus(updateStatusDir, updateRequestDir),
            isQidianUpdaterReady: () => qidianUpdaterReady(updateStatusDir)
          } : {})
        });
        const responseHeaders = Object.fromEntries(response.headers);
        if ((url.pathname.match(/^\/api\/assets\/[a-f0-9-]{36}$/) || url.pathname === '/api/backups/full') && response.body) {
          prepareResponseForIncompleteRequest(response.status, incoming, outgoing, responseHeaders);
          writeHead(outgoing, response.status, responseHeaders);
          await pipeline(Readable.fromWeb(response.body), outgoing);
        } else {
          const body = Buffer.from(await response.arrayBuffer());
          const drainRequest = prepareResponseForIncompleteRequest(response.status, incoming, outgoing, responseHeaders);
          writeHead(outgoing, response.status, responseHeaders);
          outgoing.end(body, () => { if (drainRequest) drainRejectedRequest(incoming); });
        }
        return;
      }

      if (!['GET', 'HEAD'].includes(incoming.method || 'GET')) {
        writeHead(outgoing, 405, { 'Allow': 'GET, HEAD', 'Cache-Control': 'no-store' });
        outgoing.end();
        return;
      }
      const path = safeStaticPath(staticRoot, url.pathname);
      if (!path) {
        writeHead(outgoing, 404, { 'Cache-Control': 'no-store' });
        outgoing.end();
        return;
      }
      const actualRoot = await realpath(staticRoot), actualPath = await realpath(path).catch(() => null);
      if (!actualPath || !(actualPath === actualRoot || actualPath.startsWith(`${actualRoot}${sep}`))) {
        outgoing.writeHead(404, { 'Cache-Control': 'no-store' });
        outgoing.end();
        return;
      }
      const content = await readFile(actualPath);
      const hashedAsset = isImmutableStaticAsset(actualPath);
      writeHead(outgoing, 200, {
        'Content-Type': MIME[extname(actualPath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-store',
        'Content-Length': content.byteLength
      });
      outgoing.end(incoming.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const status = error.status === 413 ? 413 : 500;
      if (outgoing.destroyed && error.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
      console.error('Self-hosted request failed:', error);
      if (outgoing.headersSent) {
        outgoing.destroy(error);
        return;
      }
      const responseHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      const body = JSON.stringify({ error: status === 413 ? '请求内容过大' : '服务器暂时无法完成操作' });
      const drainRequest = prepareResponseForIncompleteRequest(status, incoming, outgoing, responseHeaders);
      writeHead(outgoing, status, responseHeaders);
      outgoing.end(body, () => { if (drainRequest) drainRejectedRequest(incoming); });
    }
  };
  const server = createServer(handler);
  server.headersTimeout = 15_000;
  server.requestTimeout = 0;
  server.timeout = 120_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
