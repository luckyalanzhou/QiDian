import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { handle } from '../../server/api.js';
import { PASSWORD_ITERATIONS, SESSION_IDLE_TTL, SESSION_TTL, sessionTokenFromCookie, hashSession } from '../../server/auth.js';
import { makeRegistrationCredential, makeLoginVerifier } from '../../src/features/auth/credentials.js';
import { adaptDatabaseSync, sqliteAdapter } from '../../server/adapters/sqlite-adapter.mjs';
import { ASSET_PRUNE_GRACE_MS } from '../../server/application/asset-service.js';
import { deleteAccountAssets, findAccountAssetPruneRevision, findExpiredAccountAssetCandidates } from '../../server/repositories/asset-repository.js';
import { isApiErrorResponse } from '../../shared/api-contracts.js';
import { applyVaultChanges, diffVaultChanges } from '../../shared/vault-changes.js';
import { decodeBase32 } from '../../server/totp.js';
import { resetLocalAccountPassword } from '../../server/repositories/local-account-repository.mjs';

let env, alice, bob;
const ALICE = { username: 'alice_notes', password: 'Correct horse battery 7!' };
const BOB = { username: 'bob_notes', password: 'Another secure phrase 4#' };
const legacyAssetId = '00000000-0000-4000-8000-000000000001';
const legacyNote = { id:'legacy-note', title:'旧单人库内容', type:'note', category:'遗留', tags:['迁移'], body:'<p>迁移前的笔记 ✅</p>', source:'', created:1, updated:2, pinned:false };
const legacyVault = { categories:['遗留'], notes:[legacyNote], theme:'light', pasteMode:'rich' };

function migrateStatements(sql) {
  return sql.match(/CREATE TRIGGER[\s\S]*?END;|WITH RECURSIVE[\s\S]*?;|(?:PRAGMA|CREATE TABLE|CREATE INDEX|INSERT INTO|UPDATE|ALTER TABLE|DROP TRIGGER|DROP TABLE)[\s\S]*?;/g) || [];
}
const MIGRATION_FILES = ['0001_initial.sql','0002_accounts.sql','0003_email_auth.sql','0004_account_profiles.sql','0005_snapshot_retention.sql','0006_username_only_login.sql','0007_session_idle_timeout.sql','0008_streamed_unbounded_assets.sql','0009_normalized_vault_records.sql','0010_vault_change_journal.sql','0011_asset_import_scopes.sql','0012_optional_totp.sql','0013_browser_extension_credentials.sql'];
async function migrateDatabase(DB) {
  for (const file of MIGRATION_FILES) {
    const sql = await readFile(new URL(`../../migrations/${file}`, import.meta.url),'utf8');
    if (file === '0006_username_only_login.sql' || file === '0008_streamed_unbounded_assets.sql') {
      await DB.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
      try {
        await DB.exec(sql);
        assert.deepEqual(await DB.prepare('PRAGMA foreign_key_check').all(), { results:[] });
        await DB.exec('COMMIT; PRAGMA foreign_keys=ON;');
      } catch (error) {
        await DB.exec('ROLLBACK; PRAGMA foreign_keys=ON;');
        throw error;
      }
      continue;
    }
    for (const statement of migrateStatements(sql)) await DB.prepare(statement).run();
  }
}
before(async () => {
  env = { DB:sqliteAdapter(), LOCAL_DEV:'true', REGISTRATION_ENABLED:'true', getTotpEncryptionKey:async()=>Buffer.alloc(32,0x5a) };
  await migrateDatabase(env.DB);
  await env.DB.prepare('UPDATE vault SET revision = 3, data = ?, updated = ? WHERE id = 1').bind(JSON.stringify(legacyVault), 10).run();
  await env.DB.prepare('INSERT INTO snapshots(revision, data, created) VALUES (?, ?, ?)').bind(2, JSON.stringify(legacyVault), 9).run();
  await env.DB.prepare('INSERT INTO assets VALUES (?, ?, ?, ?, ?)').bind(legacyAssetId, 'legacy.txt', 'application/octet-stream', 4, 8).run();
  await env.DB.prepare('INSERT INTO asset_chunks VALUES (?, ?, ?)').bind(legacyAssetId, 0, new Uint8Array([1,2,3,4])).run();
  alice = await registerAccount(ALICE);
});
after(async () => { env.DB.close(); });

function request(path, method = 'GET', body, extra = {}, cookie = '') {
  const headers = { Origin:'http://127.0.0.1', ...(body && typeof body === 'string' ? { 'Content-Type':'application/json' } : {}), ...extra };
  if (cookie) headers.Cookie = cookie;
  return new Request(`http://127.0.0.1/api${path}`, { method, headers, body });
}
const call = (path, method = 'GET', body, ...args) => {
  const cookie = args.length ? args.find(value => typeof value === 'string' && value.startsWith('qidian_session=')) || '' : alice.cookie;
  const extra = args.find(value => value && typeof value === 'object' && !ArrayBuffer.isView(value)) || {};
  return handle(request(path, method, body, extra, cookie), env);
};
async function registerAccount(user) {
  const credential = await makeRegistrationCredential(user.password);
  const response = await handle(request('/auth/register','POST',JSON.stringify({ username:user.username, ...credential })), env);
  const data = await response.json();
  return { response, data, cookie:response.headers.get('Set-Cookie')?.split(';')[0] || '' };
}
test('JSON routes accept case-insensitive media types and reject lookalike prefixes', async () => {
  for (const contentType of ['application/json; charset=utf-8', 'Application/JSON; charset=UTF-8']) {
    const response = await handle(request('/auth/challenge', 'POST', '{}', { 'Content-Type': contentType }), env);
    assert.equal(response.status, 400, `${contentType} reaches JSON contract validation`);
  }
  for (const contentType of ['application/jsonp', 'application/json-invalid']) {
    const response = await handle(request('/auth/challenge', 'POST', '{}', { 'Content-Type': contentType }), env);
    assert.equal(response.status, 415, `${contentType} is not a JSON media type`);
  }
});
function noteData(title = '中文 Emoji ✅') {
  return { categories:['开发'], notes:[{ id:'n1', title, category:'开发', type:'note', tags:['SQLite'], body:'<h2>标题</h2><p>中文全文检索 ✅</p><table><tr><td>图文</td></tr></table>', source:'', created:1, updated:2, pinned:true }] };
}
function totpCode(secret, time = Date.now()) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('first account adopts legacy notes, backups and attachment bytes', async () => {
  assert.equal(alice.response.status, 201);
  assert.equal(alice.data.legacyClaimed, true);
  const current = await (await call('/vault')).json();
  assert.equal(current.revision, 3);
  assert.deepEqual(current.data.notes, [legacyNote]);
  const columns = (await env.DB.prepare('PRAGMA table_info(account_vaults)').all()).results.map(row => row.name);
  assert.equal(columns.includes('data'), false, 'current vault content is no longer duplicated in one JSON column');
  assert.deepEqual((await env.DB.prepare('SELECT id, position FROM account_notes WHERE account_id = ?').bind(alice.data.id).all()).results,
    [{ id:'legacy-note', position:0 }]);
  assert.deepEqual((await env.DB.prepare('SELECT tag FROM account_note_tags WHERE account_id = ? AND note_id = ?').bind(alice.data.id, 'legacy-note').all()).results,
    [{ tag:'迁移' }]);
  const backups = await (await call('/backups')).json();
  assert.ok(backups.some(item => item.revision === 2));
  assert.deepEqual(new Uint8Array(await (await call(`/assets/${legacyAssetId}`)).arrayBuffer()), new Uint8Array([1,2,3,4]));
});

test('first write to a fresh legacy vault does not create an epoch-dated snapshot', async () => {
  const DB = sqliteAdapter();
  await migrateDatabase(DB);
  const isolatedEnv = { ...env, DB };
  try {
    const user = { username:'fresh_epoch_owner', password:'Fresh vault owner password 9!' };
    const credential = await makeRegistrationCredential(user.password);
    const registration = await handle(request('/auth/register','POST',JSON.stringify({ username:user.username, ...credential })), isolatedEnv);
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get('Set-Cookie')?.split(';')[0] || '';
    const account = await registration.json();
    const original = await DB.prepare('SELECT updated FROM account_vaults WHERE account_id = ?').bind(account.id).first();
    assert.equal(original.updated, 0, 'a fresh owner inherits the legacy seed timestamp');

    const current = await (await handle(request('/vault','GET',undefined,{},cookie), isolatedEnv)).json();
    const saveStarted = Date.now();
    const saved = await handle(request('/vault','PUT',JSON.stringify({ revision:current.revision, data:noteData() }),{},cookie), isolatedEnv);
    assert.equal(saved.status, 200);

    const snapshots = await (await handle(request('/backups','GET',undefined,{},cookie), isolatedEnv)).json();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].revision, 0);
    assert.ok(snapshots[0].created >= saveStarted - 1000, `expected a current timestamp, got ${snapshots[0].created}`);
  } finally {
    DB.close();
  }
});

test('API boundary returns errors matching the shared JSON error contract', async () => {
  const response = await call('/missing-endpoint');
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.deepEqual(body, { error:'接口不存在' });
  assert.equal(isApiErrorResponse(body), true);
});

