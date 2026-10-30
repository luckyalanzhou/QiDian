import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { makeLoginVerifier, makeRegistrationCredential } from '../../src/features/auth/credentials.js';
import { createPreviewRequestUrl } from '../../scripts/preview-request.mjs';
import { readStorageCapacity } from '../../server/storage-capacity.mjs';

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function postToPreview(port, host, { method = 'POST', path = '/api/auth/challenge', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ?? Buffer.from(JSON.stringify({ username: 'preview-test' }));
    let responseReceived = false;
    const request = httpRequest({
      hostname: '127.0.0.1', port, path, method,
      headers: {
        Host: host, Origin: `http://${host}`, 'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    }, response => {
      responseReceived = true;
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', error => { if (!responseReceived) reject(new Error(`POST ${path}: ${error.message}`, { cause: error })); });
    request.end(payload);
  });
}

function postBeforeBodyCompletes(port, host, { method = 'POST', path, origin, contentLength = 64 * 1024 * 1024, initialBody = '{"large":' }) {
  return new Promise((resolve, reject) => {
    let request;
    let responseReceived = false;
    let settled = false;
    const timeout = setTimeout(() => {
      request.destroy();
      if (!settled) reject(new Error('preview waited for an unauthenticated request body to finish'));
    }, 1_000);
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      request.destroy();
      resolve(result);
    };
    request = httpRequest({
      hostname: '127.0.0.1', port, path, method,
      headers: {
        Host: host, Origin: origin, 'Content-Type': 'application/json',
        'Content-Length': String(contentLength)
      }
    }, response => {
      responseReceived = true;
      response.resume();
      response.once('end', () => {
        finish({ status: response.statusCode, connection: response.headers.connection });
      });
      response.once('error', error => finish({ status: null, error: error.code || error.name }));
    });
    request.once('error', error => {
      if (!responseReceived) finish({ status: null, error: error.code || error.name });
    });
    request.write(initialBody);
  });
}

function requestPreview(port, host, { method = 'GET', path, body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const request = httpRequest({
      hostname: '127.0.0.1', port, path, method,
      headers: {
        Host: host, Origin: `http://${host}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('error', error => reject(new Error(`${method} ${path || '/'}: ${error.message}`, { cause: error })));
    request.end(payload);
  });
}

test('SQLite preview accepts same-origin writes for both loopback hosts and rejects other hosts', async () => {
  const port = await availablePort();
  const dataDir = await mkdtemp(join(tmpdir(), 'qidian-preview-test-'));
  const previewRoot = await mkdtemp(join(tmpdir(), 'qidian-preview-dist-'));
  await mkdir(previewRoot, { recursive: true });
  await writeFile(join(previewRoot, 'index.html'), '<!doctype html><title>preview fixture</title>');
  const child = spawn(process.execPath, ['scripts/preview.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QIDIAN_PREVIEW_PORT: String(port),
      QIDIAN_PREVIEW_DATA_DIR: dataDir,
      QIDIAN_PREVIEW_DIST_DIR: previewRoot
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
  const exited = once(child, 'exit');
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`preview server did not start: ${output}`)), 10_000);
    const check = () => {
      if (output.includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', check);
    child.stderr.on('data', check);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timeout); reject(new Error(`preview exited (${code ?? signal}): ${output}`)); });
  });

  try {
    await ready;
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
      assert.equal(await postToPreview(port, host), 200, `${host} should create an auth challenge`);
    }
    const badOrigin = await postBeforeBodyCompletes(port, `127.0.0.1:${port}`, {
      path: '/api/vault/changes', origin: 'http://attacker.example'
    });
    assert.ok(badOrigin.status === 403 || badOrigin.error === 'ECONNRESET', JSON.stringify(badOrigin));
    const badHost = await postBeforeBodyCompletes(port, `example.com:${port}`, {
      path: '/api/vault/changes', origin: `http://example.com:${port}`
    });
    assert.ok(badHost.status === 403 || badHost.error === 'ECONNRESET', JSON.stringify(badHost));
    const missingStaticAsset = await requestPreview(port, `127.0.0.1:${port}`, {
      path: '/missing-resource.js'
    });
    assert.equal(missingStaticAsset.status, 404);
    assert.match(missingStaticAsset.body, /Local preview: file or request unavailable/);

    const username = 'preview_totp_test';
    const password = 'Preview-only Password 24!';
    const registration = await requestPreview(port, `127.0.0.1:${port}`, {
      method: 'POST', path: '/api/auth/register',
      body: { username, ...await makeRegistrationCredential(password) }
    });
    assert.equal(registration.status, 201);
    const cookie = registration.headers['set-cookie'][0].split(';')[0];
    const storage = await requestPreview(port, `127.0.0.1:${port}`, {
      path: '/api/system/storage', cookie
    });
    assert.equal(storage.status, 200, 'local preview should expose authenticated storage capacity');
    assert.deepEqual(JSON.parse(storage.body), await readStorageCapacity(dataDir));
    const passwordSaltResponse = await requestPreview(port, `127.0.0.1:${port}`, {
      path: '/api/account/password-salt', cookie
    });
    assert.equal(passwordSaltResponse.status, 200);
    const { salt } = JSON.parse(passwordSaltResponse.body);
    const enrollment = await requestPreview(port, `127.0.0.1:${port}`, {
      method: 'POST', path: '/api/account/totp/enrollment', cookie,
      body: { currentVerifier: await makeLoginVerifier(password, salt) }
    });
    assert.equal(enrollment.status, 200, 'local preview should provide its persistent TOTP encryption key');
    assert.ok(JSON.parse(enrollment.body).secret);
    assert.equal((await readFile(join(dataDir, 'totp-encryption.key'))).length, 32);

    const oversizedRegistration = await postBeforeBodyCompletes(port, `127.0.0.1:${port}`, {
      path: '/api/auth/register', origin: `http://127.0.0.1:${port}`,
      contentLength: 8192, initialBody: ' '.repeat(4097)
    });
    assert.ok(oversizedRegistration.status === 413 || oversizedRegistration.error === 'ECONNRESET', JSON.stringify(oversizedRegistration));
    if (oversizedRegistration.status !== null) assert.equal(oversizedRegistration.connection, 'close');
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    await rm(dataDir, { recursive: true, force: true });
    await rm(previewRoot, { recursive: true, force: true });
  }
});
test('SQLite preview rejects absolute and authority-relative request targets', () => {
  for (const target of ['http://example.com/api/auth/login', '//example.com/api/auth/login']) {
    assert.equal(createPreviewRequestUrl('localhost:8788', target, 8788), null, target);
  }
});
