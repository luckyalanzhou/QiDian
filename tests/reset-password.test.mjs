import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PASSWORD_ITERATIONS, parseResetConfirmation, resetAccountPassword } from '../server/reset-password.mjs';

function resetDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE accounts (
    id TEXT PRIMARY KEY, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_iterations INTEGER NOT NULL
  );
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL);
  CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, account_id TEXT);
  CREATE TABLE account_vaults (account_id TEXT PRIMARY KEY, data TEXT NOT NULL);
  INSERT INTO accounts VALUES ('account-1', 'old-salt', 'old-hash', ${PASSWORD_ITERATIONS});
  INSERT INTO sessions VALUES ('session-1', 'account-1');
  INSERT INTO auth_challenges VALUES ('challenge-1', 'account-1');
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
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_challenges').get().count, 0);
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