test('account password sessions protect APIs on the self-hosted server', async () => {
  const config = await handle(new Request('https://qidian.local/api/auth/config'), env);
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), { registrationEnabled:true, setupRequired:false });
  const missingAppSession = new Request('https://qidian.local/api/vault');
  assert.equal((await handle(missingAppSession, env)).status, 401);
  const sessionRequired = await handle(new Request('https://qidian.local/api/auth/session'), env);
  assert.equal(sessionRequired.status, 401);
  assert.deepEqual(await sessionRequired.json(), { error:'请登录栖点账号', registrationEnabled:true, setupRequired:false });
  const appSession = await handle(new Request('https://qidian.local/api/auth/session', { headers:{ Cookie:alice.cookie } }), env);
  const sessionData = await appSession.json();
  assert.equal(sessionData.id, alice.data.id);
  assert.equal(sessionData.username, ALICE.username);
  assert.equal(sessionData.revision, 3);
  assert.deepEqual(sessionData.data.notes, [legacyNote]);
  const withAccountSession = new Request('https://qidian.local/api/vault', { headers:{ Cookie:alice.cookie } });
  assert.equal((await handle(withAccountSession, env)).status, 200);
  const revisionOnly = await handle(new Request('https://qidian.local/api/vault/revision', { headers:{ Cookie:alice.cookie } }), env);
  assert.equal(revisionOnly.status, 200);
  assert.deepEqual(await revisionOnly.json(), { revision:3 });
  assert.equal((await handle(new Request('https://qidian.local/api/vault/revision'), env)).status, 401);
  const aliceToken = sessionTokenFromCookie(new Request('https://qidian.local', { headers:{ Cookie:alice.cookie } }));
  const aliceTokenHash = await hashSession(aliceToken);
  const initialSession = await env.DB.prepare('SELECT created, expires FROM sessions WHERE token_hash = ?').bind(aliceTokenHash).first();
  assert.equal(initialSession.expires - initialSession.created, SESSION_IDLE_TTL, 'new sessions start with a three-day inactivity deadline');
  await env.DB.prepare('UPDATE sessions SET created = ? WHERE token_hash = ?').bind(Date.now() - SESSION_TTL - 1, aliceTokenHash).run();
  assert.equal((await handle(new Request('https://qidian.local/api/auth/session', { headers:{ Cookie:alice.cookie } }), env)).status, 401, 'sessions created over seven days ago expire under the shorter policy');
  await env.DB.prepare('UPDATE sessions SET created = ? WHERE token_hash = ?').bind(Date.now(), aliceTokenHash).run();
  const activeCreated = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const nearlyIdle = Date.now() + 30 * 60 * 1000;
  await env.DB.prepare('UPDATE sessions SET created = ?, expires = ? WHERE token_hash = ?').bind(activeCreated, nearlyIdle, aliceTokenHash).run();
  assert.equal((await handle(new Request('https://qidian.local/api/auth/session', { headers:{ Cookie:alice.cookie } }), env)).status, 200);
  const refreshed = await env.DB.prepare('SELECT expires FROM sessions WHERE token_hash = ?').bind(aliceTokenHash).first();
  assert.ok(refreshed.expires > nearlyIdle, 'active sessions renew their inactivity deadline');
  assert.ok(refreshed.expires <= activeCreated + SESSION_TTL, 'renewal never exceeds the absolute lifetime');
  await env.DB.prepare('UPDATE sessions SET created = ?, expires = ? WHERE token_hash = ?').bind(Date.now(), Date.now() + SESSION_IDLE_TTL, aliceTokenHash).run();
  const missingDatabase = await handle(new Request('https://qidian.local/api/auth/config'), {});
  assert.equal(missingDatabase.status, 503);
});

test('bookmark metadata fetching is rate limited per account before URL processing', async () => {
  const probe = await registerAccount({ username: 'metadata_probe', password: 'Metadata probe password 8!' });
  for (let attempt = 1; attempt <= 30; attempt++) {
    const response = await call('/bookmark-metadata', 'POST', JSON.stringify({ url: 'http://127.0.0.1/' }), {
      'X-Client-IP': `metadata-account-probe-${attempt}`
    }, probe.cookie);
    assert.equal(response.status, 422, `metadata lookup ${attempt} should stay within the account limit`);
  }
  const blocked = await call('/bookmark-metadata', 'POST', '{ malformed json', {
    'X-Client-IP': 'metadata-account-probe-over-limit'
  }, probe.cookie);
  assert.equal(blocked.status, 429, 'the thirty-first metadata lookup for one account should be rate limited');
});

test('bookmark metadata fetching requires a logged-in session before outbound access', async () => {
  const response = await handle(request('/bookmark-metadata', 'POST', JSON.stringify({ url: 'https://example.com/' })), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: '请登录栖点账号' });

  const blockedTarget = await call('/bookmark-metadata', 'POST', JSON.stringify({ url: 'http://127.0.0.1/' }));
  assert.equal(blockedTarget.status, 422);
  assert.deepEqual(await blockedTarget.json(), { error: '无法安全获取网页信息，请手动填写' });
  const invalidInput = await call('/bookmark-metadata', 'POST', JSON.stringify({ url: 'file:///etc/passwd' }));
  assert.equal(invalidInput.status, 400);
});

test('self-hosted version checks require login and queue only a verified latest release update', async () => {
  const release = {
    tag_name:'v0.1.6', html_url:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6',
    body:'修复问题\n- 更新容器', published_at:'2026-10-12T00:00:00Z', draft:false, prerelease:false,
    assets:[
      { name:'qidian-0.1.6.run', label:'栖点-0.1.6.run' },
      { name:'qidian-0.1.6.run.release.sha256', label:'栖点-0.1.6.run.sha256' }
    ]
  };
  let queued = 0;
  const updateEnv = {
    ...env, SELF_HOSTED:'true', QIDIAN_VERSION:'0.1.5',
    fetchRelease:async url => { assert.equal(url,'https://api.github.com/repos/luckyalanzhou/qidian/releases/latest'); return Response.json(release); },
    requestQidianUpdate:async () => { queued++; return queued === 1; },
    isQidianUpdaterReady:async () => true,
    readQidianUpdateStatus:async () => ({ state:'idle', version:'', updatedAt:null, logUpdatedAt:null, log:'' })
  };
  assert.equal((await handle(request('/system/version'), updateEnv)).status,401);
  const installed = await handle(request('/system/version?installed=1','GET',undefined,{},alice.cookie), {...updateEnv,fetchRelease:async()=>{throw Error('Release source offline')}});
  assert.deepEqual(await installed.json(),{currentVersion:'0.1.5'},'restart readiness is checked locally without the release source');
  const versionResponse = await handle(request('/system/version','GET',undefined,{},alice.cookie), updateEnv);
  assert.equal(versionResponse.status,200);
  assert.deepEqual(await versionResponse.json(), {
    currentVersion:'0.1.5', latestVersion:'0.1.6', updateAvailable:true, canUpdateDevice:true, installerAvailable:true, updaterAvailable:true,
    releaseUrl:release.html_url, notes:release.body, publishedAt:release.published_at
  });
  const submitted = await handle(request('/system/update','POST','{"action":"update"}',{},alice.cookie), updateEnv);
  assert.equal(submitted.status,202);
  assert.deepEqual(await submitted.json(),{ accepted:true, version:'0.1.6' });
  const duplicate = await handle(request('/system/update','POST','{"action":"update"}',{},alice.cookie), updateEnv);
  assert.equal(duplicate.status,409);
  const secondary = await registerAccount({ username:'update_reader', password:'Another strong phrase 5!' });
  const denied = await handle(request('/system/update','POST','{"action":"update"}',{},secondary.cookie), updateEnv);
  assert.equal(denied.status,403,'secondary accounts cannot update the host device');
  const secondaryVersion = await handle(request('/system/version','GET',undefined,{},secondary.cookie), updateEnv);
  assert.equal(secondaryVersion.status,200,'the current policy allows secondary accounts to read device version information');
  assert.equal((await secondaryVersion.json()).canUpdateDevice,false);
  const deviceStatus = { state:'running', version:'0.1.6', updatedAt:1791763200000, logUpdatedAt:1791763260000, log:'Pulling the latest image and checking container health.' };
  assert.equal((await handle(request('/system/update-status','GET'), updateEnv)).status,401,'device update status still requires authentication');
  let secondaryStatusRead = false;
  const secondaryStatus = await handle(request('/system/update-status','GET',undefined,{},secondary.cookie), {
    ...updateEnv, readQidianUpdateStatus:async () => { secondaryStatusRead = true; return deviceStatus; }
  });
  assert.equal(secondaryStatus.status,403,'secondary accounts cannot read device update status and logs');
  assert.equal(secondaryStatusRead,false,'the status provider is not called for secondary accounts');
  const status = await handle(request('/system/update-status','GET',undefined,{},alice.cookie), updateEnv);
  assert.equal(status.status,200,'the first account can read device update status and logs');
  assert.deepEqual(await status.json(),{ state:'idle', version:'', updatedAt:null, logUpdatedAt:null, log:'' });
});

