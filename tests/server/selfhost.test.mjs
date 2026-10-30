import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openSelfHostedDatabase } from '../../server/sqlite-migrations.mjs';
import { createSelfHostedServer } from '../../server/http-server.mjs';
import { readStorageCapacity } from '../../server/storage-capacity.mjs';
import { ASSET_CLEANUP_INTERVAL_MS, QIDIAN_PORT, startAssetCleanupScheduler } from '../../server/selfhost.mjs';
import { ASSET_PRUNE_GRACE_MS, ASSET_UPLOAD_TTL_MS, createAssetService } from '../../server/application/asset-service.js';
import * as assetRepository from '../../server/repositories/asset-repository.js';
import { queueQidianUpdate, qidianUpdaterReady, readQidianUpdateStatus } from '../../server/host-updater.mjs';
import { makeRegistrationCredential } from '../../src/features/auth/credentials.js';
import { strFromU8, unzipSync } from 'fflate';
import { applyVaultChanges, diffVaultChanges } from '../../shared/vault-changes.js';

test('self-hosted application listens on its fixed container port', async () => {
  const source = await readFile(resolve('server/selfhost.mjs'), 'utf8');
  const config = await readFile(resolve('server/config.mjs'), 'utf8');
  const dockerfile = await readFile(resolve('Dockerfile'), 'utf8');
  const compose = await readFile(resolve('packaging/docker/compose.yaml'), 'utf8');
  assert.equal(QIDIAN_PORT, 9908);
  assert.match(config, /export const QIDIAN_PORT = 9908/);
  assert.match(source, /server\.listen\(config\.port, config\.host/);
  assert.doesNotMatch(source, /process\.env\.PORT/);
  assert.match(dockerfile, /EXPOSE 9908/);
  assert.match(compose, /:9908:9908/);
  assert.doesNotMatch(compose, /APP_PORT|PORT:/);
  assert.doesNotMatch(dockerfile, /PORT=9908/);
  assert.doesNotMatch(compose, /\bPORT:/);
});

test('asset cleanup scheduler runs immediately, avoids overlap, and waits on shutdown', async () => {
  let tick, interval, cleared = false, finishFirstRun;
  let calls = 0;
  const pending = new Promise(resolvePending => { finishFirstRun = resolvePending; });
  const stop = startAssetCleanupScheduler(() => {
    calls += 1;
    return calls === 1 ? pending : Promise.resolve();
  }, {
    setIntervalFn(callback, delay) { tick = callback; interval = delay; return { unref() {} }; },
    clearIntervalFn() { cleared = true; }
  });

  await new Promise(resolveTurn => setImmediate(resolveTurn));
  assert.equal(interval, ASSET_CLEANUP_INTERVAL_MS);
  assert.equal(calls, 1, 'the first sweep starts after the scheduler is installed');
  tick();
  assert.equal(calls, 1, 'interval ticks do not overlap an active SQLite sweep');

  let stopped = false;
  const stopping = stop().then(() => { stopped = true; });
  await new Promise(resolveTurn => setImmediate(resolveTurn));
  assert.equal(cleared, true);
  assert.equal(stopped, false, 'shutdown waits while a sweep is using the database');
  finishFirstRun();
  await stopping;
  tick();
  assert.equal(calls, 1, 'a stopped scheduler ignores later ticks');
});

test('asset cleanup scheduler contains sweep errors and retries on the next interval', async () => {
  let tick, calls = 0;
  const errors = [];
  const stop = startAssetCleanupScheduler(() => {
    calls += 1;
    if (calls === 1) throw new Error('temporary SQLite failure');
  }, {
    setIntervalFn(callback) { tick = callback; return {}; },
    clearIntervalFn() {},
    onError(error) { errors.push(error.message); }
  });

  await new Promise(resolveTurn => setImmediate(resolveTurn));
  assert.equal(calls, 1);
  assert.deepEqual(errors,['temporary SQLite failure']);
  tick();
  await new Promise(resolveTurn => setImmediate(resolveTurn));
  assert.equal(calls, 2);
  assert.deepEqual(errors,['temporary SQLite failure']);
  await stop();
});

test('expired attachment cleanup survives restart, sweeps every account, and preserves referenced data', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-asset-cleanup-'));
  const databasePath = join(temp, 'qidian.sqlite');
  const now = 5_000_000_000;
  const cutoff = now - ASSET_UPLOAD_TTL_MS;
  const accountA = 'cleanup-account-a', accountB = 'cleanup-account-b';
  const refs = {
    note:'11111111-1111-4111-8111-111111111111',
    bookmark:'22222222-2222-4222-8222-222222222222',
    trash:'33333333-3333-4333-8333-333333333333',
    snapshot:'44444444-4444-4444-8444-444444444444',
    scoped:'55555555-5555-4555-8555-555555555555'
  };
  const oldOrphan = '66666666-6666-4666-8666-666666666666';
  const scopeOrphan = '77777777-7777-4777-8777-777777777777';
  const dormantOrphan = '88888888-8888-4888-8888-888888888888';
  const freshOrphan = '99999999-9999-4999-8999-999999999999';
  const completeOld = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const completedOrphan = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const recentCompletedOrphan = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const importScope = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let activeDB = await openSelfHostedDatabase({ databasePath, migrationsDir:resolve('migrations') });
  t.after(async () => {
    activeDB?.close();
    await rm(temp, { recursive:true, force:true });
  });

  for (const [id, username] of [[accountA,'cleanup_a'],[accountB,'cleanup_b']]) {
    await activeDB.prepare(`INSERT INTO accounts(id,username,username_normalized,password_salt,password_hash,password_iterations,created)
      VALUES(?,?,?,'salt','hash',600000,?)`).bind(id,username,username,now).run();
    await activeDB.prepare(`INSERT INTO account_vaults(account_id,revision,updated) VALUES(?,0,?)`)
      .bind(id,now).run();
  }
  const createAsset = async (accountId,id,{ created=cutoff-1, complete=0, importScopeId=null }={}) => {
    await activeDB.prepare(`INSERT INTO account_assets(account_id,id,name,mime,size,created,complete,import_scope_id)
      VALUES(?,?,'staged.bin','application/octet-stream',1,?,?,?)`).bind(accountId,id,created,complete,importScopeId).run();
    await activeDB.prepare('INSERT INTO account_asset_chunks(account_id,asset_id,ordinal,data) VALUES(?,?,0,?)')
      .bind(accountId,id,new Uint8Array([42])).run();
  };

  await createAsset(accountA,refs.note);
  await createAsset(accountA,refs.bookmark);
  await createAsset(accountA,refs.trash);
  await createAsset(accountA,refs.snapshot);
  await createAsset(accountA,oldOrphan);
  await activeDB.prepare(`INSERT INTO account_asset_import_scopes(account_id,id,status,created,updated)
    VALUES(?,?,'staging',?,?)`).bind(accountA,importScope,cutoff-1,cutoff-1).run();
  await createAsset(accountA,refs.scoped,{ importScopeId:importScope });
  await createAsset(accountA,scopeOrphan,{ importScopeId:importScope });
  await createAsset(accountA,completeOld,{ complete:1 });
  await createAsset(accountA,completedOrphan,{ created:now - ASSET_PRUNE_GRACE_MS - 1, complete:1 });
  await createAsset(accountA,recentCompletedOrphan,{ created:now - ASSET_PRUNE_GRACE_MS + 1, complete:1 });
  await createAsset(accountB,dormantOrphan);
  await createAsset(accountB,freshOrphan,{ created:now });

  const url = id => `/api/assets/${id}`;
  await activeDB.prepare('INSERT INTO account_notes(account_id,id,position,data) VALUES(?,?,0,?)')
    .bind(accountA,'referencing-note',JSON.stringify({ id:'referencing-note',body:`${url(refs.note)} ${url(refs.scoped)}` })).run();
  await activeDB.prepare('INSERT INTO account_bookmarks(account_id,id,parent_id,position,kind,data) VALUES(?,?,NULL,0,\'link\',?)')
    .bind(accountA,'referencing-bookmark',JSON.stringify({ id:'referencing-bookmark',icon:url(refs.bookmark) })).run();
  await activeDB.prepare('INSERT INTO account_trash(account_id,id,position,data) VALUES(?,?,0,?)')
    .bind(accountA,'referencing-trash',JSON.stringify({ id:'referencing-trash',body:url(refs.trash) })).run();
  await activeDB.prepare('INSERT INTO account_snapshots(account_id,revision,data,created) VALUES(?,1,?,?)')
    .bind(accountA,JSON.stringify({ notes:[{ id:'historical',body:url(refs.snapshot) }] }),cutoff-1).run();
  activeDB.close();
  activeDB = null;

  activeDB = await openSelfHostedDatabase({ databasePath, migrationsDir:resolve('migrations') });
  const service = createAssetService(assetRepository,{ now:() => now });
  const before = await activeDB.prepare('SELECT COUNT(*) AS count FROM account_assets WHERE complete = 0').first();
  assert.equal(before.count,9,'incomplete chunks are still present after the database is reopened');

  assert.deepEqual(await service.cleanupExpiredUploads(activeDB), {
    accountsScanned:2, importScopesExpired:1, importAssetsRemoved:1, uploadsRemoved:2,
    assetsRemoved:1, assetBytesRemoved:1
  });
  const remaining = await activeDB.prepare('SELECT account_id AS accountId,id,complete,import_scope_id AS importScopeId FROM account_assets ORDER BY account_id,id').all();
  const remainingIds = new Set(remaining.results.map(row => row.id));
  for (const id of [...Object.values(refs),freshOrphan,completeOld,recentCompletedOrphan]) assert.ok(remainingIds.has(id),`${id} should be retained`);
  for (const id of [oldOrphan,scopeOrphan,dormantOrphan,completedOrphan]) assert.ok(!remainingIds.has(id),`${id} should be removed`);
  assert.equal(remaining.results.find(row => row.id === refs.scoped).importScopeId,null,
    'a referenced import attachment is detached from the expired scope and retained');
  assert.equal((await activeDB.prepare('SELECT status FROM account_asset_import_scopes WHERE account_id = ? AND id = ?').bind(accountA,importScope).first()).status,'aborted');
  assert.equal((await activeDB.prepare('SELECT COUNT(*) AS count FROM account_asset_chunks WHERE account_id = ?').bind(accountA).first()).count,7,
    'chunks remain for retained references, recent uploads, and completed assets inside the grace period');
});

