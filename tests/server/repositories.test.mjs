import test from 'node:test';
import assert from 'node:assert/strict';
import { findVault, findVaultChanges, findVaultRevision, saveVaultAtRevision } from '../../server/repositories/vault-repository.js';
import { createCurrentVaultSnapshot, findVaultSnapshot, listVaultSnapshots } from '../../server/repositories/backup-repository.js';
import { appendAccountAssetUploadChunks, beginAccountAssetUpload, deleteAccountAssets, deleteAccountAssetUpload, deleteExpiredAccountAssetUploads, findAccountAssetPruneRevision, findExpiredAccountAssetCandidates, finalizeAccountAssetUpload, listAccountAssetReferencePage, findAccountAsset, getAccountAssetChunk, listAccountAssets } from '../../server/repositories/asset-repository.js';
import { clearAccountAvatar, findAccountAvatar, findAccountPasswordHash, findAccountPasswordSalt, findAccountProfile, findFirstAccount, saveAccountAvatar, updateAccountPassword } from '../../server/repositories/account-repository.js';
import {
  consumeAuthChallenge, createAuthChallenge, createRegisteredAccount, createSession,
  deleteSession, findAccountByNormalizedUsername, findAuthChallenge, findChallengeAccount,
  findAuthorizedSession, findLegacyClaim, findLegacyDataForFirstOwner, findRegistrationName,
  hasAccountVault, recordAuthThrottleAttempts, refreshSessionExpiry
} from '../../server/repositories/auth-repository.js';
import { findLocalAccountForPasswordReset, resetLocalAccountPassword } from '../../server/repositories/local-account-repository.mjs';

function database({ firstResults = [] } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        first: async () => { calls.push({ sql, parameters: [] }); return firstResults.shift() ?? null; },
        bind(...parameters) {
          const statement = { sql, parameters };
          calls.push(statement);
          statement.first = async () => firstResults.shift() ?? null;
          statement.all = async () => ({ results: [] });
          statement.run = async () => ({ meta: { changes: 1 } });
          return statement;
        }
      };
    },
    async batch(statements) { calls.push({ batch: statements }); return statements.map(() => ({ meta: { changes: 1 } })); }
  };
}

test('vault repository rebuilds aggregate reads and applies revision-checked record changes atomically', async () => {
  const db = database({ firstResults: [
    { revision: 4, updated: 30 }, { revision: 4 }, { revision: 4 },
    { revision: 4, updated: 30 }, { revision: 4 }
  ] });
  assert.deepEqual(await findVault(db, 'account-a'), { revision: 4, updated: 30, data: '{"categories":[],"notes":[],"bookmarks":[],"trash":[]}' });
  assert.deepEqual(await findVaultRevision(db, 'account-a'), { revision: 4 });
  const data = JSON.stringify({ categories: [], noteTypes: [{ id:'note', name:'普通笔记' }], notes: [], bookmarks: [], theme:'light', pasteMode:'rich' });
  const saved = await saveVaultAtRevision(db, {
    accountId: 'account-a', revision: 4, data, updated: 100
  });
  assert.equal(saved.meta.changes, 1);
  const batch = db.calls.find(call => call.batch).batch;
  assert.match(batch[0].sql, /WHERE account_id = \? AND revision = \?/);
  assert.deepEqual(batch[0].parameters.slice(0, 1), [100]);
  assert.equal(batch.length, 18, 'CAS, snapshot, changed normalized records, journal and retention use one atomic batch');
  assert.ok(batch.every(statement => /account_vaults|account_notes|account_note_tags|account_bookmarks|account_categories|account_note_types|account_trash|account_preferences|account_snapshots/.test(statement.sql)));
});

test('vault change reads use one snapshot and exclude rows after the current revision', async () => {
  const calls = [];
  const availableChanges = [
    { currentRevision: 5, oldestRevision: 1, changeRevision: 5, changeData: '{"sequence":5}' },
    { currentRevision: 5, oldestRevision: 1, changeRevision: 6, changeData: '{"sequence":6}' }
  ];
  const db = {
    prepare(sql) {
      return {
        sql,
        bind(...parameters) {
          const statement = { sql, parameters };
          calls.push(statement);
          statement.all = async () => ({ results: availableChanges.filter(row =>
            row.changeRevision > parameters[0] && row.changeRevision <= row.currentRevision) });
          return statement;
        }
      };
    }
  };

  const result = await findVaultChanges(db, 'account-a', 4);

  assert.equal(result.revision, 5);
  assert.equal(result.hasMore, false);
  assert.deepEqual(result.changes, [{ revision: 5, changes: { sequence: 5 } }]);
  assert.equal(calls.length, 1, 'revision, retained-history boundary and changes share one read snapshot');
  assert.match(calls[0].sql, /LEFT JOIN account_vault_changes/);
  assert.match(calls[0].sql, /journal\.revision > \? AND journal\.revision <= vault\.revision/);
  assert.deepEqual(calls[0].parameters, [4, 'account-a']);
});