test('update API rejects unsupported deployments and releases without the checksummed installer', async () => {
  assert.equal((await handle(request('/system/version','GET',undefined,{},alice.cookie),env)).status,404);
  const response = await handle(request('/system/update','POST','{"action":"update"}',{},alice.cookie), {
    ...env, SELF_HOSTED:'true', QIDIAN_VERSION:'0.1.5',
    fetchRelease:async () => Response.json({ tag_name:'v0.1.6', html_url:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6', assets:[] }),
    isQidianUpdaterReady:async () => true
  });
  assert.equal(response.status,503);

  const invalidComponentVersion = await handle(request('/system/version','GET',undefined,{},alice.cookie), {
    ...env, SELF_HOSTED:'true', QIDIAN_VERSION:'0.1.5',
    fetchRelease:async () => Response.json({
      tag_name:'v0.01.0',
      html_url:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.01.0',
      assets:[]
    })
  });
  assert.equal(invalidComponentVersion.status,503,'release versions reject leading zero components');

  const invalidPatchVersion = await handle(request('/system/version','GET',undefined,{},alice.cookie), {
    ...env, SELF_HOSTED:'true', QIDIAN_VERSION:'0.1.5',
    fetchRelease:async () => Response.json({
      tag_name:'v0.1.010',
      html_url:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.010',
      assets:[]
    })
  });
  assert.equal(invalidPatchVersion.status,503,'release Patch rejects leading zeros');

  const largeVersion = await handle(request('/system/version','GET',undefined,{},alice.cookie), {
    ...env, SELF_HOSTED:'true', QIDIAN_VERSION:'0.1.5',
    fetchRelease:async () => Response.json({
      tag_name:'v999999999999999999999999.1.0',
      html_url:'https://github.com/luckyalanzhou/qidian/releases/tag/v999999999999999999999999.1.0',
      assets:[]
    })
  });
  assert.equal(largeVersion.status,200,'large SemVer components are compared without numeric overflow');
  assert.equal((await largeVersion.json()).latestVersion,'999999999999999999999999.1.0');

  const unsafeReleaseLink = await handle(request('/system/version','GET',undefined,{},alice.cookie), {
    ...env, SELF_HOSTED:'true', QIDIAN_VERSION:'0.1.5',
    fetchRelease:async () => Response.json({
      tag_name:'v0.1.6', html_url:'https://example.com/releases/tag/v0.1.6', assets:[]
    })
  });
  assert.equal(unsafeReleaseLink.status,503,'release links are restricted to the public repository');
});

test('version reset offers two-digit Patch releases to devices on the previous 0.1.x line', async () => {
  const response = await handle(request('/system/version','GET',undefined,{},alice.cookie), {
    ...env,
    SELF_HOSTED:'true',
    QIDIAN_VERSION:'0.1.24',
    fetchRelease:async () => Response.json({
      tag_name:'v0.0.10',
      html_url:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.0.10',
      assets:[{ name:'栖点-0.0.10.run' },{ name:'栖点-0.0.10.run.sha256' }],
      draft:false,
      prerelease:false
    }),
    isQidianUpdaterReady:async () => true
  });
  assert.equal(response.status,200);
  assert.equal((await response.json()).updateAvailable,true);
});

test('registration is controlled by deployment configuration', async () => {
  const disabled = await handle(request('/auth/register','POST',JSON.stringify({ username:'closed_user' })), { ...env, LOCAL_DEV:'true', REGISTRATION_ENABLED:'false' });
  assert.equal(disabled.status,403);
});

test('authentication challenge enforces identity and IP limits through the SQLite HTTP API', async () => {
  const database = sqliteAdapter();
  try {
    await migrateDatabase(database);
    const isolatedEnv = { DB:database, LOCAL_DEV:'true', REGISTRATION_ENABLED:'true' };
    const sendChallenge = (username, clientIp) => handle(new Request('http://127.0.0.1/api/auth/challenge', {
      method:'POST',
      headers:{ Origin:'http://127.0.0.1', 'Content-Type':'application/json', 'X-Client-IP':clientIp },
      body:JSON.stringify({ username })
    }), isolatedEnv);

    for (let attempt = 1; attempt <= 10; attempt++) {
      assert.equal((await sendChallenge('rate_identity_probe', `identity-probe-${attempt}`)).status, 200,
        `identity request ${attempt} should stay within the limit`);
    }
    assert.equal((await sendChallenge('rate_identity_probe', 'identity-probe-over-limit')).status, 429,
      'the eleventh request for one identity should be rate limited');

    for (let attempt = 1; attempt <= 30; attempt++) {
      assert.equal((await sendChallenge(`rate_ip_${attempt}`, 'shared-probe-ip')).status, 200,
        `IP request ${attempt} should stay within the limit`);
    }
    assert.equal((await sendChallenge('rate_ip_over_limit', 'shared-probe-ip')).status, 429,
      'the thirty-first request from one IP should be rate limited');
  } finally {
    database.close();
  }
});

test('MFA verification enforces identity and IP limits before checking codes through the SQLite HTTP API', async () => {
  const database = sqliteAdapter();
  try {
    await migrateDatabase(database);
    let encryptionKeyReads = 0;
    const isolatedEnv = {
      DB:database,
      getTotpEncryptionKey:async () => { encryptionKeyReads++; return Buffer.alloc(32,0x5a); }
    };
    let accountSequence = 0;
    const seededAccounts = new Set();
    const prepareChallenge = async (accountId) => {
      accountSequence++;
      if (!seededAccounts.has(accountId)) {
        const username = `mfa_limit_${accountSequence}`;
        await database.prepare(`INSERT INTO accounts(
          id, username, username_normalized, password_salt, password_hash, password_iterations, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(accountId, username, username, 'salt', 'hash', 600000, Date.now()).run();
        await database.prepare(`INSERT INTO account_totp(
          account_id, enabled, secret_iv, secret_ciphertext, secret_tag
        ) VALUES (?, 1, 'invalid', 'invalid', 'invalid')`).bind(accountId).run();
        seededAccounts.add(accountId);
      }
      const token = `mfa-limit-token-${accountSequence}-${crypto.randomUUID()}`;
      await database.prepare('INSERT INTO auth_mfa_challenges(token_hash, account_id, created, expires) VALUES (?, ?, ?, ?)')
        .bind(await hashSession(token), accountId, Date.now(), Date.now() + 5 * 60 * 1000).run();
      return token;
    };
    const verify = (token, clientIp) => handle(new Request('http://127.0.0.1/api/auth/mfa-verify', {
      method:'POST',
      headers:{ Origin:'http://127.0.0.1', 'Content-Type':'application/json', 'X-Client-IP':clientIp },
      body:JSON.stringify({ token, code:'000000' })
    }), isolatedEnv);

    for (let attempt = 1; attempt <= 10; attempt++) {
      const token = await prepareChallenge('mfa-identity-limit');
      assert.equal((await verify(token, `mfa-identity-ip-${attempt}`)).status, 503,
        `MFA identity request ${attempt} should pass throttling and reach code verification`);
    }
    const identityOverLimit = await prepareChallenge('mfa-identity-limit');
    assert.equal((await verify(identityOverLimit, 'mfa-identity-ip-over-limit')).status, 429,
      'the eleventh MFA request for one account should be rate limited');
    assert.equal(encryptionKeyReads, 10, 'the over-limit identity request must stop before loading the TOTP key');

    for (let attempt = 1; attempt <= 30; attempt++) {
      const token = await prepareChallenge(`mfa-ip-account-${attempt}`);
      assert.equal((await verify(token, 'mfa-shared-ip')).status, 503,
        `MFA IP request ${attempt} should pass throttling and reach code verification`);
    }
    const ipOverLimit = await prepareChallenge('mfa-ip-account-over-limit');
    assert.equal((await verify(ipOverLimit, 'mfa-shared-ip')).status, 429,
      'the thirty-first MFA request from one IP should be rate limited');
    assert.equal(encryptionKeyReads, 40, 'the over-limit IP request must stop before loading the TOTP key');
  } finally {
    database.close();
  }
});

test('concurrent first-owner registration creates exactly one account', async () => {
  const database = sqliteAdapter();
  let batchQueue = Promise.resolve();
  const DB = {
    ...database,
    batch(statements) {
      const current = batchQueue.then(() => database.batch(statements));
      batchQueue = current.catch(() => {});
      return current;
    }
  };
  try {
    await migrateDatabase(DB);
    const setupEnv = { DB, SELF_HOSTED:'true', REGISTRATION_ENABLED:'false' };
    const credentials = await Promise.all([
      makeRegistrationCredential('First owner phrase 7!'),
      makeRegistrationCredential('Second owner phrase 8!')
    ]);
    const responses = await Promise.all(credentials.map((credential, index) => handle(
      request('/auth/register','POST',JSON.stringify({ username:`bootstrap_owner_${index}`, ...credential })), setupEnv
    )));
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM accounts').first()).count, 1);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM sessions').first()).count, 1);
  } finally {
    database.close();
  }
});

test('registration accepts account and password credentials', async () => {
  const user = { username:'verify_me', password:'Verification phrase 9!' };
  const created = await registerAccount(user);
  assert.equal(created.response.status,201);
  assert.equal(created.data.username,user.username);
  assert.match(created.cookie,/qidian_session=/);
});

test('production registration cannot claim an unclaimed legacy vault without verified ownership', async () => {
  const accountId = alice.data.id;
  await env.DB.prepare('UPDATE legacy_claim SET claimed_by = NULL WHERE id = 1').run();
  try {
    const credential = await makeRegistrationCredential('A different secure phrase 5!');
    const response = await handle(request('/auth/register','POST',JSON.stringify({ username:'racer_account', ...credential })), { ...env, LOCAL_DEV:undefined });
    assert.equal(response.status,409);
    assert.equal((await env.DB.prepare('SELECT revision FROM vault WHERE id = 1').first()).revision,3);
    assert.equal(await env.DB.prepare('SELECT id FROM accounts WHERE username_normalized = ?').bind('racer_account').first(),null);
  } finally {
    await env.DB.prepare('UPDATE legacy_claim SET claimed_by = ? WHERE id = 1').bind(accountId).run();
  }
});

test('writes require same Origin even before authentication', async () => {
  for (const origin of ['', 'https://evil.example']) {
    assert.equal((await handle(request('/vault','PUT','{}',{ Origin:origin }), env)).status, 403);
  }
});

test('Chrome extension pairing grants only bookmark creation and supports revocation', async () => {
  const accountOrigin = 'https://qidian.example';
  const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const extensionAccount = await registerAccount({ username:'extension_test', password:'Extension test pass 1!' });
  const accountVaultResponse = await handle(new Request(`${accountOrigin}/api/vault`, {
    headers:{ Origin:accountOrigin, Cookie:extensionAccount.cookie }
  }), env);
  const accountVault = await accountVaultResponse.json();
  accountVault.data.bookmarks = [{ id:'extension-folder', kind:'folder', title:'已有分组', children:[
    { id:'nested-existing-bookmark', kind:'link', title:'已有网址', url:'https://example.com/guide' }
  ] }];
  const vaultSetup = await handle(new Request(`${accountOrigin}/api/vault`, {
    method:'PUT', headers:{ Origin:accountOrigin, Cookie:extensionAccount.cookie, 'Content-Type':'application/json' },
    body:JSON.stringify({ revision:accountVault.revision, data:accountVault.data })
  }), env);
  assert.equal(vaultSetup.status, 200);
  const issue = await handle(new Request(`${accountOrigin}/api/account/extensions/pairing`, {
    method: 'POST', headers: { Origin:accountOrigin, Cookie:extensionAccount.cookie, 'Content-Type':'application/json', 'X-Client-IP':'198.51.100.17' },
    body: JSON.stringify({ name:'Chrome 测试扩展' })
  }), env);
  assert.equal(issue.status, 200);
  const pairing = await issue.json();
  assert.equal(pairing.name, 'Chrome 测试扩展');
  assert.ok(pairing.expires > Date.now());

  const preflight = await handle(new Request(`${accountOrigin}/api/extensions/pair`, {
    method: 'OPTIONS', headers: {
      Origin:extensionOrigin, 'Access-Control-Request-Method':'POST',
      'Access-Control-Request-Headers':'content-type'
    }
  }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), extensionOrigin);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);

  const pair = () => handle(new Request(`${accountOrigin}/api/extensions/pair`, {
    method: 'POST', headers: { Origin:extensionOrigin, 'Content-Type':'application/json', 'X-Client-IP':'198.51.100.18' },
    body: JSON.stringify({ code:pairing.code })
  }), env);
  const paired = await Promise.all([pair(), pair()]);
  assert.deepEqual(paired.map(response => response.status).sort(), [200, 401], 'a pairing code is consumed once under concurrent requests');
  const successfulResponse = paired.find(response => response.status === 200);
  assert.equal(successfulResponse.headers.get('Access-Control-Allow-Origin'), extensionOrigin);
  const credential = await successfulResponse.json();
  const tokenRow = await env.DB.prepare('SELECT token_hash, scope FROM account_extension_tokens WHERE account_id = ?')
    .bind(extensionAccount.data.id).first();
  assert.equal(tokenRow.scope, 'bookmarks:create');
  assert.notEqual(tokenRow.token_hash, credential.token);
  assert.equal(tokenRow.token_hash, await hashSession(credential.token));

  const createBookmark = (url = 'https://example.com/new', title = 'Example New') => handle(new Request(`${accountOrigin}/api/extensions/bookmarks`, {
    method:'POST', headers: {
      Origin:extensionOrigin, 'Content-Type':'application/json', Authorization:`Bearer ${credential.token}`
    }, body:JSON.stringify({ url, title })
  }), env);
  const realDateNow = Date.now;
  const fixedNow = realDateNow();
  try {
    Date.now = () => fixedNow;
    const saved = await createBookmark();
    assert.equal(saved.status, 200);
    const savedBody = await saved.json();
    assert.equal(savedBody.status, 'created');
    assert.equal(saved.headers.get('Access-Control-Allow-Origin'), extensionOrigin);
    const duplicate = await createBookmark();
    assert.equal((await duplicate.json()).status, 'duplicate');
    const nestedDuplicate = await createBookmark('https://example.com/guide', 'Existing URL');
    assert.equal((await nestedDuplicate.json()).status, 'duplicate', 'existing links are checked inside every bookmark folder');
    for (let attempt = 4; attempt <= 120; attempt += 1) {
      assert.equal((await createBookmark()).status, 200, `bookmark request ${attempt} stays within the account limit`);
    }
    const rateLimited = await handle(new Request(`${accountOrigin}/api/extensions/bookmarks`, {
      method:'POST', headers: {
        Origin:extensionOrigin, 'Content-Type':'application/json', Authorization:`Bearer ${credential.token}`
      }, body:'{ malformed json'
    }), env);
    assert.equal(rateLimited.status, 429, 'the 121st extension request is blocked before parsing the body');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS count FROM account_bookmarks
      WHERE account_id = ? AND kind = 'link' AND json_extract(data, '$.url') = ?`)
      .bind(extensionAccount.data.id, 'https://example.com/new').first()).count, 1);
  } finally {
    Date.now = realDateNow;
  }

  const cannotReadVault = await handle(new Request(`${accountOrigin}/api/vault`, {
    headers:{ Origin:extensionOrigin, Authorization:`Bearer ${credential.token}` }
  }), env);
  assert.equal(cannotReadVault.status, 401, 'the extension bearer is not a web session');
  const tokens = await handle(new Request(`${accountOrigin}/api/account/extensions/tokens`, {
    headers:{ Origin:accountOrigin, Cookie:extensionAccount.cookie }
  }), env);
  const tokenList = await tokens.json();
  assert.equal(tokenList.tokens.length, 1);
  assert.equal(tokenList.tokens[0].name, 'Chrome 测试扩展');
  assert.equal(Object.hasOwn(tokenList.tokens[0], 'token'), false, 'the raw credential is returned only once');

  const revoke = await handle(new Request(`${accountOrigin}/api/account/extensions/tokens/${tokenList.tokens[0].id}`, {
    method:'DELETE', headers:{ Origin:accountOrigin, Cookie:extensionAccount.cookie }
  }), env);
  assert.equal(revoke.status, 200);
  assert.deepEqual(await revoke.json(), { ok:true });
  assert.equal((await createBookmark()).status, 401);
  const deniedOrigin = await handle(new Request(`${accountOrigin}/api/extensions/bookmarks`, {
    method:'POST', headers:{ Origin:'chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', 'Content-Type':'application/json' },
    body:'{}'
  }), env);
  assert.equal(deniedOrigin.status, 403);
  assert.equal(deniedOrigin.headers.get('Access-Control-Allow-Origin'), null);
});

test('browser extension pairing refuses remote HTTP and accepts loopback HTTP', async () => {
  const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const body = JSON.stringify({ code:'qidian_pair_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop' });
  const remote = await handle(new Request('http://qidian.example/api/extensions/pair', {
    method:'POST', headers:{ Origin:extensionOrigin, 'Content-Type':'application/json' }, body
  }), env);
  assert.equal(remote.status, 400);
  const local = await handle(new Request('http://127.0.0.1/api/extensions/pair', {
    method:'POST', headers:{ Origin:extensionOrigin, 'Content-Type':'application/json' }, body
  }), env);
  assert.equal(local.status, 401, 'loopback HTTP passes transport validation and reaches the one-time code check');
});

test('administrator password reset invalidates unused browser extension pairing codes', async t => {
  const rawDatabase = new DatabaseSync(':memory:');
  const isolatedEnv = {
    DB:adaptDatabaseSync(rawDatabase), LOCAL_DEV:'true', REGISTRATION_ENABLED:'true',
    getTotpEncryptionKey:async()=>Buffer.alloc(32,0x4d)
  };
  t.after(() => isolatedEnv.DB.close());
  await migrateDatabase(isolatedEnv.DB);

  const user = { username:'pending_pair_reset', password:'Pending pairing reset 9!' };
  const credential = await makeRegistrationCredential(user.password);
  const registration = await handle(request('/auth/register','POST',JSON.stringify({ username:user.username, ...credential })), isolatedEnv);
  assert.equal(registration.status, 201);
  const account = await registration.json();
  const cookie = registration.headers.get('Set-Cookie')?.split(';')[0] || '';
  const issue = await handle(request('/account/extensions/pairing','POST',JSON.stringify({ name:'Pending Chrome' }),{},cookie), isolatedEnv);
  assert.equal(issue.status, 200);
  const pairing = await issue.json();

  const reset = resetLocalAccountPassword(rawDatabase, {
    accountId:account.id, salt:'reset-salt', passwordHash:'reset-hash', iterations:PASSWORD_ITERATIONS
  });
  assert.equal(reset.extensionPairingsRevoked, 1);
  const pair = await handle(request('/extensions/pair','POST',JSON.stringify({ code:pairing.code }), {
    Origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'X-Client-IP':'198.51.100.91'
  }), isolatedEnv);
  assert.equal(pair.status, 401, 'a pairing code issued before password reset cannot create a new extension token');
});

test('accounts have isolated vaults, backups and assets; login uses the account name and password', async () => {
  bob = await registerAccount(BOB);
  assert.equal(bob.response.status, 201);
  assert.equal(bob.data.legacyClaimed, false);
  assert.equal((await (await call('/vault')).json()).data.notes[0].id, 'legacy-note');
  const bobVault = await (await call('/vault','GET',undefined,BOB.username,bob.cookie)).json();
  assert.deepEqual(bobVault.data.notes, []);
  const current = await (await call('/vault')).json();
  await env.DB.prepare('UPDATE account_vaults SET updated = ? WHERE account_id = ?').bind(Date.now()+60001,alice.data.id).run();
  const saved = await call('/vault','PUT',JSON.stringify({ revision:current.revision, data:noteData() }));
  assert.equal(saved.status, 200);
  assert.deepEqual((await (await call('/vault')).json()).data.notes.map(n=>n.title), ['中文 Emoji ✅']);
  assert.deepEqual((await (await call('/vault','GET',undefined,BOB.username,bob.cookie)).json()).data.notes, []);
  assert.deepEqual((await (await call('/assets','GET',undefined,BOB.username,bob.cookie)).json()), []);
  assert.equal((await call(`/assets/${legacyAssetId}`,'GET',undefined,BOB.username,bob.cookie)).status, 404);
  assert.ok((await (await call('/backups')).json()).some(item=>item.revision===3));
  assert.deepEqual(await (await call('/backups','GET',undefined,BOB.username,bob.cookie)).json(), []);

  const challenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),BOB.username,'')).json();
  const verifier = await makeLoginVerifier(ALICE.password, challenge.salt);
  const login = await call('/auth/verify','POST',JSON.stringify({ id:challenge.id, verifier }),BOB.username,'');
  assert.equal(login.status,200);
  const loggedIn = await login.clone().json();
  assert.deepEqual(loggedIn, { id: alice.data.id }, 'verification should not duplicate the vault payload');
  assert.match(login.headers.get('Set-Cookie'),/HttpOnly/);
  assert.match(login.headers.get('Set-Cookie'),/SameSite=Strict/);
  const loggedInCookie=login.headers.get('Set-Cookie').split(';')[0];
  const loginSession=await (await call('/auth/session','GET',undefined,ALICE.username,loggedInCookie)).json();
  assert.equal(loginSession.id, alice.data.id);
  assert.equal(loginSession.revision, 4);
  assert.equal(loginSession.data.notes[0].title, '中文 Emoji ✅');
  assert.equal((await (await call('/vault','GET',undefined,BOB.username,loggedInCookie)).json()).data.notes[0].title,'中文 Emoji ✅');
  const invalidAccountName = await call('/auth/challenge','POST',JSON.stringify({ username:'alice@notes' }));
  assert.equal(invalidAccountName.status,400,'account names reject unsupported characters');
  const storedCredential = await env.DB.prepare('SELECT password_hash FROM accounts WHERE username_normalized = ?').bind(ALICE.username).first();
  assert.notEqual(storedCredential.password_hash, verifier);
  const databaseOnlyChallenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  assert.equal((await call('/auth/verify','POST',JSON.stringify({ id:databaseOnlyChallenge.id, verifier:storedCredential.password_hash }),ALICE.username,'')).status,401);
  assert.equal((await registerAccount({ ...BOB, username:ALICE.username })).response.status,409);
});