test('unauthenticated large vault requests are handled before the body finishes uploading', async t => {
  const server = createSelfHostedServer({ DB: {} });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
  });

  let client;
  let responseReceived = false;
  const responsePromise = new Promise((resolve, reject) => {
    client = httpRequest(`${base}/api/vault/changes`, {
      method: 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        'Content-Length': String(64 * 1024 * 1024)
      }
    }, response => {
      responseReceived = true;
      response.resume();
      response.once('end', () => resolve({ status: response.statusCode, connection: response.headers.connection }));
    });
    client.once('error', error => {
      if (responseReceived) return;
      if (error.code === 'ECONNRESET') resolve({ status: null, error: error.code });
      else reject(error);
    });
    client.write('{"changes":');
  });

  let timeout;
  try {
    const timedOut = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('server waited for the full unauthenticated body')), 15_000); });
    const result = await Promise.race([responsePromise, timedOut]);
    assert.ok(result.status === 401 || result.error === 'ECONNRESET', JSON.stringify(result));
    if (result.status !== null) assert.equal(result.connection, 'close');
  } finally {
    clearTimeout(timeout);
    client.destroy();
  }
});

test('direct clients cannot bypass auth IP limits with forged client IP headers', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-untrusted-ip-'));
  const data = join(temp, 'data');
  const staticRoot = join(temp, 'dist');
  await mkdir(staticRoot, { recursive: true });
  const DB = await openSelfHostedDatabase({ databasePath: join(data, 'qidian.sqlite'), migrationsDir: resolve('migrations') });
  const server = createSelfHostedServer({ DB, root: staticRoot });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
    DB.close();
    await rm(temp, { recursive: true, force: true });
  });

  for (let index = 0; index < 31; index += 1) {
    const response = await fetch(`${base}/api/auth/challenge`, {
      method: 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        'X-Forwarded-For': `203.0.113.${index + 1}`,
        'X-Client-IP': `198.51.100.${index + 1}`
      },
      body: JSON.stringify({ username: `spoof_user_${index}` })
    });
    assert.equal(response.status, index < 30 ? 200 : 429, `attempt ${index + 1} must use the TCP peer's rate-limit bucket`);
    await response.arrayBuffer();
  }
});

