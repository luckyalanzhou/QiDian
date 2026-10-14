import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openSelfHostedDatabase } from '../server/sqlite-migrations.mjs';

test('username-only migration removes contact data while preserving accounts, sessions and private data', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-username-migration-'));
  t.after(() => rm(temp, { recursive:true, force:true }));
  const oldMigrations = join(temp, 'old-migrations');
  await mkdir(oldMigrations);
  for (const name of [
    '0001_initial.sql', '0002_accounts.sql', '0003_email_auth.sql',
    '0004_account_profiles.sql', '0005_snapshot_retention.sql'
  ]) await copyFile(resolve('migrations', name), join(oldMigrations, name));

  const databasePath = join(temp, 'data', 'qidian.sqlite');
  const legacyDb = await openSelfHostedDatabase({ databasePath, migrationsDir:oldMigrations });
  const accountId = 'legacy-account-1';
  const oldVault = JSON.stringify({ categories:['本地'], notes:[{ id:'keep-me', title:'保留笔记' }] });
  try {
    await legacyDb.prepare(`INSERT INTO accounts
      (id, username, username_normalized, email, email_normalized, password_salt, password_hash, password_iterations, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(accountId, 'Legacy_User', 'legacy_user', 'private@example.invalid', 'private@example.invalid', 'salt-value', 'hash-value', 600000, 100).run();
    await legacyDb.prepare('INSERT INTO sessions(token_hash, account_id, created, expires) VALUES (?, ?, ?, ?)')
      .bind('session-hash', accountId, 101, 9_999_999_999).run();
    await legacyDb.prepare('UPDATE legacy_claim SET claimed_by = ? WHERE id = 1').bind(accountId).run();
    await legacyDb.prepare('INSERT INTO account_vaults(account_id, revision, data, updated) VALUES (?, ?, ?, ?)')
      .bind(accountId, 7, oldVault, 102).run();
    await legacyDb.prepare('INSERT INTO account_snapshots(account_id, revision, data, created) VALUES (?, ?, ?, ?)')
      .bind(accountId, 6, oldVault, 100).run();
    await legacyDb.prepare('INSERT INTO account_profiles(account_id, avatar, avatar_mime, updated) VALUES (?, ?, ?, ?)')
      .bind(accountId, new Uint8Array([1, 2, 3]), 'image/png', 103).run();
    await legacyDb.prepare(`INSERT INTO auth_challenges
      (id, account_id, username_normalized, email_normalized, salt, created, expires, purpose, code_hash, attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind('legacy-login', accountId, 'legacy_user', 'private@example.invalid', 'login-salt', 104, 999999, 'login', null, 0).run();
    await legacyDb.prepare(`INSERT INTO auth_challenges
      (id, account_id, username_normalized, email_normalized, salt, created, expires, purpose, code_hash, attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind('legacy-recovery', accountId, 'legacy_user', 'private@example.invalid', 'recovery-salt', 104, 999999, 'password-reset', 'recovery-code-hash', 1).run();
  } finally {
    legacyDb.close();
  }

  const currentDb = await openSelfHostedDatabase({ databasePath, migrationsDir:resolve('migrations') });
  try {
    const accountColumns = (await currentDb.prepare('PRAGMA table_info(accounts)').all()).results.map(row => row.name);
    assert.deepEqual(accountColumns, ['id', 'username', 'username_normalized', 'password_salt', 'password_hash', 'password_iterations', 'created']);
    const challengeColumns = (await currentDb.prepare('PRAGMA table_info(auth_challenges)').all()).results.map(row => row.name);
    assert.deepEqual(challengeColumns, ['id', 'account_id', 'username_normalized', 'salt', 'created', 'expires']);

    assert.deepEqual(await currentDb.prepare('SELECT id, username, username_normalized, password_salt, password_hash, password_iterations, created FROM accounts').all(), {
      results:[{ id:accountId, username:'Legacy_User', username_normalized:'legacy_user', password_salt:'salt-value', password_hash:'hash-value', password_iterations:600000, created:100 }]
    });
    assert.deepEqual(await currentDb.prepare('SELECT * FROM sessions').all(), {
      results:[{ token_hash:'session-hash', account_id:accountId, created:101, expires:259200101 }]
    });
    assert.deepEqual(await currentDb.prepare('SELECT revision, data FROM account_vaults WHERE account_id = ?').bind(accountId).all(), {
      results:[{ revision:7, data:oldVault }]
    });
    assert.deepEqual(await currentDb.prepare('SELECT revision, data FROM account_snapshots WHERE account_id = ?').bind(accountId).all(), {
      results:[{ revision:6, data:oldVault }]
    });
    assert.deepEqual(await currentDb.prepare('SELECT account_id, avatar, avatar_mime FROM account_profiles').all(), {
      results:[{ account_id:accountId, avatar:[1, 2, 3], avatar_mime:'image/png' }]
    });
    assert.deepEqual((await currentDb.prepare('SELECT id FROM auth_challenges').all()).results, [{ id:'legacy-login' }]);
    assert.deepEqual((await currentDb.prepare('SELECT claimed_by FROM legacy_claim WHERE id = 1').all()).results, [{ claimed_by:accountId }]);
    assert.deepEqual((await currentDb.prepare('PRAGMA foreign_key_check').all()).results, []);
    const backups = await readdir(join(temp, 'data', 'migration-backups'));
    assert.equal(backups.filter(name => name.startsWith('0006_username_only_login-before-')).length, 1);
  } finally {
    currentDb.close();
  }
});