test('account profile and avatar endpoints are private and validate uploaded image bytes', async () => {
  const profileResponse = await call('/account/profile');
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json();
  assert.equal(profile.username, ALICE.username);
  assert.deepEqual(Object.keys(profile).sort(), ['avatarMime','created','id','totpEnabled','username']);
  assert.equal(profile.avatarMime, null);
  assert.equal(profile.totpEnabled, false);
  assert.equal((await call('/account/profile','GET',undefined,ALICE.username,'')).status,401);
  assert.equal((await call('/account/password-salt','GET',undefined,ALICE.username,'')).status,401);

  const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
  assert.equal((await call('/account/avatar','PUT',new Uint8Array([1,2,3]))).status,415);
  assert.equal((await call('/account/avatar','PUT',new Uint8Array(512*1024+1))).status,413);
  const uploaded = await call('/account/avatar','PUT',png);
  assert.equal(uploaded.status,200);
  assert.deepEqual(await uploaded.json(),{ ok:true, mime:'image/png' });
  assert.deepEqual(new Uint8Array(await (await call('/account/avatar')).arrayBuffer()),png);
  assert.equal((await call('/account/avatar','GET',undefined,BOB.username,bob.cookie)).status,404);
  assert.equal((await (await call('/account/profile','GET',undefined,BOB.username,bob.cookie)).json()).avatarMime,null);
  assert.equal((await call('/account/avatar','DELETE')).status,200);
  assert.equal((await call('/account/avatar')).status,404);
});