test('trusted proxies use the nearest untrusted forwarded address when X-Forwarded-For is appended', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-trusted-proxy-ip-'));
  const data = join(temp, 'data');
  const staticRoot = join(temp, 'dist');
  await mkdir(staticRoot, { recursive: true });
  const DB = await openSelfHostedDatabase({ databasePath: join(data, 'qidian.sqlite'), migrationsDir: resolve('migrations') });
  const server = createSelfHostedServer({ DB, root: staticRoot, trustProxy: true, trustedProxies: ['127.0.0.1'] });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
    DB.close();
    await rm(temp, { recursive: true, force: true });
  });

  const realNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    for (let index = 0; index < 31; index += 1) {
      const response = await fetch(`${base}/api/auth/challenge`, {
        method: 'POST',
        headers: {
          Origin: base,
          'Content-Type': 'application/json',
          'X-Forwarded-For': `203.0.113.${index + 1}, 198.51.100.42`
        },
        body: JSON.stringify({ username: `proxy_chain_${index}` })
      });
      assert.equal(response.status, index < 30 ? 200 : 429, `attempt ${index + 1} must use the appended client's rate-limit bucket`);
      await response.arrayBuffer();
    }
  } finally {
    Date.now = realNow;
  }
});

test('self-hosted SQLite migrations back up schema changes and serve a private app over HTTP', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-selfhost-'));
  const data = join(temp, 'data');
  const staticRoot = join(temp, 'dist');
  await mkdir(staticRoot, { recursive: true });
  await mkdir(join(staticRoot, 'assets'), { recursive: true });
  await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Qidian</title>');
  await writeFile(join(staticRoot, 'manifest.webmanifest'), '{"name":"栖点"}');
  await mkdir(join(staticRoot, 'icons'), { recursive: true });
  await writeFile(join(staticRoot, 'icons', 'qidian.svg'), '<svg/>');
  await writeFile(join(staticRoot, 'assets', 'editor-extensions-K4QiaSOV.js'), 'hashed asset');
  await writeFile(join(staticRoot, 'assets', 'plain.js'), 'unhashed asset');

  const DB = await openSelfHostedDatabase({ databasePath: join(data, 'qidian.sqlite'), migrationsDir: resolve('migrations') });
  const migrations = await DB.prepare('SELECT name FROM qidian_schema_migrations ORDER BY name').all();
  assert.deepEqual(migrations.results.map(item => item.name), [
    '0001_initial.sql', '0002_accounts.sql', '0003_email_auth.sql', '0004_account_profiles.sql', '0005_snapshot_retention.sql', '0006_username_only_login.sql', '0007_session_idle_timeout.sql', '0008_streamed_unbounded_assets.sql', '0009_normalized_vault_records.sql', '0010_vault_change_journal.sql', '0011_asset_import_scopes.sql', '0012_optional_totp.sql', '0013_browser_extension_credentials.sql'
  ]);
  const backups = await (await import('node:fs/promises')).readdir(join(data, 'migration-backups'));
  assert.equal(backups.length, 12, 'each data or schema migration after the first leaves a pre-change database copy');

  const server = createSelfHostedServer({ DB, root: staticRoot, storagePath:data, registrationEnabled: true, trustProxy: true, trustedProxies:['127.0.0.1'] });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
    DB.close();
    await rm(temp, { recursive: true, force: true });
  });

  for (let attempt = 0; attempt < 30; attempt++) {
    let oversizedRequest;
    const oversizedAuthResponse = await new Promise((resolveResponse, rejectStatus) => {
      const timeout = setTimeout(() => {
        oversizedRequest.destroy();
        rejectStatus(new Error('oversized JSON request did not return a response'));
      }, 1_000);
      oversizedRequest = httpRequest(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json', 'Content-Length': '8192' }
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.resume();
        response.once('end', () => {
          clearTimeout(timeout);
          oversizedRequest.destroy();
          resolveResponse({ status: response.statusCode, contentType: response.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') });
        });
      });
      oversizedRequest.once('error', error => {
        clearTimeout(timeout);
        rejectStatus(new Error(`oversized JSON request attempt ${attempt + 1}: ${error.message}`, { cause: error }));
      });
      oversizedRequest.write(Buffer.alloc(4097, 0x20));
    });
    assert.equal(oversizedAuthResponse.status, 413, `route-level JSON limits must return HTTP 413 over an incomplete streamed request (attempt ${attempt + 1})`);
    assert.match(oversizedAuthResponse.contentType, /application\/json/i);
    assert.deepEqual(JSON.parse(oversizedAuthResponse.body), { error: '请求过大' });
  }

  const page = await fetch(base);
  assert.equal(page.status, 200);
  const manifest = await fetch(`${base}/manifest.webmanifest`);
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/i);
  assert.equal(await manifest.text(), '{"name":"栖点"}');
  const icon = await fetch(`${base}/icons/qidian.svg`);
  assert.match(icon.headers.get('content-type'), /image\/svg\+xml/i);
  assert.match(await page.text(), /Qidian/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(page.headers.get('content-security-policy'), /worker-src 'self'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const hashedAsset = await fetch(`${base}/assets/editor-extensions-K4QiaSOV.js`);
  assert.equal(hashedAsset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const unhashedAsset = await fetch(`${base}/assets/plain.js`);
  assert.equal(unhashedAsset.headers.get('cache-control'), 'no-store');
  const ready = await fetch(`${base}/readyz`);
  assert.equal(ready.status,200);
  assert.equal(await ready.text(),'ready');
  assert.equal(server.headersTimeout,15_000);
  assert.equal(server.requestTimeout,0);
  assert.equal(server.timeout,120_000);
  const unauthenticated = await fetch(`${base}/api/vault`);
  assert.equal(unauthenticated.status, 401);
  const missingFile = await fetch(`${base}/missing.js`);
  assert.equal(missingFile.status, 404);

  const credential = await makeRegistrationCredential('Selfhost secure phrase 8!');
  const registered = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://qidian.local:9908',
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-Host': 'qidian.local:9908',
      'X-Forwarded-For': '198.51.100.4'
    },
    body: JSON.stringify({ username: 'selfhost_user', ...credential })
  });
  assert.equal(registered.status, 201, await registered.text());
  assert.match(registered.headers.get('set-cookie'), /; Secure/);
  const created = await (await DB.prepare('SELECT id FROM accounts WHERE username_normalized = ?').bind('selfhost_user').first());
  assert.ok(created?.id);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM auth_throttles WHERE bucket_key LIKE ?').bind('%').first()).count, 2);
  const sessionCookie = registered.headers.get('set-cookie').split(';')[0];
  const proxyHeaders = {
    'X-Forwarded-Proto':'https', 'X-Forwarded-Host':'qidian.local:9908', 'X-Forwarded-For':'198.51.100.4'
  };
  const profilePairing = await fetch(`${base}/api/account/extensions/pairing`, {
    method:'POST', headers:{ ...proxyHeaders, Origin:'https://qidian.local:9908', Cookie:sessionCookie, 'Content-Type':'application/json' },
    body:JSON.stringify({ name:'Chrome 反代测试' })
  });
  assert.equal(profilePairing.status,200,await profilePairing.clone().text());
  const pairing = await profilePairing.json();
  const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const extensionPreflight = await fetch(`${base}/api/extensions/pair`, {
    method:'OPTIONS', headers:{ ...proxyHeaders, Origin:extensionOrigin, 'Access-Control-Request-Method':'POST', 'Access-Control-Request-Headers':'content-type' }
  });
  assert.equal(extensionPreflight.status,204);
  assert.equal(extensionPreflight.headers.get('Access-Control-Allow-Origin'),extensionOrigin);
  const extensionPair = await fetch(`${base}/api/extensions/pair`, {
    method:'POST', headers:{ ...proxyHeaders, Origin:extensionOrigin, 'Content-Type':'application/json' },
    body:JSON.stringify({ code:pairing.code })
  });
  assert.equal(extensionPair.status,200,await extensionPair.clone().text());
  assert.equal(extensionPair.headers.get('Access-Control-Allow-Origin'),extensionOrigin);
  const extensionCredential = await extensionPair.json();
  const bookmarkPreflight = await fetch(`${base}/api/extensions/bookmarks`, {
    method:'OPTIONS', headers:{ ...proxyHeaders, Origin:extensionOrigin, 'Access-Control-Request-Method':'POST',
      'Access-Control-Request-Headers':'authorization,content-type' }
  });
  assert.equal(bookmarkPreflight.status,204);
  const extensionBookmark = await fetch(`${base}/api/extensions/bookmarks`, {
    method:'POST', headers:{ ...proxyHeaders, Origin:extensionOrigin, 'Content-Type':'application/json',
      Authorization:`Bearer ${extensionCredential.token}` },
    body:JSON.stringify({ url:'https://example.com/proxy-bookmark', title:'反代书签' })
  });
  assert.equal(extensionBookmark.status,200,await extensionBookmark.clone().text());
  assert.equal((await extensionBookmark.json()).status,'created');
  const unauthenticatedStorage = await fetch(`${base}/api/system/storage`);
  assert.equal(unauthenticatedStorage.status,401,'storage usage is private');
  const storage = await fetch(`${base}/api/system/storage`, { headers:{ Cookie:registered.headers.get('set-cookie').split(';')[0], Origin:base } });
  assert.equal(storage.status,200);
  assert.deepEqual(await storage.json(),await readStorageCapacity(data),'self-hosted endpoint reads the mounted data directory capacity');
  const largeBytes = new Uint8Array(8*1024*1024+1).fill(29);
  const largeUpload = await fetch(`${base}/api/assets`, {
    method:'POST',
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0], 'X-File-Name':'large.bin' },
    body:largeBytes
  });
  assert.equal(largeUpload.status,201,await largeUpload.clone().text());
  const largeAsset = await largeUpload.json();
  assert.equal(largeAsset.size,largeBytes.length);
  const largeDownload = await fetch(`${base}/api/assets/${largeAsset.id}`, {
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  });
  assert.equal(largeDownload.status,200);
  let streamedBytes=0, firstByte=-1, lastByte=-1;
  const assetReader=largeDownload.body.getReader();
  for (;;) {
    const { done, value } = await assetReader.read();
    if (done) break;
    if (firstByte < 0 && value.length) firstByte=value[0];
    if (value.length) lastByte=value.at(-1);
    streamedBytes+=value.length;
  }
  assert.equal(streamedBytes,largeBytes.length);
  assert.equal(firstByte,29);
  assert.equal(lastByte,29);

  const importScopeResponse = await fetch(`${base}/api/assets/import-scopes`, {
    method:'POST', headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  });
  assert.equal(importScopeResponse.status,201,await importScopeResponse.clone().text());
  const importScope = await importScopeResponse.json();
  const vaultBeforeLargeImport = await (await fetch(`${base}/api/vault`, {
    headers:{ Origin:base, Cookie:sessionCookie }
  })).json();
  const importedNotes = Array.from({ length:9 },(_,index)=>({
    id:`http-import-${index}`,title:`HTTP 导入 ${index}`,type:'note',category:'HTTP',tags:[],
    body:'x'.repeat(950_000),source:'',created:1,updated:1,pinned:false,status:'published'
  }));
  const largeVaultImport = await fetch(`${base}/api/vault/import`, {
    method:'POST',
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0], 'Content-Type':'application/json' },
    body:JSON.stringify({ scopeId:importScope.id,revision:vaultBeforeLargeImport.revision,data:{ categories:['HTTP'],notes:importedNotes,bookmarks:[],trash:[],theme:'light',pasteMode:'rich' } })
  });
  assert.equal(largeVaultImport.status,200,await largeVaultImport.clone().text());
  assert.deepEqual(await largeVaultImport.json(),{ revision:vaultBeforeLargeImport.revision + 1 });

  const chunkScopeResponse = await fetch(`${base}/api/assets/import-scopes`, {
    method:'POST', headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  });
  assert.equal(chunkScopeResponse.status,201,await chunkScopeResponse.clone().text());
  const chunkScope = await chunkScopeResponse.json();
  const chunkedBytes = new Uint8Array(600_123).fill(61);
  const chunkStart = await fetch(`${base}/api/assets/import-scopes/${chunkScope.id}/uploads`, {
    method:'POST',
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0], 'Content-Type':'application/json' },
    body:JSON.stringify({ name:'selfhost-import.bin', size:chunkedBytes.length })
  });
  assert.equal(chunkStart.status,201,await chunkStart.clone().text());
  const chunkUpload = await chunkStart.json();
  const chunkPath = `${base}/api/assets/import-scopes/${chunkScope.id}/uploads/${chunkUpload.id}/chunks`;
  const chunked = await fetch(chunkPath, {
    method:'PUT', headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0],
      'Content-Type':'application/octet-stream', 'X-Chunk-Start':'0' }, body:chunkedBytes
  });
  assert.equal(chunked.status,200,await chunked.clone().text());
  assert.equal((await fetch(`${base}/api/assets/${chunkUpload.id}`, {
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  })).status,404,'chunked import stays hidden until its scope commits');
  const chunkComplete = await fetch(`${base}/api/assets/import-scopes/${chunkScope.id}/uploads/${chunkUpload.id}/complete`, {
    method:'POST', headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  });
  assert.equal(chunkComplete.status,201,await chunkComplete.clone().text());
  const currentVault = await (await fetch(`${base}/api/vault`, {
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  })).json();
  const committedChunkScope = await fetch(`${base}/api/vault/import`, {
    method:'POST',
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0], 'Content-Type':'application/json' },
    body:JSON.stringify({ scopeId:chunkScope.id, revision:currentVault.revision, data:currentVault.data })
  });
  assert.equal(committedChunkScope.status,200,await committedChunkScope.clone().text());
  const chunkReadback = await fetch(`${base}/api/assets/${chunkUpload.id}`, {
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  });
  assert.equal(chunkReadback.status,200);
  assert.deepEqual(new Uint8Array(await chunkReadback.arrayBuffer()),chunkedBytes);

  const cancelledBackup = await fetch(`${base}/api/backups/full`, {
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  });
  assert.equal(cancelledBackup.status,200);
  const cancelledReader = cancelledBackup.body.getReader();
  const attachmentEntryName = Buffer.from(`assets/${chunkUpload.id}`);
  let bytesRead = 0;
  let carry = Buffer.alloc(0);
  let attachmentNameOffset = -1;
  for (let index = 0; index < 4096; index += 1) {
    const { done, value } = await cancelledReader.read();
    assert.equal(done,false,'backup stream should remain active until the client cancels');
    const combined = Buffer.concat([carry,Buffer.from(value)]);
    const markerOffset = combined.indexOf(attachmentEntryName);
    if (markerOffset >= 0) attachmentNameOffset = bytesRead - carry.length + markerOffset;
    bytesRead += value.byteLength;
    if (attachmentNameOffset >= 0 && bytesRead >= attachmentNameOffset + attachmentEntryName.length + 64 * 1024) break;
    carry = combined.subarray(Math.max(0,combined.length - attachmentEntryName.length + 1));
  }
  assert.notEqual(attachmentNameOffset,-1,'client must reach the attachment entry before cancelling');
  const attachmentDataOffset = attachmentNameOffset + attachmentEntryName.length;
  assert.ok(bytesRead > attachmentDataOffset,'client must consume attachment bytes before cancelling');
  assert.ok(bytesRead < attachmentDataOffset + chunkedBytes.length,'client must cancel before the attachment finishes');
  const originalConsoleError = console.error;
  const serverErrors = [];
  console.error = (...args) => serverErrors.push(args);
  let readyAfterCancelledBackup;
  try {
    await cancelledReader.cancel('synthetic HTTP client disconnected during attachment download');
    readyAfterCancelledBackup = await fetch(`${base}/readyz`);
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(serverErrors,[],'a client-cancelled backup is not a server error');
  assert.equal(readyAfterCancelledBackup.status,200);
  assert.equal(await readyAfterCancelledBackup.text(),'ready');

  const fullBackup = await fetch(`${base}/api/backups/full`, {
    headers:{ Origin:base, Cookie:registered.headers.get('set-cookie').split(';')[0] }
  });
  assert.equal(fullBackup.status,200);
  assert.equal(fullBackup.headers.get('content-type'),'application/zip');
  assert.match(fullBackup.headers.get('content-disposition'),/filename\*=UTF-8''%E6%A0%96/);
  let backupBytes = 0;
  const backupChunks = [];
  const backupReader = fullBackup.body.getReader();
  for (;;) {
    const { done, value } = await backupReader.read();
    if (done) break;
    backupChunks.push(value);
    backupBytes += value.byteLength;
  }
  assert.ok(backupChunks.length > 1,'the complete backup is delivered in multiple HTTP chunks');
  const backupArchive = new Uint8Array(backupBytes);
  let backupOffset = 0;
  for (const chunk of backupChunks) { backupArchive.set(chunk,backupOffset); backupOffset += chunk.byteLength; }
  const backupEntries = unzipSync(backupArchive);
  const backupVault = JSON.parse(strFromU8(backupEntries['vault.json']));
  const backupManifest = JSON.parse(strFromU8(backupEntries['assets.json']));
  assert.ok(backupVault.notes.some(note => note.id === importedNotes[0].id));
  assert.ok(backupManifest.some(asset => asset.id === chunkUpload.id && asset.size === chunkedBytes.length));
  assert.deepEqual(backupEntries[`assets/${chunkUpload.id}`],chunkedBytes);
  const unauthenticatedFullBackup = await fetch(`${base}/api/backups/full`);
  assert.equal(unauthenticatedFullBackup.status,401,'full backup download remains authenticated');

  const plainHttpCredential = await makeRegistrationCredential('Plain http phrase 9!');
  const plainHttpRegistration = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: 'plain_http_user', ...plainHttpCredential })
  });
  assert.equal(plainHttpRegistration.status, 201, await plainHttpRegistration.text());
  assert.doesNotMatch(plainHttpRegistration.headers.get('set-cookie'), /; Secure/);
});

