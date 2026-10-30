export function createPairingCode(db, { accountId, codeHash, name, created, expires }) {
  return db.batch([
    db.prepare('DELETE FROM account_extension_pairings WHERE account_id = ? OR expires <= ?').bind(accountId, created),
    db.prepare(`INSERT INTO account_extension_pairings(code_hash, account_id, name, created, expires)
      VALUES (?, ?, ?, ?, ?)`).bind(codeHash, accountId, name, created, expires)
  ]);
}

export async function consumePairingCodeAndCreateToken(db, { codeHash, now, token }) {
  const row = await db.prepare(`SELECT account_id, name FROM account_extension_pairings
    WHERE code_hash = ? AND expires > ?`).bind(codeHash, now).first();
  if (!row) return null;
  const [inserted] = await db.batch([
    db.prepare(`INSERT INTO account_extension_tokens
      (id, account_id, token_hash, name, scope, created, expires)
      SELECT ?, account_id, ?, name, 'bookmarks:create', ?, ?
      FROM account_extension_pairings WHERE code_hash = ? AND expires > ?`)
      .bind(token.id, token.tokenHash, token.created, token.expires, codeHash, now),
    db.prepare(`DELETE FROM account_extension_pairings WHERE code_hash = ? AND expires > ?`)
      .bind(codeHash, now)
  ]);
  return inserted?.meta?.changes === 1 ? row : null;
}

export function insertExtensionToken(db, { id, accountId, tokenHash, name, created, expires }) {
  return db.prepare(`INSERT INTO account_extension_tokens
    (id, account_id, token_hash, name, scope, created, expires)
    VALUES (?, ?, ?, ?, 'bookmarks:create', ?, ?)`)
    .bind(id, accountId, tokenHash, name, created, expires).run();
}

export async function findAndTouchExtensionToken(db, { tokenHash, now }) {
  const row = await db.prepare(`SELECT id, account_id FROM account_extension_tokens
    WHERE token_hash = ? AND scope = 'bookmarks:create' AND revoked_at IS NULL AND expires > ?`)
    .bind(tokenHash, now).first();
  if (!row) return null;
  const result = await db.prepare(`UPDATE account_extension_tokens SET last_used = ?
    WHERE id = ? AND revoked_at IS NULL AND expires > ? AND scope = 'bookmarks:create'`)
    .bind(now, row.id, now).run();
  return result?.meta?.changes === 1 ? row : null;
}

export async function listExtensionTokens(db, accountId, now) {
  const result = await db.prepare(`SELECT id, name, created, last_used, expires
    FROM account_extension_tokens WHERE account_id = ? AND revoked_at IS NULL AND expires > ?
    ORDER BY created DESC`).bind(accountId, now).all();
  return (result.results || []).map(row => ({
    id: row.id, name: row.name, created: Number(row.created),
    lastUsed: row.last_used == null ? null : Number(row.last_used), expires: Number(row.expires)
  }));
}

export async function revokeExtensionToken(db, { accountId, id, now }) {
  const result = await db.prepare(`UPDATE account_extension_tokens SET revoked_at = ?
    WHERE id = ? AND account_id = ? AND revoked_at IS NULL AND expires > ?`)
    .bind(now, id, accountId, now).run();
  return result?.meta?.changes === 1;
}

export function removeExpiredExtensionCredentials(db, now) {
  return db.batch([
    db.prepare('DELETE FROM account_extension_pairings WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM account_extension_tokens WHERE expires <= ? OR revoked_at IS NOT NULL').bind(now)
  ]);
}