test('optional TOTP enrollment gates login, consumes recovery codes once, and can be disabled safely', async () => {
  const passwordSalt = await (await call('/account/password-salt')).json();
  const currentVerifier = await makeLoginVerifier(ALICE.password, passwordSalt.salt);
  const enrollmentResponse = await call('/account/totp/enrollment','POST',JSON.stringify({ currentVerifier }));
  assert.equal(enrollmentResponse.status,200);
  const enrollment = await enrollmentResponse.json();
  assert.match(enrollment.uri,/^otpauth:\/\/totp\//);
  assert.ok(enrollment.secret.length >= 32);
  const pending = await env.DB.prepare('SELECT enabled, pending_ciphertext, pending_tag FROM account_totp WHERE account_id = ?').bind(alice.data.id).first();
  assert.equal(pending.enabled,0);
  assert.notEqual(pending.pending_ciphertext,enrollment.secret);

  const confirmation = await call('/account/totp/confirm','POST',JSON.stringify({ pendingId:enrollment.pendingId, code:totpCode(enrollment.secret) }));
  assert.equal(confirmation.status,200);
  const enabled = await confirmation.json();
  assert.equal(enabled.enabled,true);
  assert.equal(enabled.recoveryCodes.length,10);
  const storedCodes = await env.DB.prepare('SELECT code_hash, consumed_at FROM account_totp_recovery_codes WHERE account_id = ?').bind(alice.data.id).all();
  assert.equal(storedCodes.results.length,10);
  assert.ok(storedCodes.results.every(row=>row.consumed_at === null && !enabled.recoveryCodes.includes(row.code_hash)));
  assert.equal((await (await call('/account/profile')).json()).totpEnabled,true);

  const passwordChallenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  const verifier = await makeLoginVerifier(ALICE.password,passwordChallenge.salt);
  const passwordResult = await call('/auth/verify','POST',JSON.stringify({ id:passwordChallenge.id,verifier }),ALICE.username,'');
  const mfaStep = await passwordResult.json();
  assert.equal(passwordResult.status,200);
  assert.deepEqual({ id:mfaStep.id,mfaRequired:mfaStep.mfaRequired },{ id:alice.data.id,mfaRequired:true });
  assert.equal(passwordResult.headers.get('Set-Cookie'),null,'password alone must not create a browser session');
  assert.equal((await call('/auth/session','GET',undefined,ALICE.username,'')).status,401);

  const futureCode = totpCode(enrollment.secret,Date.now()+30_000);
  const totpAttempts = await Promise.all([
    call('/auth/mfa-verify','POST',JSON.stringify({ token:mfaStep.mfaToken,code:futureCode }),ALICE.username,''),
    call('/auth/mfa-verify','POST',JSON.stringify({ token:mfaStep.mfaToken,code:futureCode }),ALICE.username,'')
  ]);
  assert.deepEqual(totpAttempts.map(response => response.status).sort(),[200,401],
    'one challenge and TOTP step can create at most one session under concurrent requests');
  const acceptedTotp = totpAttempts.find(response => response.status === 200);
  const accountCookie = acceptedTotp.headers.get('Set-Cookie').split(';')[0];
  const secondPasswordChallenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  const secondVerifier = await makeLoginVerifier(ALICE.password,secondPasswordChallenge.salt);
  const secondStep = await (await call('/auth/verify','POST',JSON.stringify({ id:secondPasswordChallenge.id,verifier:secondVerifier }),ALICE.username,'')).json();
  const originalKeyReader = env.getTotpEncryptionKey;
  let keyUnavailable;
  try {
    env.getTotpEncryptionKey = async () => { throw new Error('key file unavailable'); };
    keyUnavailable = await call('/auth/mfa-verify','POST',JSON.stringify({ token:secondStep.mfaToken,code:futureCode }),ALICE.username,'');
  } finally { env.getTotpEncryptionKey = originalKeyReader; }
  assert.equal(keyUnavailable.status,503,'encryption-key read failures are reported as service unavailable');
  const replayedTotp = await call('/auth/mfa-verify','POST',JSON.stringify({ token:secondStep.mfaToken,code:futureCode }),ALICE.username,'');
  assert.equal(replayedTotp.status,401,'a previously accepted TOTP step cannot be replayed');

  let recoveryAttempts;
  try {
    env.getTotpEncryptionKey = async () => { throw new Error('recovery-code login does not need the encryption key'); };
    recoveryAttempts = await Promise.all([
      call('/auth/mfa-verify','POST',JSON.stringify({ token:secondStep.mfaToken,code:enabled.recoveryCodes[0] }),ALICE.username,''),
      call('/auth/mfa-verify','POST',JSON.stringify({ token:secondStep.mfaToken,code:enabled.recoveryCodes[0] }),ALICE.username,'')
    ]);
  } finally { env.getTotpEncryptionKey = originalKeyReader; }
  assert.deepEqual(recoveryAttempts.map(response => response.status).sort(),[200,401],
    'a recovery code and MFA challenge can be consumed by only one concurrent request');
  const recoveryLogin = recoveryAttempts.find(response => response.status === 200);
  assert.equal((await call('/vault','GET',undefined,ALICE.username,accountCookie)).status,200);

  const thirdChallenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  const thirdVerifier = await makeLoginVerifier(ALICE.password,thirdChallenge.salt);
  const thirdStep = await (await call('/auth/verify','POST',JSON.stringify({ id:thirdChallenge.id,verifier:thirdVerifier }),ALICE.username,'')).json();
  const reusedRecovery = await call('/auth/mfa-verify','POST',JSON.stringify({ token:thirdStep.mfaToken,code:enabled.recoveryCodes[0] }),ALICE.username,'');
  assert.equal(reusedRecovery.status,401,'a recovery code is consumed once');

  const disabled = await call('/account/totp/disable','POST',JSON.stringify({ currentVerifier,code:enabled.recoveryCodes[1] }),ALICE.username,accountCookie);
  assert.equal(disabled.status,200);
  assert.equal((await (await call('/account/profile')).json()).totpEnabled,false);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS count FROM account_totp_recovery_codes WHERE account_id = ?').bind(alice.data.id).first()).count,0);

  const finalChallenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  const finalVerifier = await makeLoginVerifier(ALICE.password,finalChallenge.salt);
  const finalLogin = await call('/auth/verify','POST',JSON.stringify({ id:finalChallenge.id,verifier:finalVerifier }),ALICE.username,'');
  assert.equal(finalLogin.status,200);
  assert.ok(finalLogin.headers.get('Set-Cookie'));
});

test('changing a password checks the current verifier and revokes other sessions only', async () => {
  const challenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  const verifier = await makeLoginVerifier(ALICE.password,challenge.salt);
  const secondLogin = await call('/auth/verify','POST',JSON.stringify({ id:challenge.id, verifier }),ALICE.username,'');
  const secondCookie = secondLogin.headers.get('Set-Cookie').split(';')[0];
  const salt = await (await call('/account/password-salt')).json();
  const currentVerifier = await makeLoginVerifier(ALICE.password,salt.salt);
  const next = await makeRegistrationCredential('New secure password 8!');
  const changed = await call('/account/password','POST',JSON.stringify({ currentVerifier,...next }),ALICE.username,alice.cookie,{ 'Content-Type':'application/json' });
  assert.equal(changed.status,200);
  assert.deepEqual(await changed.json(),{ ok:true,otherSessionsRevoked:true });
  assert.equal((await call('/vault','GET',undefined,ALICE.username,alice.cookie)).status,200,'the session changing its own password stays active');
  assert.equal((await call('/vault','GET',undefined,ALICE.username,secondCookie)).status,401,'other sessions are revoked');

  const wrong = await makeLoginVerifier('Wrong current password 3!',next.salt);
  const replacement = await makeRegistrationCredential('Another valid password 9!');
  assert.equal((await call('/account/password','POST',JSON.stringify({ currentVerifier:wrong,...replacement }),ALICE.username,alice.cookie,{ 'Content-Type':'application/json' })).status,403);
  const oldChallenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  assert.equal((await call('/auth/verify','POST',JSON.stringify({ id:oldChallenge.id, verifier }),ALICE.username,'')).status,401);
  const newChallenge = await (await call('/auth/challenge','POST',JSON.stringify({ username:ALICE.username }),ALICE.username,'')).json();
  const newVerifier = await makeLoginVerifier('New secure password 8!',newChallenge.salt);
  assert.equal((await call('/auth/verify','POST',JSON.stringify({ id:newChallenge.id, verifier:newVerifier }),ALICE.username,'')).status,200);
});

test('vault updates retain conflict detection and automatic snapshots per account', async () => {
  const current = await (await call('/vault')).json();
  await env.DB.prepare('DELETE FROM account_snapshots WHERE account_id = ?').bind(alice.data.id).run();
  await env.DB.prepare('UPDATE account_vaults SET updated = ? WHERE account_id = ?').bind(Date.now(),alice.data.id).run();
  const update = await call('/vault','PUT',JSON.stringify({ revision:current.revision, data:noteData() }));
  assert.equal(update.status,200);
  const saved = await (await call('/vault')).json();
  assert.deepEqual(saved.data.notes.map(n=>n.title), ['中文 Emoji ✅']);
  assert.equal((await call('/vault','PUT',JSON.stringify({ revision:current.revision, data:noteData('stale') }))).status,409);
  const backups = await (await call('/backups')).json();
  assert.ok(backups.some(item=>item.revision===current.revision));
});

test('autosave keeps useful recent snapshots instead of exhausting history on every keystroke', async()=>{
  const user={username:'history_user',password:'Snapshot history 8!'};
  const account=await registerAccount(user);let vault=await(await call('/vault','GET',undefined,user.username,account.cookie)).json();
  for(let index=0;index<5;index++){
    const data={...vault.data,theme:index%2?'dark':'light'};
    const saved=await call('/vault','PUT',JSON.stringify({revision:vault.revision,data}),user.username,account.cookie);
    assert.equal(saved.status,200);vault={...vault,revision:(await saved.json()).revision,data};
  }
  let history=await env.DB.prepare('SELECT revision, created FROM account_snapshots WHERE account_id = ?').bind(account.data.id).all();
  assert.equal(history.results.length,1,'rapid autosaves within a minute should share one history checkpoint');
  for(let index=0;index<24;index++){
    await env.DB.prepare('UPDATE account_vaults SET updated = ? WHERE account_id = ?').bind(Date.now()+(index+1)*60001,account.data.id).run();
    const data={...vault.data,theme:index%2?'light':'dark'};
    const saved=await call('/vault','PUT',JSON.stringify({revision:vault.revision,data}),user.username,account.cookie);
    assert.equal(saved.status,200);vault={...vault,revision:(await saved.json()).revision,data};
  }
  history=await env.DB.prepare('SELECT revision, created FROM account_snapshots WHERE account_id = ? ORDER BY created DESC, revision DESC').bind(account.data.id).all();
  assert.equal(history.results.length,20,'history should retain the 20 newest checkpoints by age');
  assert.ok(history.results[0].revision>history.results.at(-1).revision);
});

test('vault accepts custom note types and rejects notes referencing removed types', async () => {
  const current = await (await call('/vault')).json();
  const custom = { ...current.data, noteTypes:[...current.data.noteTypes, { id:'reading', name:'读书笔记' }], notes:[...current.data.notes, { id:'reading1', title:'阅读记录', type:'reading', category:'开发', tags:[], body:'正文', source:'', created:3, updated:4, pinned:false }] };
  const saved = await call('/vault','PUT',JSON.stringify({ revision:current.revision, data:custom }));
  assert.equal(saved.status,200);
  const loaded = await (await call('/vault')).json();
  assert.ok(loaded.data.noteTypes.some(t=>t.id==='reading'&&t.name==='读书笔记'));
  assert.equal(loaded.data.notes.at(-1).type,'reading');
  const invalid = { ...loaded.data, noteTypes:loaded.data.noteTypes.filter(t=>t.id!=='reading') };
  assert.equal((await call('/vault','PUT',JSON.stringify({ revision:loaded.revision, data:invalid })).then(r=>r.status)),400);
});

test('invalid and malformed large vault requests leave account data intact', async () => {
  const current = await (await call('/vault')).json();
  const invalid = { ...noteData(), notes:[...noteData().notes,...noteData().notes] };
  assert.equal((await call('/vault','PUT',JSON.stringify({ revision:current.revision, data:invalid })).then(r=>r.status)),400);
  for (const body of ['null', '[]', '"text"']) {
    const response = await call('/vault','PUT',body);
    assert.equal(response.status,400,`${body} is not a valid JSON request object`);
    assert.deepEqual(await response.json(),{ error:'JSON 请求必须是对象' });
  }
  assert.equal((await call('/vault','PUT','x'.repeat(1_020_000)).then(r=>r.status)),400);
  assert.equal((await (await call('/vault')).json()).revision,current.revision);
});

test('chunked attachment round-trip preserves bytes and other accounts receive 404', async () => {
  const bytes = new Uint8Array(600000); crypto.getRandomValues(bytes.subarray(0,65000)); bytes.fill(43,65000);
  const posted = await call('/assets','POST',bytes,ALICE.username,alice.cookie,{ 'X-File-Name':encodeURIComponent('附件.html'), 'Content-Type':'image/png' });
  assert.equal(posted.status,201); const asset = await posted.json(); assert.equal(asset.mime,'application/octet-stream');
  const response = await call(`/assets/${asset.id}`,'GET',undefined,ALICE.username,alice.cookie);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  assert.match(response.headers.get('Content-Disposition'),/^attachment/);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await call(`/assets/${asset.id}`,'GET',undefined,BOB.username,bob.cookie)).status,404);
});