test('vault change reads require a full refresh when pruning advances after an earlier boundary read', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return { sql, bind(...parameters) {
        const statement = { sql, parameters };
        calls.push(statement);
        statement.first = async () => {
          if (sql.includes('SELECT revision FROM account_vaults')) return { revision: 1002 };
          if (sql.includes('SELECT MIN(revision)')) return { revision: 2 };
          return null;
        };
        statement.all = async () => ({ results: sql.includes('LEFT JOIN account_vault_changes')
          ? [{ currentRevision: 1002, oldestRevision: 1002, changeRevision: 1002, changeData: '{"sequence":1002}' }]
          : [{ revision: 1002, changes: '{"sequence":1002}' }] });
        return statement;
      } };
    }
  };

  const result = await findVaultChanges(db, 'account-a', 1);

  assert.deepEqual(result, { revision: 1002, resetRequired: true, changes: [] });
  assert.equal(calls.length, 1, 'the server never combines a pre-prune boundary with post-prune rows');
});

test('vault change reads page 100 records and continue from the last applied revision', async () => {
  const changes = Array.from({ length: 101 }, (_, index) => ({
    currentRevision: 101, oldestRevision: 1, changeRevision: index + 1, changeData: JSON.stringify({ sequence: index + 1 })
  }));
  const db = {
    prepare(sql) {
      return { sql, bind(afterRevision) {
        return { all: async () => ({ results: changes.filter(row => row.changeRevision > afterRevision).slice(0, 101) }) };
      } };
    }
  };

  const firstPage = await findVaultChanges(db, 'account-a', 0);
  const secondPage = await findVaultChanges(db, 'account-a', firstPage.changes.at(-1).revision);

  assert.equal(firstPage.revision, 101);
  assert.equal(firstPage.changes.length, 100);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.changes.at(-1).revision, 100);
  assert.equal(secondPage.changes.length, 1);
  assert.equal(secondPage.changes[0].revision, 101);
  assert.equal(secondPage.hasMore, false);
});

test('snapshot repository scopes list, read, create and retention cleanup by account', async () => {
  const db = database({ firstResults: [
    { revision: 7, updated: 400 }, { revision: 7 }, { revision: 6, data: '{"notes":[1]}' }
  ] });
  await listVaultSnapshots(db, 'account-a');
  assert.deepEqual(await createCurrentVaultSnapshot(db, 'account-a', 500), { revision: 7, created: 500 });
  const batch = db.calls.find(call => call.batch).batch;
  assert.equal(batch.length, 2);
  assert.deepEqual(batch[0].parameters, ['account-a', 7, '{"categories":[],"notes":[],"bookmarks":[],"trash":[]}', 500]);
  assert.deepEqual(batch[1].parameters, ['account-a', 'account-a']);
  assert.match(batch[1].sql, /LIMIT 20/);
  assert.deepEqual(await findVaultSnapshot(db, 'account-a', 6), { revision: 6, data: '{"notes":[1]}' });
  assert.deepEqual(db.calls.at(-1).parameters, ['account-a', 6]);
  assert.equal(await createCurrentVaultSnapshot(database(), 'account-a', 600), null, 'missing account data creates no snapshot');
});