test('self-hosted HTTP sync transfers incremental changes between two device snapshots', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-selfhost-device-sync-'));
  const data = join(temp, 'data');
  const staticRoot = join(temp, 'dist');
  await mkdir(staticRoot, { recursive: true });
  await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Qidian</title>');
  const DB = await openSelfHostedDatabase({ databasePath: join(data, 'qidian.sqlite'), migrationsDir: resolve('migrations') });
  const server = createSelfHostedServer({ DB, root: staticRoot, storagePath: data, registrationEnabled: true });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
    DB.close();
    await rm(temp, { recursive: true, force: true });
  });

  const credential = await makeRegistrationCredential('Selfhost sync phrase 7!');
  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: `sync_${Date.now().toString(36)}`, ...credential })
  });
  assert.equal(registration.status, 201, await registration.clone().text());
  const cookie = registration.headers.get('set-cookie').split(';')[0];
  const readVault = async () => {
    const response = await fetch(`${base}/api/vault`, { headers: { Origin: base, Cookie: cookie } });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const writeChanges = (revision, changes) => fetch(`${base}/api/vault/changes`, {
    method: 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, changes })
  });
  const readChanges = async after => {
    const response = await fetch(`${base}/api/vault/changes?after=${after}`, { headers: { Origin: base, Cookie: cookie } });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };

  const deviceOne = await readVault();
  const deviceTwo = await readVault();
  assert.equal(deviceTwo.revision, deviceOne.revision, 'two clients start from the same SQLite revision');
  const note = { id: 'http-device-sync-note', title: 'HTTP 双设备同步', type: 'note', category: 'HTTP', tags: [],
    body: '<p>增量记录</p>', source: '', created: 1, updated: 2, pinned: false, status: 'published' };
  const added = { ...deviceOne.data, categories: [...new Set([...deviceOne.data.categories, 'HTTP'])], notes: [...deviceOne.data.notes, note] };
  const addChanges = diffVaultChanges(deviceOne.data, added);
  const saved = await writeChanges(deviceOne.revision, addChanges);
  assert.equal(saved.status, 200, await saved.clone().text());
  const revisionAfterAdd = await saved.json();

  const deltaForDeviceTwo = await readChanges(deviceTwo.revision);
  assert.equal(deltaForDeviceTwo.resetRequired, false);
  assert.deepEqual(applyVaultChanges(deviceTwo.data, deltaForDeviceTwo.changes[0].changes), added,
    'the second client applies the SQLite journal delta to its previous snapshot');
  assert.equal((await writeChanges(deviceTwo.revision, addChanges)).status, 409,
    'a stale device cannot overwrite a newer SQLite revision');

  const removed = { ...added, notes: added.notes.filter(item => item.id !== note.id) };
  const deletion = await writeChanges(revisionAfterAdd.revision, diffVaultChanges(added, removed));
  assert.equal(deletion.status, 200, await deletion.clone().text());
  const deletionDelta = await readChanges(revisionAfterAdd.revision);
  assert.deepEqual(deletionDelta.changes[0].changes.notes.delete, [note.id], 'deletions are preserved as sync tombstones');
  assert.deepEqual(applyVaultChanges(added, deletionDelta.changes[0].changes), removed);
  assert.deepEqual((await readVault()).data.notes, removed.notes);
});

