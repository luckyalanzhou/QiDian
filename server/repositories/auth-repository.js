import { deleteVaultRecordStatements, insertVaultRecordStatements } from './vault-repository.js';

export function findAccountByNormalizedUsername(db, username) {
  return db.prepare('SELECT id, username_normalized, password_salt FROM accounts WHERE username_normalized = ?')
    .bind(username).first();
}

export function findRegistrationName(db, username) {
  return db.prepare('SELECT username_normalized FROM accounts WHERE username_normalized = ?')
    .bind(username).all();
}

export function findLegacyClaim(db) {
  return db.prepare('SELECT claimed_by FROM legacy_claim WHERE id = 1').first();
}

export async function findLegacyDataForFirstOwner(db) {
  const [vault, snapshots, assets] = await Promise.all([
    db.prepare('SELECT revision, data FROM vault WHERE id = 1').first(),
    db.prepare('SELECT COUNT(*) AS count FROM snapshots').first(),
    db.prepare('SELECT COUNT(*) AS count FROM assets').first()
  ]);
  return { vault, snapshotCount: snapshots?.count || 0, assetCount: assets?.count || 0 };
}

export function createRegisteredAccount(db, {
  accountId, username, salt, passwordHash, iterations, tokenHash, now, sessionExpires, registrationEnabled,
  records = emptyRecords(), defaultRecords = emptyRecords()
}) {
  return db.batch([
    db.prepare(`INSERT INTO accounts(id, username, username_normalized, password_salt, password_hash, password_iterations, created)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE ? = 1 OR NOT EXISTS (SELECT 1 FROM accounts)`)
      .bind(accountId, username, username, salt, passwordHash, iterations, now, registrationEnabled ? 1 : 0),
    db.prepare('UPDATE legacy_claim SET claimed_by = ? WHERE id = 1 AND claimed_by IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE id = ?)').bind(accountId, accountId),
    db.prepare(`INSERT INTO account_vaults(account_id, revision, updated)
      SELECT ?, revision, updated FROM vault WHERE id = 1 AND (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    db.prepare(`INSERT INTO account_vaults(account_id, revision, updated)
      VALUES (?, 0, ?) ON CONFLICT(account_id) DO NOTHING`).bind(accountId, now),
    ...insertVaultRecordStatements(db, accountId, defaultRecords, {}),
    ...deleteVaultRecordStatements(db, accountId, { requireLegacyClaim: true }),
    ...insertVaultRecordStatements(db, accountId, records, { requireLegacyClaim: true }),
    db.prepare(`INSERT INTO account_snapshots(account_id, revision, data, created)
      SELECT ?, revision, data, created FROM snapshots WHERE (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    db.prepare(`INSERT INTO account_assets(account_id, id, name, mime, size, created)
      SELECT ?, id, name, mime, size, created FROM assets WHERE (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    db.prepare(`INSERT INTO account_asset_chunks(account_id, asset_id, ordinal, data)
      SELECT ?, asset_id, ordinal, data FROM asset_chunks WHERE (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    db.prepare(`INSERT INTO sessions(token_hash, account_id, created, expires)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)`).bind(tokenHash, accountId, now, sessionExpires, accountId)
  ]);
}

export function createAuthChallenge(db, { id, accountId, username, salt, created, expires }) {
  return db.prepare('INSERT INTO auth_challenges(id, account_id, username_normalized, salt, created, expires) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, accountId, username, salt, created, expires).run();
}

export function findAuthChallenge(db, id, now) {
  return db.prepare('SELECT * FROM auth_challenges WHERE id = ? AND expires > ?').bind(id, now).first();
}

export function consumeAuthChallenge(db, id, now) {
  return db.prepare('DELETE FROM auth_challenges WHERE id = ? AND expires > ?').bind(id, now).run();
}

export function findChallengeAccount(db, accountId) {
  return db.prepare(`SELECT a.id, a.username, a.password_hash,
    COALESCE(t.enabled, 0) AS totp_enabled
    FROM accounts a LEFT JOIN account_totp t ON t.account_id = a.id WHERE a.id = ?`).bind(accountId).first();
}

export function createMfaChallenge(db, { tokenHash, accountId, created, expires }) {
  return db.prepare('INSERT INTO auth_mfa_challenges(token_hash, account_id, created, expires) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, accountId, created, expires).run();
}

export function hasAccountVault(db, accountId) {
  return db.prepare('SELECT account_id FROM account_vaults WHERE account_id = ?').bind(accountId).first();
}

export function createSession(db, { tokenHash, accountId, created, expires }) {
  return db.prepare('INSERT INTO sessions(token_hash, account_id, created, expires) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, accountId, created, expires).run();
}

export function deleteSession(db, tokenHash) {
  return db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export function findAuthorizedSession(db, { tokenHash, now, minimumCreated, includeVault = false }) {
  const columns = includeVault ? 'a.id, a.username, v.revision' : 'a.id, a.username';
  const vaultJoin = includeVault ? ' JOIN account_vaults v ON v.account_id = a.id' : '';
  return db.prepare(`SELECT ${columns}, s.created AS session_created, s.expires AS session_expires
    FROM sessions s JOIN accounts a ON a.id = s.account_id${vaultJoin}
    WHERE s.token_hash = ? AND s.expires > ? AND s.created > ?`)
    .bind(tokenHash, now, minimumCreated).first();
}

export function refreshSessionExpiry(db, { tokenHash, expectedExpiry, expires }) {
  return db.prepare('UPDATE sessions SET expires = ? WHERE token_hash = ? AND expires = ?')
    .bind(expires, tokenHash, expectedExpiry).run();
}

export async function recordAuthThrottleAttempts(db, { scopes, now, windowStart, retentionCutoff }) {
  const statements = [
    db.prepare('DELETE FROM auth_throttles WHERE window_start < ?').bind(retentionCutoff),
    db.prepare('DELETE FROM auth_challenges WHERE expires < ?').bind(now),
    db.prepare('DELETE FROM sessions WHERE expires < ?').bind(now),
    ...scopes.map(scope => db.prepare(`INSERT INTO auth_throttles(bucket_key, window_start, attempts) VALUES (?, ?, 1)
      ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1`)
      .bind(scope.bucketKey, windowStart))
  ];
  await db.batch(statements);
  return Promise.all(scopes.map(scope => db.prepare('SELECT attempts FROM auth_throttles WHERE bucket_key = ?')
    .bind(scope.bucketKey).first()));
}
function emptyRecords() {
  return { notes: [], tags: [], bookmarks: [], categories: [], noteTypes: [], trash: [], preferences: {} };
}