test('full backup streams a ZIP containing the current vault and SQLite attachment chunks', async () => {
  const original = await (await call('/vault')).json();
  const bytes = new Uint8Array(520_123).fill(73);
  const upload = await call('/assets', 'POST', bytes, { 'X-File-Name': 'export.bin', 'Content-Type': 'application/octet-stream' }, alice.cookie);
  assert.equal(upload.status, 201);
  const asset = await upload.json();
  const data = { ...original.data, notes: [...original.data.notes, { ...noteData('导出附件').notes[0], id: 'stream-export-note', body: `<a href="/api/assets/${asset.id}">文件</a>` }] };
  const saved = await call('/vault', 'PUT', JSON.stringify({ revision: original.revision, data }));
  assert.equal(saved.status, 200);

  const response = await call('/backups/full');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/zip');
  assert.match(response.headers.get('Content-Disposition'), /filename\*=UTF-8''%E6%A0%96/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const restoredVault = JSON.parse(strFromU8(files['vault.json']));
  const manifest = JSON.parse(strFromU8(files['assets.json']));
  assert.ok(restoredVault.notes.some(item => item.id === 'stream-export-note'));
  assert.ok(manifest.some(item => item.id === asset.id && item.size === bytes.length));
  assert.deepEqual(files[`assets/${asset.id}`], bytes);
  assert.equal((await handle(request('/backups/full'), env)).status, 401, 'full backup remains account-authenticated');
});

test('chunked import uploads are account-scoped, retry-idempotent and hidden until scope commit', async () => {
  bob ??= await registerAccount(BOB);
  const scopeResponse = await call('/assets/import-scopes', 'POST');
  assert.equal(scopeResponse.status, 201);
  const scope = await scopeResponse.json();
  const bytes = new Uint8Array(600_123).fill(41);
  const start = await call(`/assets/import-scopes/${scope.id}/uploads`, 'POST', JSON.stringify({ name: 'import.bin', size: bytes.length }));
  assert.equal(start.status, 201);
  const upload = await start.json();
  const chunkPath = `/assets/import-scopes/${scope.id}/uploads/${upload.id}/chunks`;
  const headers = { 'Content-Type': 'application/octet-stream', 'X-Chunk-Start': '0' };
  assert.equal((await call(chunkPath, 'PUT', bytes, headers, alice.cookie)).status, 200);
  assert.equal((await call(chunkPath, 'PUT', bytes, headers, alice.cookie)).status, 200, 'retrying identical chunks is safe');
  const conflicting = bytes.slice(); conflicting[0] ^= 1;
  assert.equal((await call(chunkPath, 'PUT', conflicting, headers, alice.cookie)).status, 409, 'a retry cannot replace stored chunk bytes');
  assert.equal((await call(chunkPath, 'PUT', bytes, headers, bob.cookie)).status, 404, 'another account cannot write into this scope');
  const completed = await call(`/assets/import-scopes/${scope.id}/uploads/${upload.id}/complete`, 'POST');
  assert.equal(completed.status, 201);
  assert.equal((await call(`/assets/${upload.id}`)).status, 404, 'staged attachments remain private before commit');

  const current = await (await call('/vault')).json();
  const importedNote = { id:'scope-import-attachment-note', title:'导入附件引用', type:'note', category:'备份', tags:[],
    body:`<img src="/api/assets/${upload.id}">`, source:'', created:1, updated:1, pinned:false };
  const importedData = { ...current.data, notes:[...current.data.notes, importedNote] };
  const committed = await call('/vault/import', 'POST', JSON.stringify({ scopeId: scope.id, revision: current.revision, data: importedData }));
  assert.equal(committed.status, 200);
  const fetched = await call(`/assets/${upload.id}`);
  assert.equal(fetched.status, 200);
  assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()), bytes);
  assert.ok((await (await call('/vault')).json()).data.notes.some(note => note.id === importedNote.id));
});

test('manual snapshots protect referenced attachments while orphan pruning reclaims unused bytes', async () => {
  const upload = async name => {
    const response = await call('/assets','POST',new TextEncoder().encode(name),ALICE.username,alice.cookie,{ 'X-File-Name':encodeURIComponent(name) });
    assert.equal(response.status,201);
    return response.json();
  };
  const referenced = await upload('referenced.txt'), orphan = await upload('orphan.txt');
  const current = await (await call('/vault')).json();
  const note = { id:'asset-note', title:'附件引用', category:'开发', type:'note', tags:[], body:`<p><a href="/api/assets/${referenced.id}?download=1">附件</a></p>`, source:'', created:10, updated:10, pinned:false };
  const saved = await call('/vault','PUT',JSON.stringify({ revision:current.revision, data:{ ...current.data, notes:[...current.data.notes,note] } }));
  assert.equal(saved.status,200);
  const snapshot = await call('/backups','POST');
  assert.equal(snapshot.status,201);
  assert.equal((await snapshot.json()).revision,current.revision+1);
  await env.DB.prepare('UPDATE account_assets SET created = ? WHERE account_id = ? AND id = ?')
    .bind(Date.now() - ASSET_PRUNE_GRACE_MS - 1, alice.data.id, orphan.id).run();

  const firstPrune = await call('/assets/prune','POST');
  assert.equal(firstPrune.status,200);
  assert.equal((await call(`/assets/${referenced.id}`)).status,200,'the active vault keeps referenced attachments');
  assert.equal((await call(`/assets/${orphan.id}`)).status,404,'an unreferenced attachment is reclaimed');

  const withAsset = await (await call('/vault')).json();
  const removed = await call('/vault','PUT',JSON.stringify({ revision:withAsset.revision, data:{ ...withAsset.data, notes:withAsset.data.notes.filter(item=>item.id!==note.id) } }));
  assert.equal(removed.status,200);
  await call('/assets/prune','POST');
  assert.equal((await call(`/assets/${referenced.id}`)).status,200,'retained snapshots keep historical attachment references valid');
  await env.DB.prepare('DELETE FROM account_snapshots WHERE account_id = ?').bind(alice.data.id).run();
  await env.DB.prepare('UPDATE account_assets SET created = ? WHERE account_id = ? AND id = ?')
    .bind(Date.now() - ASSET_PRUNE_GRACE_MS - 1, alice.data.id, referenced.id).run();
  const finalPrune = await (await call('/assets/prune','POST')).json();
  assert.ok(finalPrune.removed>=1);
  assert.equal((await call(`/assets/${referenced.id}`)).status,404);
});

test('asset pruning rechecks live references after selecting stale orphan candidates', async () => {
  const uploaded = await call('/assets','POST',new TextEncoder().encode('race-safe'),ALICE.username,alice.cookie,{ 'X-File-Name':'race-safe.txt' });
  assert.equal(uploaded.status,201);
  const asset = await uploaded.json();
  const cutoff = Date.now() - ASSET_PRUNE_GRACE_MS;
  await env.DB.prepare('UPDATE account_assets SET created = ? WHERE account_id = ? AND id = ?')
    .bind(cutoff - 1, alice.data.id, asset.id).run();

  const candidates = await findExpiredAccountAssetCandidates(env.DB, alice.data.id, cutoff, '', 100);
  assert.ok(candidates.results.some(item => item.id === asset.id), 'the asset is initially an old cleanup candidate');
  const scannedRevision = await findAccountAssetPruneRevision(env.DB, alice.data.id);

  const current = await (await call('/vault')).json();
  const note = { id:'asset-prune-race-note', title:'回收竞态', type:'note', category:'测试', tags:[],
    body:`<img src="/api/assets/${asset.id}">`, source:'', created:1, updated:1, pinned:false };
  const saved = await call('/vault','PUT',JSON.stringify({ revision:current.revision, data:{ ...current.data, notes:[...current.data.notes,note] } }));
  assert.equal(saved.status,200);

  await deleteAccountAssets(env.DB, alice.data.id, [asset.id], cutoff, scannedRevision.revision);
  assert.equal((await call(`/assets/${asset.id}`)).status,200,
    'a stale prune candidate must not delete an attachment referenced after candidate selection');

  const snapshotRaceUpload = await call('/assets','POST',new TextEncoder().encode('snapshot-race'),ALICE.username,alice.cookie,
    { 'X-File-Name':'snapshot-race.txt' });
  assert.equal(snapshotRaceUpload.status,201);
  const snapshotRaceAsset = await snapshotRaceUpload.json();
  await env.DB.prepare('UPDATE account_assets SET created = ? WHERE account_id = ? AND id = ?')
    .bind(cutoff - 1, alice.data.id, snapshotRaceAsset.id).run();
  const snapshotRaceRevision = await findAccountAssetPruneRevision(env.DB, alice.data.id);
  assert.ok((await findExpiredAccountAssetCandidates(env.DB, alice.data.id, cutoff, '', 100)).results
    .some(item => item.id === snapshotRaceAsset.id));
  await env.DB.prepare('INSERT INTO account_snapshots(account_id,revision,data,created) VALUES(?,?,?,?)')
    .bind(alice.data.id, snapshotRaceRevision.revision + 100_000,
      JSON.stringify({ notes:[{ id:'snapshot-race', body:`/api/assets/${snapshotRaceAsset.id}` }] }), Date.now()).run();
  await deleteAccountAssets(env.DB, alice.data.id, [snapshotRaceAsset.id], cutoff, snapshotRaceRevision.revision);
  assert.equal((await call(`/assets/${snapshotRaceAsset.id}`)).status,200,
    'a same-revision snapshot inserted after reference scanning protects its attachment at delete time');
});