test('self-hosted registration permits one owner bootstrap and then closes by default', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-bootstrap-'));
  const staticRoot = join(temp, 'dist');
  await mkdir(staticRoot, { recursive: true });
  await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>Qidian</title>');
  const DB = await openSelfHostedDatabase({ databasePath: join(temp, 'data', 'qidian.sqlite'), migrationsDir: resolve('migrations') });
  const server = createSelfHostedServer({ DB, root: staticRoot, registrationEnabled: false });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
    DB.close();
    await rm(temp, { recursive: true, force: true });
  });

  assert.deepEqual(await (await fetch(`${base}/api/auth/config`)).json(), { registrationEnabled: true, setupRequired: true });
  const credential = await makeRegistrationCredential('Bootstrap secure phrase 8!');
  const registered = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: 'owner_user', ...credential })
  });
  assert.equal(registered.status, 201, await registered.text());
  assert.deepEqual(await (await fetch(`${base}/api/auth/config`)).json(), { registrationEnabled: false, setupRequired: false });

  const nextRegistration = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: base }
  });
  assert.equal(nextRegistration.status, 403);
});

test('self-hosted update bridge exposes bounded logs and accepts only one queued update', async t => {
  const control = await mkdtemp(join(tmpdir(), 'qidian-update-bridge-'));
  t.after(() => rm(control, { recursive:true, force:true }));
  const inbox=join(control,'inbox'),outbox=join(control,'outbox');
  await mkdir(inbox);await mkdir(outbox);
  assert.equal(await qidianUpdaterReady(outbox), false);
  assert.equal(await queueQidianUpdate(inbox), true);
  assert.equal(await queueQidianUpdate(inbox), false, 'an existing update request cannot be overwritten');
  assert.deepEqual(await readQidianUpdateStatus(outbox,inbox), { state:'queued', version:'', updatedAt:null, logUpdatedAt:null, log:'' });
  await writeFile(join(outbox,'update-agent-ready'),'ready');
  await writeFile(join(outbox,'update-status'),'running\t0.1.6\t1791763200\n');
  await writeFile(join(outbox,'update.log'),'x'.repeat(70000));
  const status = await readQidianUpdateStatus(outbox,inbox);
  assert.equal(status.state,'running');
  assert.equal(status.version,'0.1.6');
  assert.equal(status.log.length,65536);
  assert.ok(Number.isFinite(status.logUpdatedAt),'log timestamp reflects the log file modification time');
  assert.equal(await qidianUpdaterReady(outbox),true);
  await rm(join(outbox,'update-agent-ready'));
  assert.equal((await readQidianUpdateStatus(outbox,inbox)).state,'running','the persisted update state survives a brief updater-agent restart');
  await rm(join(inbox,'update-request'));
  assert.equal(await queueQidianUpdate(inbox,outbox),false,'an active update cannot be queued again after its marker is claimed');
});

test('a new pending update does not display the previous failed job or its stale log', async t => {
  const control=await mkdtemp(join(tmpdir(),'qidian-pending-update-'));
  t.after(()=>rm(control,{recursive:true,force:true}));
  const inbox=join(control,'inbox'),outbox=join(control,'outbox');
  await mkdir(inbox);await mkdir(outbox);
  await writeFile(join(outbox,'update-agent-ready'),'ready');
  await writeFile(join(outbox,'update-status'),'failed\t0.1.14\t1791763200\n');
  await writeFile(join(outbox,'update.log'),'old task failure');
  await writeFile(join(inbox,'update-request'),'update\n');
  assert.deepEqual(await readQidianUpdateStatus(outbox,inbox),{state:'queued',version:'',updatedAt:null,logUpdatedAt:null,log:''});
  await rm(join(inbox,'update-request'));
  const previous=await readQidianUpdateStatus(outbox,inbox);
  assert.equal(previous.state,'failed');
  assert.equal(previous.log,'old task failure');
});