test('asset repository stages ordered chunks, finalizes atomically and scopes IO by account', async () => {
  const calls = [];
  const queryResults = [{ name:'a.bin' }, { count:2, bytes:262146, firstOrdinal:0, lastOrdinal:1 }];
  const db = {
    prepare(sql) {
      return { bind(...parameters) {
        const statement = { sql, parameters };
        calls.push(statement);
        statement.first = async () => queryResults.shift() ?? null;
        statement.all = async () => ({ results: [] });
        statement.run = async () => ({ meta:{ changes:1 } });
        return statement;
      } };
    },
    async batch(statements) { calls.push({ batch: statements }); return []; }
  };
  const chunkSize = 256 * 1024, bytes = new Uint8Array(chunkSize + 2);
  bytes[chunkSize] = 7;
  await beginAccountAssetUpload(db, { accountId:'account-a', id:'asset-1', name:'a.bin', created:10 });
  await appendAccountAssetUploadChunks(db, 'account-a', 'asset-1', [
    { ordinal:0, bytes:bytes.slice(0, chunkSize) }, { ordinal:1, bytes:bytes.slice(chunkSize) }
  ]);
  await finalizeAccountAssetUpload(db, { accountId:'account-a', id:'asset-1', name:'a.bin', mime:'application/octet-stream', size:bytes.length, created:10 });
  const chunkBatch = calls.find(call => call.batch)?.batch;
  assert.equal(chunkBatch.length, 3, 'chunk writes and upload heartbeat share a bounded transaction');
  assert.deepEqual(chunkBatch.slice(0, 2).map(statement => statement.parameters.slice(0, 3)), [
    ['account-a', 'asset-1', 0], ['account-a', 'asset-1', 1]
  ]);
  assert.match(calls[0].sql, /INSERT INTO account_assets[\s\S]*complete/);
  const finalize = calls.find(call => /UPDATE account_assets SET mime/.test(call.sql));
  assert.deepEqual(finalize.parameters, ['application/octet-stream',bytes.length,10,'account-a','asset-1']);
  assert.match(finalize.sql, /complete = 0/);
  await listAccountAssets(db, 'account-a');
  await findAccountAsset(db, 'account-a', 'asset-1');
  await getAccountAssetChunk(db, 'account-a', 'asset-1', 0);
  await deleteExpiredAccountAssetUploads(db, 'account-a', 100);
  await deleteAccountAssetUpload(db, 'account-a', 'asset-1');
  await findExpiredAccountAssetCandidates(db, 'account-a', 100, '', 25);
  await findAccountAssetPruneRevision(db, 'account-a');
  await listAccountAssetReferencePage(db, 'account-a', 'notes', '', 25);
  await deleteAccountAssets(db, 'account-a', ['asset-1'], 100, 7);
  const sql = calls.filter(call => call.sql).map(call => call.sql);
  assert.ok(sql.every(statement => /account_id/.test(statement)), 'every asset mutation carries an account ID');
  assert.ok(sql.filter(statement => /^(SELECT|DELETE)/.test(statement)).every(statement => /WHERE (?:a\.)?account_id = \?/.test(statement)), 'every asset read and delete filters by account');
  const candidates = calls.find(call => /SELECT id, size, created FROM account_assets/.test(call.sql));
  assert.match(candidates.sql, /complete = 1[\s\S]*created <= \?[\s\S]*id > \?[\s\S]*ORDER BY id LIMIT \?/,
    'pruning selects old assets in a bounded keyset batch without per-asset reference scans');
  assert.doesNotMatch(candidates.sql, /account_notes|account_bookmarks|account_trash|account_snapshots/);
  assert.deepEqual(candidates.parameters, ['account-a',100,'',25]);
  const referencePage = calls.find(call => /SELECT id AS id, data FROM account_notes/.test(call.sql));
  assert.match(referencePage.sql, /account_id = \? AND id > \? ORDER BY id LIMIT \?/,
    'references are read with bounded keyset pagination');
  assert.deepEqual(referencePage.parameters, ['account-a','',25]);
  const expiredUploadDelete = calls.find(call => /DELETE FROM account_assets WHERE account_id = \? AND complete = 0/.test(call.sql));
  assert.match(expiredUploadDelete.sql, /AND NOT \([\s\S]*account_notes[\s\S]*account_bookmarks[\s\S]*account_trash[\s\S]*account_snapshots/,
    'expired incomplete uploads referenced by current, trashed, bookmarked, or historical data are preserved');
  assert.match(calls.at(-1).batch[0].sql, /created <= \?[\s\S]*EXISTS \(SELECT 1 FROM account_vaults v[\s\S]*revision = \?/);
  assert.match(calls.at(-1).batch[0].sql, /instr\(s\.data, '\/api\/assets\/' \|\| account_assets\.id\)/,
    'the final deletion atomically rechecks snapshots because snapshot insertion may not advance the vault revision');
  assert.doesNotMatch(calls.at(-1).batch[0].sql, /instr\([nbt]\.data/,
    'large current-record tables are protected by the revision guard instead of correlated scans');
  assert.deepEqual(calls.at(-1).batch[0].parameters, ['account-a', 'asset-1', 100, 'account-a', 7]);
});

test('account repository scopes account data and keeps password update plus session revocation conditional', async () => {
  const db = database();
  await findAccountProfile(db, 'account-a');
  await findAccountAvatar(db, 'account-a');
  await saveAccountAvatar(db, { accountId: 'account-a', bytes: new ArrayBuffer(4), mime: 'image/png', updated: 10 });
  await clearAccountAvatar(db, 'account-a', 11);
  await findAccountPasswordSalt(db, 'account-a');
  await findAccountPasswordHash(db, 'account-a');
  await findFirstAccount(db);
  await updateAccountPassword(db, {
    accountId: 'account-a', expectedHash: 'old-hash', salt: 'new-salt', hash: 'new-hash', iterations: 600000, currentSessionHash: 'session-hash'
  });
  const statements = db.calls.at(-1).batch;
  assert.equal(statements.length, 2, 'credential update and revocation are submitted in one database batch');
  assert.deepEqual(statements[0].parameters, ['new-salt', 'new-hash', 600000, 'account-a', 'old-hash']);
  assert.deepEqual(statements[1].parameters, ['account-a', 'session-hash', 'account-a', 'new-hash']);
  assert.match(statements[0].sql, /WHERE id = \? AND password_hash = \?/);
  assert.match(statements[1].sql, /WHERE account_id = \?/);
  assert.ok(db.calls.slice(0, 6).every(call => call.parameters.includes('account-a')));
  assert.equal(db.calls[6].sql, 'SELECT id FROM accounts ORDER BY rowid LIMIT 1', 'device ownership is based on the first account, not the caller account');
});

test('auth repository owns challenge, session and atomic first-owner registration SQL', async () => {
  const db = database({ firstResults: [
    { claimed_by: null },
    { revision: 0, data: '{"categories":[],"notes":[],"theme":"light","pasteMode":"rich"}' },
    { count: 0 }, { count: 0 }, { id: 'account-a', username_normalized: 'alan', password_salt: 'salt' },
    { meta: { changes: 1 } }, { id: 'challenge-1', account_id: 'account-a' }, { meta: { changes: 1 } },
    { id: 'account-a', username: 'alan', password_hash: 'hash' },
    { account_id: 'account-a' }, { meta: { changes: 1 } }, { meta: { changes: 1 } }
  ] });

  await findRegistrationName(db, 'alan');
  await findLegacyClaim(db);
  assert.deepEqual(await findLegacyDataForFirstOwner(db), {
    vault: { revision: 0, data: '{"categories":[],"notes":[],"theme":"light","pasteMode":"rich"}' }, snapshotCount: 0, assetCount: 0
  });
  await findAccountByNormalizedUsername(db, 'alan');
  await createAuthChallenge(db, { id: 'challenge-1', accountId: 'account-a', username: 'alan', salt: 'salt', created: 1, expires: 2 });
  await findAuthChallenge(db, 'challenge-1', 1);
  assert.equal((await consumeAuthChallenge(db, 'challenge-1', 1)).meta.changes, 1);
  await findChallengeAccount(db, 'account-a');
  await hasAccountVault(db, 'account-a');
  await createSession(db, { tokenHash: 'token-hash', accountId: 'account-a', created: 1, expires: 2 });
  await deleteSession(db, 'token-hash');

  await createRegisteredAccount(db, {
    accountId: 'account-a', username: 'alan', salt: 'salt', passwordHash: 'hash', iterations: 600000,
    tokenHash: 'token-hash', now: 1, sessionExpires: 3, registrationEnabled: false
  });
  const batch = db.calls.at(-1).batch;
  assert.equal(batch.length, 29, 'account, default/legacy records, claim, snapshots, assets and session use one atomic batch');
  assert.deepEqual(batch[0].parameters, ['account-a', 'alan', 'alan', 'salt', 'hash', 600000, 1, 0]);
  assert.deepEqual(batch.at(-1).parameters, ['token-hash', 'account-a', 1, 3, 'account-a']);
  assert.ok(batch.slice(2, 4).every(statement => statement.parameters[0] === 'account-a'));
  assert.ok(batch.slice(4, 25).every(statement => statement.parameters[0] === 'account-a'));
  assert.match(db.calls[6].sql, /INSERT INTO auth_challenges/);
  assert.match(db.calls[8].sql, /DELETE FROM auth_challenges/);
  assert.match(db.calls[12].sql, /DELETE FROM sessions/);
});

test('auth repository owns session lookup, conditional renewal and throttle SQL', async () => {
  const db = database({ firstResults: [
    { id: 'account-a', username: 'alan', revision: 4, data: '{}', session_created: 100, session_expires: 200 },
    { attempts: 2 }, { attempts: 5 }
  ] });
  const session = await findAuthorizedSession(db, {
    tokenHash: 'session-hash', now: 150, minimumCreated: 50, includeVault: true
  });
  assert.equal(session.username, 'alan');
  assert.match(db.calls[0].sql, /JOIN account_vaults v ON v\.account_id = a\.id/);
  assert.match(db.calls[0].sql, /s\.token_hash = \? AND s\.expires > \? AND s\.created > \?/);
  assert.deepEqual(db.calls[0].parameters, ['session-hash', 150, 50]);

  await refreshSessionExpiry(db, { tokenHash: 'session-hash', expectedExpiry: 200, expires: 300 });
  assert.deepEqual(db.calls[1].parameters, [300, 'session-hash', 200]);
  assert.match(db.calls[1].sql, /WHERE token_hash = \? AND expires = \?/);

  const counts = await recordAuthThrottleAttempts(db, {
    scopes: [
      { bucketKey: 'login:ip:hash:1000' },
      { bucketKey: 'login:identity:hash:1000' }
    ],
    now: 1500,
    windowStart: 1000,
    retentionCutoff: -86398500
  });
  assert.deepEqual(counts, [{ attempts: 2 }, { attempts: 5 }]);
  const batch = db.calls.find(call => call.batch)?.batch;
  assert.equal(batch.length, 5);
  assert.deepEqual(batch.slice(0, 3).map(statement => statement.parameters), [[-86398500], [1500], [1500]]);
  assert.deepEqual(batch.slice(3).map(statement => statement.parameters), [
    ['login:ip:hash:1000', 1000], ['login:identity:hash:1000', 1000]
  ]);
  const throttleReads = db.calls.filter(call => /SELECT attempts FROM auth_throttles WHERE bucket_key = \?/.test(call.sql));
  assert.equal(throttleReads.length, 2);
  assert.deepEqual(throttleReads.map(call => call.parameters), [['login:ip:hash:1000'], ['login:identity:hash:1000']]);
});

test('local SQLite account repository owns password reset transaction and rollback', () => {
  const calls = [];
  const db = {
    exec(sql) { calls.push({ type: 'exec', sql }); },
    prepare(sql) {
      return {
        get(...parameters) {
          calls.push({ type: 'get', sql, parameters });
          return /sqlite_master/.test(sql) ? { present:0 } : { id: 'account-a', username: 'alan' };
        },
        run(...parameters) {
          calls.push({ type: 'run', sql, parameters });
          return { changes: /UPDATE accounts/.test(sql) ? 1 : /DELETE FROM sessions/.test(sql) ? 2 : 1 };
        }
      };
    }
  };
  assert.deepEqual(findLocalAccountForPasswordReset(db, 'alan'), { id: 'account-a', username: 'alan' });
  assert.deepEqual(resetLocalAccountPassword(db, {
    accountId: 'account-a', salt: 'salt', passwordHash: 'hash', iterations: 600000
  }), { sessionsRevoked: 2, extensionPairingsRevoked: 0, extensionTokensRevoked: 0, totpDisabled:false });
  assert.deepEqual(calls.map(call => call.type === 'exec' ? call.sql : call.parameters), [
    ['alan'], 'BEGIN IMMEDIATE', ['salt', 'hash', 600000, 'account-a'], ['account-a'], ['account-a'], ['account_extension_pairings'], ['account_extension_tokens'], ['account_totp'],
    ['account_totp_recovery_codes'], ['auth_mfa_challenges'], 'COMMIT'
  ]);

  calls.length = 0;
  const missingAccount = { ...db, prepare(sql) {
    return { run(...parameters) { calls.push({ type: 'run', sql, parameters }); return { changes: 0 }; } };
  } };
  assert.throws(() => resetLocalAccountPassword(missingAccount, {
    accountId: 'missing', salt: 'salt', passwordHash: 'hash', iterations: 600000
  }), /账号不存在/);
  assert.deepEqual(calls.map(call => call.sql), [
    'BEGIN IMMEDIATE',
    'UPDATE accounts SET password_salt = ?, password_hash = ?, password_iterations = ? WHERE id = ?',
    'ROLLBACK'
  ]);
});