test('vault save endpoints reject new references to missing attachments without changing saved data', async () => {
  const before = await (await call('/vault')).json();
  const invalidReferences = [
    ['123e4567-e89b-42d3-a456-426614174123','missing'],
    ['123e4567-e89b-42d3-a456-426614174124','incomplete']
  ];
  const incompleteId = invalidReferences[1][0];
  await env.DB.prepare(`INSERT INTO account_assets(account_id,id,name,mime,size,created,complete,import_scope_id)
    VALUES(?,?,?,?,?,?,0,NULL)`).bind(alice.data.id,incompleteId,'unfinished.bin','application/octet-stream',0,Date.now()).run();
  for (const [assetId, kind] of invalidReferences) {
    const note = { id:`${kind}-asset-full-note`, title:`${kind}附件`, type:'note', category:'测试', tags:[],
      body:`<img src="/api/assets/${assetId}">`, source:'', created:1, updated:1, pinned:false };
    const full = await call('/vault','PUT',JSON.stringify({ revision:before.revision,
      data:{ ...before.data, notes:[...before.data.notes,note] } }));
    assert.equal(full.status,422,`${kind} attachment is rejected by a full save`);

    const deltaNote = { ...note, id:`${kind}-asset-delta-note` };
    const delta = diffVaultChanges(before.data,{ ...before.data, notes:[...before.data.notes,deltaNote] });
    const incremental = await call('/vault/changes','POST',JSON.stringify({ revision:before.revision, changes:delta }));
    assert.equal(incremental.status,422,`${kind} attachment is rejected by a delta save`);
  }
  const after = await (await call('/vault')).json();
  assert.equal(after.revision,before.revision);
  assert.equal(after.data.notes.some(item => invalidReferences.some(([,kind]) => item.id.includes(`${kind}-asset`))),false);
});

test('vault saves permit unchanged legacy missing references but reject adding one to another record', async () => {
  const missingId = '123e4567-e89b-42d3-a456-426614174125';
  const legacy = { id:'legacy-missing-asset-note', title:'旧附件链接', type:'note', category:'测试', tags:[],
    body:`<img src="/api/assets/${missingId}">`, source:'', created:1, updated:1, pinned:false };
  await env.DB.prepare('INSERT INTO account_notes(account_id,id,position,data) VALUES(?,?,?,?)')
    .bind(alice.data.id,legacy.id,0,JSON.stringify(legacy)).run();
  const current = await (await call('/vault')).json();
  const updatedLegacy = { ...legacy, title:'保留旧链接' };
  const preserved = await call('/vault','PUT',JSON.stringify({ revision:current.revision,
    data:{ ...current.data, notes:current.data.notes.map(note => note.id === legacy.id ? updatedLegacy : note) } }));
  assert.equal(preserved.status,200,await preserved.clone().text());

  const latest = await (await call('/vault')).json();
  const added = { ...legacy, id:'new-note-same-broken-asset', title:'新增旧附件链接' };
  const response = await call('/vault','PUT',JSON.stringify({ revision:latest.revision,
    data:{ ...latest.data, notes:[...latest.data.notes,added] } }));
  assert.equal(response.status,422);
});

test('attachments can exceed the former per-file and per-account quotas', async () => {
  const db=env.DB, account=await db.prepare('SELECT id FROM accounts WHERE username_normalized=?').bind(ALICE.username).first();
  for (let i=0;i<13;i++) await db.prepare('INSERT INTO account_assets(account_id,id,name,mime,size,created) VALUES(?,?,?,?,?,?)').bind(account.id,`quota-${i}`,'fixture','application/octet-stream',8*1024*1024,0).run();
  await db.prepare('INSERT INTO account_assets(account_id,id,name,mime,size,created) VALUES(?,?,?,?,?,?)')
    .bind(account.id,'over-file-limit','fixture','application/octet-stream',8*1024*1024+1,0).run();
  const bytes = new Uint8Array(8*1024*1024+1).fill(27);
  const uploaded = await call('/assets','POST',bytes,ALICE.username,alice.cookie,{ 'X-File-Name':'large.bin' });
  assert.equal(uploaded.status,201);
  const asset = await uploaded.json();
  assert.equal(asset.size,bytes.length);
  assert.deepEqual(new Uint8Array(await (await call(`/assets/${asset.id}`,'GET',undefined,ALICE.username,alice.cookie)).arrayBuffer()),bytes);
  assert.equal((await call('/assets','POST',new Uint8Array(),ALICE.username,alice.cookie)).status,400);
  assert.equal((await db.prepare('SELECT SUM(size) AS bytes FROM account_assets WHERE account_id=?').bind(account.id).first()).bytes > 100*1024*1024,true);
});

test('nested bookmarks round-trip through authenticated vault and snapshots without leaking to another account', async () => {
  const original = await (await call('/vault')).json();
  await env.DB.prepare('DELETE FROM account_snapshots WHERE account_id = ?').bind(alice.data.id).run();
  const bobBefore = await (await call('/vault', 'GET', undefined, BOB.username, bob.cookie)).json();
  const bookmarks = [{ id:'bookmark-folder', title:'浏览器分组', kind:'folder', children:[{ id:'bookmark-site', title:'参考', kind:'link', url:'https://example.com/?page=1', pinned:true }] }];
  const trash = [{ id:'trash-bookmark', kind:'bookmark', deletedAt:Date.now(), item:{ id:'deleted-site', kind:'link', title:'已删除网址', url:'https://deleted.example.com/' }, parentId:'bookmark-folder', index:0, previousId:'', nextId:'' }];
  const changed = { ...original.data, bookmarks, trash };
  const response = await call('/vault', 'PUT', JSON.stringify({ revision:original.revision, data:changed }));
  assert.equal(response.status, 200);
  const current = await (await call('/vault')).json();
  assert.deepEqual(current.data.bookmarks, bookmarks);
  assert.deepEqual(current.data.trash, trash);
  const session = await (await call('/auth/session')).json();
  assert.deepEqual(session.data.bookmarks, bookmarks);
  assert.deepEqual(await (await call('/vault', 'GET', undefined, BOB.username, bob.cookie)).json(), bobBefore);
  await env.DB.prepare('UPDATE account_vaults SET updated = ? WHERE account_id = ?').bind(Date.now()+60001,alice.data.id).run();
  const restore = await call('/vault', 'PUT', JSON.stringify({ revision:current.revision, data:original.data }));
  assert.equal(restore.status, 200);
  const snapshot = await (await call(`/backups/${current.revision}`)).json();
  assert.deepEqual(snapshot.data.bookmarks, bookmarks);
  assert.deepEqual(snapshot.data.trash, trash);
  const bad = await call('/vault', 'PUT', JSON.stringify({ revision:current.revision+1, data:{ ...changed, bookmarks:[{ id:'bad', kind:'link', title:'bad', url:'javascript:alert(1)' }] } }));
  assert.equal(bad.status, 400);
});

test('older bookmark clients keep same-URL metadata while URL changes clear it', async () => {
  const current = await (await call('/vault')).json();
  const uploaded = await call('/assets','POST',new Uint8Array([1]),ALICE.username,alice.cookie,{ 'X-File-Name':'legacy-favicon.ico' });
  assert.equal(uploaded.status,201);
  const favicon = `/api/assets/${(await uploaded.json()).id}`;
  const link = { id:'metadata-bookmark', kind:'link', title:'Reference', url:'https://example.com/path', description:'Useful summary', favicon };
  const first = await call('/vault', 'PUT', JSON.stringify({ revision:current.revision, data:{ ...current.data, bookmarks:[link] } }));
  assert.equal(first.status, 200);
  const afterFirst = await (await call('/vault')).json();

  const legacyWrite = await call('/vault', 'PUT', JSON.stringify({
    revision:afterFirst.revision,
    data:{ ...afterFirst.data, bookmarks:[{ id:link.id, kind:'link', title:'Renamed by old client', url:'https://EXAMPLE.com/path' }] }
  }));
  assert.equal(legacyWrite.status, 200);
  const preserved = (await (await call('/vault')).json()).data.bookmarks[0];
  assert.equal(preserved.description, link.description);
  assert.equal(preserved.favicon, favicon);

  const beforeChangedURL = await (await call('/vault')).json();
  const changedURL = await call('/vault', 'PUT', JSON.stringify({
    revision:beforeChangedURL.revision,
    data:{ ...beforeChangedURL.data, bookmarks:[{ id:link.id, kind:'link', title:'New URL', url:'https://example.com/other' }] }
  }));
  assert.equal(changedURL.status, 200);
  const changed = (await (await call('/vault')).json()).data.bookmarks[0];
  assert.equal(changed.description, undefined);
  assert.equal(changed.favicon, undefined);
});

