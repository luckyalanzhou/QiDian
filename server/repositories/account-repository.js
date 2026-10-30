export function findAccountProfile(db, accountId) {
  return db.prepare(`SELECT a.id, a.username, a.created, p.avatar_mime, COALESCE(t.enabled, 0) AS totp_enabled
    FROM accounts a LEFT JOIN account_profiles p ON p.account_id = a.id
      LEFT JOIN account_totp t ON t.account_id = a.id WHERE a.id = ?`).bind(accountId).first();
}

export function findAccountAvatar(db, accountId) {
  return db.prepare('SELECT avatar, avatar_mime FROM account_profiles WHERE account_id = ?').bind(accountId).first();
}

export function saveAccountAvatar(db, { accountId, bytes, mime, updated }) {
  return db.prepare(`INSERT INTO account_profiles(account_id, avatar, avatar_mime, updated) VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET avatar = excluded.avatar, avatar_mime = excluded.avatar_mime, updated = excluded.updated`)
    .bind(accountId, bytes, mime, updated).run();
}

export function clearAccountAvatar(db, accountId, updated) {
  return db.prepare('UPDATE account_profiles SET avatar = NULL, avatar_mime = NULL, updated = ? WHERE account_id = ?')
    .bind(updated, accountId).run();
}

export function findAccountPasswordSalt(db, accountId) {
  return db.prepare('SELECT password_salt FROM accounts WHERE id = ?').bind(accountId).first();
}

export function findAccountPasswordHash(db, accountId) {
  return db.prepare('SELECT password_hash FROM accounts WHERE id = ?').bind(accountId).first();
}

export function updateAccountPassword(db, { accountId, expectedHash, salt, hash, iterations, currentSessionHash }) {
  return db.batch([
    db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ?, password_iterations = ? WHERE id = ? AND password_hash = ?')
      .bind(salt, hash, iterations, accountId, expectedHash),
    db.prepare(`DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?
      AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND password_hash = ?)`)
      .bind(accountId, currentSessionHash, accountId, hash)
  ]);
}

export function findFirstAccount(db) {
  return db.prepare('SELECT id FROM accounts ORDER BY rowid LIMIT 1').first();
}
