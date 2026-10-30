import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PASSWORD_ITERATIONS, parseResetConfirmation, resetAccountPassword } from '../../server/reset-password.mjs';
import { resetLocalAccountPassword } from '../../server/repositories/local-account-repository.mjs';

function resetDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE accounts (
    id TEXT PRIMARY KEY, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_iterations INTEGER NOT NULL
  );
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL);
  CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, account_id TEXT);
  CREATE TABLE auth_mfa_challenges (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL);
  CREATE TABLE account_totp (
    account_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, secret_iv TEXT, secret_ciphertext TEXT,
    secret_tag TEXT, last_counter INTEGER NOT NULL DEFAULT -1, pending_id TEXT, pending_iv TEXT,
    pending_ciphertext TEXT, pending_tag TEXT, pending_expires INTEGER, activation_id TEXT, recovery_batch_id TEXT
  );
  CREATE TABLE account_totp_recovery_codes (account_id TEXT NOT NULL, code_hash TEXT NOT NULL, consumed_at INTEGER);
  CREATE TABLE account_extension_pairings (code_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE account_extension_tokens (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, revoked_at INTEGER);
  CREATE TABLE account_vaults (account_id TEXT PRIMARY KEY, data TEXT NOT NULL);
  INSERT INTO accounts VALUES ('account-1', 'old-salt', 'old-hash', ${PASSWORD_ITERATIONS});
  INSERT INTO sessions VALUES ('session-1', 'account-1');
  INSERT INTO auth_challenges VALUES ('challenge-1', 'account-1');
  INSERT INTO auth_mfa_challenges VALUES ('mfa-challenge-1', 'account-1');
  INSERT INTO account_totp VALUES ('account-1', 1, 'iv', 'cipher', 'tag', 42, 'pending', 'pending-iv', 'pending-cipher', 'pending-tag', 123, 'activation', 'batch');
  INSERT INTO account_totp_recovery_codes VALUES ('account-1', 'recovery-hash', NULL);
  INSERT INTO account_extension_pairings VALUES ('pairing-account-1', 'account-1', 'Chrome', 1, 9999999999999);
  INSERT INTO account_extension_pairings VALUES ('pairing-account-2', 'account-2', 'Chrome', 1, 9999999999999);
  INSERT INTO account_extension_tokens VALUES ('extension-1', 'account-1', NULL);
  INSERT INTO account_extension_tokens VALUES ('extension-2', 'account-1', NULL);
  INSERT INTO account_extension_tokens VALUES ('other-account-extension', 'account-2', NULL);
  INSERT INTO account_vaults VALUES ('account-1', '{"notes":[{"title":"private note"}]}');`);
  return db;
}

test('password reset confirmation accepts Y and N regardless of case and whitespace', () => {
  assert.equal(parseResetConfirmation(' Y '), true);
  assert.equal(parseResetConfirmation('y'), true);
  assert.equal(parseResetConfirmation(' N '), false);
  assert.equal(parseResetConfirmation('n'), false);
  assert.throws(() => parseResetConfirmation('RESET'), /请输入 Y 或 N/);
  assert.throws(() => parseResetConfirmation(''), /请输入 Y 或 N/);
});

test('user-provided password resets credentials and revokes the account sessions', () => {
  const db = resetDatabase();
  try {
    const password = 'My garden 2026!';
    const result = resetAccountPassword(db, 'account-1', password);
    const credential = db.prepare('SELECT password_salt, password_hash, password_iterations FROM accounts WHERE id = ?').get('account-1');
    const verifier = pbkdf2Sync(password, Buffer.from(credential.password_salt, 'base64'), PASSWORD_ITERATIONS, 32, 'sha256');
    const expectedHash = createHash('sha256').update(verifier).digest('base64');
    assert.equal(credential.password_hash, expectedHash);
    assert.equal(credential.password_iterations, PASSWORD_ITERATIONS);
    assert.equal(result.sessionsRevoked, 1);
    assert.equal(result.extensionPairingsRevoked, 1);
    assert.equal(result.extensionTokensRevoked, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_challenges').get().count, 0);
    assert.deepEqual({ ...db.prepare('SELECT enabled, secret_iv, secret_ciphertext, secret_tag, last_counter, pending_id, pending_ciphertext, activation_id, recovery_batch_id FROM account_totp WHERE account_id = ?').get('account-1') }, {
      enabled:0, secret_iv:null, secret_ciphertext:null, secret_tag:null, last_counter:-1,
      pending_id:null, pending_ciphertext:null, activation_id:null, recovery_batch_id:null
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account_totp_recovery_codes').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_mfa_challenges').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account_extension_pairings WHERE account_id = ?').get('account-1').count, 0,
      'administrator password reset invalidates unused extension pairing codes');
    assert.equal(db.prepare('SELECT code_hash FROM account_extension_pairings WHERE account_id = ?').get('account-2').code_hash, 'pairing-account-2',
      'password reset does not invalidate another account pairing code');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account_extension_tokens WHERE account_id = ? AND revoked_at IS NULL').get('account-1').count, 0,
      'administrator password reset revokes every extension token for the account');
    assert.equal(db.prepare('SELECT revoked_at FROM account_extension_tokens WHERE id = ?').get('other-account-extension').revoked_at, null,
      'password reset does not revoke another account extension token');
    assert.equal(result.totpDisabled, true);
    assert.equal(db.prepare('SELECT data FROM account_vaults WHERE account_id = ?').get('account-1').data, '{"notes":[{"title":"private note"}]}');
  } finally {
    db.close();
  }
});

test('invalid reset password and unknown account leave stored credentials unchanged', () => {
  const db = resetDatabase();
  try {
    const original = db.prepare('SELECT password_salt, password_hash FROM accounts WHERE id = ?').get('account-1');
    assert.throws(() => resetAccountPassword(db, 'account-1', 'password'), /至少需要包含/);
    assert.throws(() => resetAccountPassword(db, 'missing-account', 'New-password-2026'), /账号不存在/);
    assert.deepEqual(db.prepare('SELECT password_salt, password_hash FROM accounts WHERE id = ?').get('account-1'), original);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
  } finally {
    db.close();
  }
});

test('password reset stays compatible with databases that have not applied the optional TOTP migration', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_iterations INTEGER NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL);
      CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, account_id TEXT);
      INSERT INTO accounts VALUES ('legacy-account', 'old-salt', 'old-hash', ${PASSWORD_ITERATIONS});`);
    assert.deepEqual(resetLocalAccountPassword(db, { accountId:'legacy-account', salt:'new-salt', passwordHash:'new-hash', iterations:PASSWORD_ITERATIONS }), {
      sessionsRevoked:0, extensionPairingsRevoked:0, extensionTokensRevoked:0, totpDisabled:false
    });
    assert.equal(db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get('legacy-account').password_hash,'new-hash');
  } finally {
    db.close();
  }
});