test('record sync writes only changed records and returns tombstones to other devices', async () => {
  const before = await (await call('/vault')).json();
  const added = { id:'delta-note', title:'增量同步', type:'note', category:'开发', tags:['delta'], body:'仅同步这一条', source:'', created:10, updated:11, pinned:false };
  const target = { ...before.data, notes:[...before.data.notes, added], categories:[...new Set([...before.data.categories, '开发'])] };
  const changes = diffVaultChanges(before.data, target);
  const saved = await call('/vault/changes', 'POST', JSON.stringify({ revision:before.revision, changes }));
  assert.equal(saved.status, 200);
  const savedRevision = await saved.json();
  assert.equal(savedRevision.revision, before.revision + 1);
  assert.deepEqual(applyVaultChanges(before.data, changes), target);

  const delta = await (await call(`/vault/changes?after=${before.revision}`)).json();
  assert.equal(delta.resetRequired, false);
  assert.equal(delta.changes[0].revision, savedRevision.revision);
  assert.deepEqual(applyVaultChanges(before.data, delta.changes[0].changes), target);
  assert.deepEqual((await env.DB.prepare('SELECT id FROM account_notes WHERE account_id = ? AND id = ?').bind(alice.data.id, 'delta-note').all()).results,
    [{ id:'delta-note' }]);

  const removed = { ...target, notes:target.notes.filter(note => note.id !== added.id) };
  const deletion = await call('/vault/changes', 'POST', JSON.stringify({
    revision:savedRevision.revision, changes:diffVaultChanges(target, removed)
  }));
  assert.equal(deletion.status, 200);
  const tombstone = await (await call(`/vault/changes?after=${savedRevision.revision}`)).json();
  assert.deepEqual(tombstone.changes[0].changes.notes.delete, ['delta-note']);
  assert.deepEqual((await (await call('/vault')).json()).data.notes, removed.notes);

  const stale = await call('/vault/changes', 'POST', JSON.stringify({ revision:before.revision, changes }));
  assert.equal(stale.status, 409, 'a stale record batch cannot overwrite a newer revision');
  const expiredCursor = await (await call('/vault/changes?after=0')).json();
  assert.equal(expiredCursor.resetRequired, true, 'a client older than retained history must reload the aggregate');
  const futureCursor = await (await call(`/vault/changes?after=${savedRevision.revision + 2}`)).json();
  assert.equal(futureCursor.revision, savedRevision.revision + 1);
  assert.equal(futureCursor.resetRequired, true, 'a client ahead of a restored server revision must reload the aggregate');
  assert.deepEqual(futureCursor.changes, []);
});

test('multi-record vaults above the former one-megabyte limit remain readable and synchronizable', async () => {
  const before = await (await call('/vault')).json();
  const category = before.data.categories[0] || '容量测试';
  const additions = Array.from({ length:14 }, (_, index) => ({
    id:`bulk-note-${index}`, title:`长笔记 ${index}`, type:'note', category, tags:[],
    body:'x'.repeat(80_000), source:'', created:index + 100, updated:index + 100, pinned:false
  }));
  const target = { ...before.data, notes:[...before.data.notes, ...additions] };
  assert.ok(new TextEncoder().encode(JSON.stringify(target)).byteLength > 1_000_000);

  const response = await call('/vault/changes', 'POST', JSON.stringify({
    revision:before.revision, changes:diffVaultChanges(before.data, target)
  }));
  assert.equal(response.status, 200);
  const current = await (await call('/vault')).json();
  assert.equal(current.data.notes.length, target.notes.length);
  assert.ok(new TextEncoder().encode(JSON.stringify(current.data)).byteLength > 1_000_000);
  const session = await (await call('/auth/session')).json();
  assert.equal(session.data.notes.length, target.notes.length);
  const invalid = { ...current.data, notes:[...current.data.notes, {
    id:'too-long-note', title:'正文超限', type:'note', category, tags:[], body:'x'.repeat(1_000_001),
    source:'', created:1, updated:1, pinned:false
  }] };
  const rejected = await call('/vault', 'PUT', JSON.stringify({ revision:current.revision, data:invalid }));
  assert.equal(rejected.status, 400, 'the per-note field limit remains in force after removing the aggregate byte cap');
  assert.equal((await (await call('/vault')).json()).revision, current.revision);
});

test('backup import assets stay private until one idempotent revision commit, and abort removes only its own unreferenced uploads', async () => {
  const owner = await registerAccount({ username:'scope_import', password:'Import scope safe phrase 6!' });
  const ownCall = (path, method = 'GET', body, ...args) => call(path, method, body, owner.cookie, ...args);
  const before = await (await ownCall('/vault')).json();
  const scopeResponse = await ownCall('/assets/import-scopes', 'POST');
  assert.equal(scopeResponse.status, 201);
  const scope = await scopeResponse.json();
  assert.equal(scope.status, 'staging');

  const payload = new TextEncoder().encode('private imported attachment');
  const uploaded = await ownCall('/assets', 'POST', payload, { 'X-File-Name':'imported.txt', 'X-Import-Scope-Id':scope.id });
  assert.equal(uploaded.status, 201);
  const asset = await uploaded.json();
  assert.equal((await ownCall('/assets')).ok, true);
  assert.equal((await (await ownCall('/assets')).json()).some(item => item.id === asset.id), false, 'staged attachments are not listed');
  assert.equal((await ownCall(`/assets/${asset.id}`)).status, 404, 'staged attachments cannot be downloaded');
  assert.equal((await call(`/assets/import-scopes/${scope.id}`, 'GET', undefined, BOB.username, bob.cookie)).status, 404, 'scope IDs are account scoped');
  assert.equal((await call(`/assets/import-scopes/${scope.id}`, 'DELETE', undefined, BOB.username, bob.cookie)).status, 404, 'another account cannot abort the scope');

  const invalidScope = await (await ownCall('/assets/import-scopes', 'POST')).json();
  const invalidId = '123e4567-e89b-42d3-a456-426614174126';
  const invalidData = { ...before.data, notes:[...before.data.notes, {
    id:'missing-import-asset', title:'缺失导入附件', type:'note', category:'其他', tags:[],
    body:`<img src="/api/assets/${invalidId}">`, source:'', created:20, updated:21, pinned:false
  }] };
  const rejectedImport = await ownCall('/vault/import', 'POST', JSON.stringify({ scopeId:invalidScope.id, revision:before.revision, data:invalidData }));
  assert.equal(rejectedImport.status,422,await rejectedImport.clone().text());
  assert.equal((await (await ownCall('/vault')).json()).revision,before.revision);
  assert.equal((await ownCall(`/assets/import-scopes/${invalidScope.id}`, 'DELETE')).status,200,
    'a rejected import leaves its scope available for safe client cleanup');

  const importedNote = { id:'imported-note', title:'导入内容', type:'note', category:'其他', tags:[],
    body:`<p><a href="/api/assets/${asset.id}">附件</a></p>`, source:'', created:20, updated:21, pinned:false };
  const importedData = { ...before.data, notes:[...before.data.notes, importedNote] };
  const mutation = JSON.stringify({ scopeId:scope.id, revision:before.revision, data:importedData });
  const committed = await ownCall('/vault/import', 'POST', mutation);
  assert.equal(committed.status, 200, await committed.clone().text());
  const result = await committed.json();
  assert.equal(result.revision, before.revision + 1);
  const committedScope = await (await ownCall(`/assets/import-scopes/${scope.id}`)).json();
  assert.equal(committedScope.status, 'committed');
  assert.equal(committedScope.resultRevision, result.revision);
  assert.deepEqual(new Uint8Array(await (await ownCall(`/assets/${asset.id}`)).arrayBuffer()), payload, 'committed attachment becomes readable');
  assert.equal((await (await ownCall('/assets')).json()).some(item => item.id === asset.id), true);
  const retry = await ownCall('/vault/import', 'POST', mutation);
  assert.equal(retry.status, 200, 'lost-response retries return the original result');
  assert.deepEqual(await retry.json(), result);
  assert.equal((await (await ownCall('/vault')).json()).revision, result.revision, 'idempotent retry does not replace the vault twice');

  const abortScope = await (await ownCall('/assets/import-scopes', 'POST')).json();
  const abandoned = await ownCall('/assets', 'POST', new TextEncoder().encode('discard me'), {
    'X-File-Name':'abandoned.txt', 'X-Import-Scope-Id':abortScope.id
  });
  assert.equal(abandoned.status, 201);
  const abandonedAsset = await abandoned.json();
  const conflicted = await ownCall('/vault/import', 'POST', JSON.stringify({
    scopeId:abortScope.id, revision:before.revision, data:importedData
  }));
  assert.equal(conflicted.status, 409, 'a stale import cannot overwrite the latest vault');
  assert.equal((await ownCall(`/assets/import-scopes/${abortScope.id}`, 'DELETE')).status, 200);
  assert.equal((await ownCall(`/assets/${abandonedAsset.id}`)).status, 404, 'aborting a staging scope removes its unreferenced files');
  const abortedCommit = await ownCall('/vault/import', 'POST', JSON.stringify({ scopeId:abortScope.id, revision:result.revision, data:before.data }));
  assert.equal(abortedCommit.status, 409, 'an aborted scope can never replace the vault');
  assert.equal((await (await ownCall('/assets/import-scopes', 'POST')).json()).status, 'staging');
  assert.equal((await ownCall(`/assets/import-scopes/${scope.id}`, 'DELETE')).status, 200, 'aborting a committed scope preserves committed attachments');
  assert.deepEqual(new Uint8Array(await (await ownCall(`/assets/${asset.id}`)).arrayBuffer()), payload);

  const referencedScope = await (await ownCall('/assets/import-scopes', 'POST')).json();
  const referencedUpload = await ownCall('/assets', 'POST', new TextEncoder().encode('retain referenced file'), {
    'X-File-Name':'retained.txt', 'X-Import-Scope-Id':referencedScope.id
  });
  const referencedAsset = await referencedUpload.json();
  const latest = await (await ownCall('/vault')).json();
  const referenceNote = { ...importedNote, id:'abort-reference', body:`<img src="/api/assets/${referencedAsset.id}">` };
  const referenceWrite = await ownCall('/vault', 'PUT', JSON.stringify({ revision:latest.revision, data:{ ...latest.data, notes:[...latest.data.notes, referenceNote] } }));
  assert.equal(referenceWrite.status, 422, 'a regular save cannot publish an attachment before its import scope commits');
  const abortedReferenced = await (await ownCall(`/assets/import-scopes/${referencedScope.id}`, 'DELETE')).json();
  assert.equal(abortedReferenced.status, 'aborted');
  assert.equal((await ownCall(`/assets/${referencedAsset.id}`)).status,404,
    'aborting an unpublished staging scope removes its attachment');

  const expiredScope = await (await ownCall('/assets/import-scopes', 'POST')).json();
  const expiredUpload = await ownCall('/assets', 'POST', new TextEncoder().encode('expire me'), {
    'X-File-Name':'expired.txt', 'X-Import-Scope-Id':expiredScope.id
  });
  const expiredAsset = await expiredUpload.json();
  await env.DB.prepare('UPDATE account_asset_import_scopes SET updated = 0 WHERE account_id = ? AND id = ?').bind(owner.data.id, expiredScope.id).run();
  await ownCall('/assets');
  assert.equal((await (await ownCall(`/assets/import-scopes/${expiredScope.id}`)).json()).status, 'aborted');
  assert.equal((await ownCall(`/assets/${expiredAsset.id}`)).status, 404, 'expired staging scopes are cleaned without changing regular seven-day pruning');
});
