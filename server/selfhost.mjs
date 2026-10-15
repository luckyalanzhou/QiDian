import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { access, mkdir, open, readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handle } from './api.js';
import { openSelfHostedDatabase } from './sqlite-migrations.mjs';

const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const DEFAULT_MAX_REQUEST_BYTES = 8 * 1024 * 1024 + 10_000;
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
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function externalOrigin(request, trustProxy) {
  const forwardedProto = trustProxy ? request.headers['x-forwarded-proto'] : undefined;
  const forwardedHost = trustProxy ? request.headers['x-forwarded-host'] : undefined;
  const protoValue = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const hostValue = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const protocol = (typeof protoValue === 'string' ? protoValue : '').split(',')[0].trim()
    || (request.socket.encrypted ? 'https' : 'http');
  const host = (typeof hostValue === 'string' ? hostValue : '').split(',')[0].trim()
    || request.headers.host;
  if (!host || !['http', 'https'].includes(protocol)) throw new Error('A valid Host header is required');
  return `${protocol}://${host}`;
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks, size) : undefined;
}

function forwardedClientIp(request, trustProxy) {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = (typeof forwardedValue === 'string' ? forwardedValue : '').split(',')[0].trim();
    if (first && first.length <= 128) return first;
  }
  return request.socket.remoteAddress || 'unknown-client';
}

function writeHead(response, statusCode, headers = {}) {
  response.writeHead(statusCode, { ...headers, ...SECURITY_HEADERS });
}

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

function safeStaticPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded === '/' ? '/index.html' : decoded;
  const path = resolve(root, `.${relative}`);
  return path === root || path.startsWith(`${root}${sep}`) ? path : null;
}

export function createSelfHostedServer({ DB, root = resolve('dist'), registrationEnabled = false, trustProxy = false,
  updateRequestDir = process.env.UPDATE_REQUEST_DIR, updateStatusDir = process.env.UPDATE_STATUS_DIR,
  qidianVersion = process.env.QIDIAN_VERSION || PACKAGE_VERSION || '0.0.0', fetchRelease = globalThis.fetch } = {}) {
  if (!DB) throw new Error('A configured SQLite database is required before serving requests');
  const staticRoot = resolve(root);
  const handler = async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url || '/', externalOrigin(incoming, trustProxy));
      if (url.pathname === '/healthz' && incoming.method === 'GET') {
        writeHead(outgoing, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        outgoing.end('ok');
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        const body = ['GET', 'HEAD'].includes(incoming.method || 'GET')
          ? undefined : await readBody(incoming, DEFAULT_MAX_REQUEST_BYTES);
        const headers = new Headers();
        for (const [name, raw] of Object.entries(incoming.headers)) {
          const key = name.toLowerCase();
          if (HOP_BY_HOP_HEADERS.has(key) || raw === undefined) continue;
          headers.set(key, Array.isArray(raw) ? raw.join(', ') : String(raw));
        }
        headers.set('X-Client-IP', forwardedClientIp(incoming, trustProxy));
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
          ...(updateRequestDir && updateStatusDir ? {
            requestQidianUpdate: () => queueQidianUpdate(updateRequestDir, updateStatusDir),
            readQidianUpdateStatus: () => readQidianUpdateStatus(updateStatusDir, updateRequestDir),
            isQidianUpdaterReady: () => qidianUpdaterReady(updateStatusDir)
          } : {})
        });
        writeHead(outgoing, response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
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
      const hashedAsset = /[.-][a-f0-9]{8,}[.-]/i.test(actualPath) && actualPath.includes(`${sep}assets${sep}`);
      writeHead(outgoing, 200, {
        'Content-Type': MIME[extname(actualPath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-store',
        'Content-Length': content.byteLength
      });
      outgoing.end(incoming.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const status = error.status === 413 ? 413 : 500;
      console.error('Self-hosted request failed:', error);
      if (!outgoing.headersSent) writeHead(outgoing, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      outgoing.end(JSON.stringify({ error: status === 413 ? '请求内容过大' : '服务器暂时无法完成操作' }));
    }
  };
  return createServer(handler);
}

async function main() {
  const dataDir = resolve(process.env.DATA_DIR || '/data');
  const root = resolve(process.env.STATIC_DIR || '/app/dist');
  const DB = await openSelfHostedDatabase({
    databasePath: resolve(dataDir, 'qidian.sqlite'),
    migrationsDir: resolve(process.env.MIGRATIONS_DIR || '/app/migrations'),
    backupsDir: resolve(dataDir, 'migration-backups')
  });
  const server = createSelfHostedServer({
    DB, root,
    registrationEnabled: process.env.REGISTRATION_ENABLED === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true'
  });
  const port = Number.parseInt(process.env.PORT || '9908', 10);
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => console.log(`Qidian self-hosted server listening on ${host}:${port}`));
  const shutdown = signal => {
    console.log(`Received ${signal}; closing the server`);
    server.close(() => { DB.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
