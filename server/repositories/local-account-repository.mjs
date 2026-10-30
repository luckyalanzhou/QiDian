export function findLocalAccountForPasswordReset(db, normalizedUsername) {
  return db.prepare('SELECT id, username FROM accounts WHERE username_normalized = ?').get(normalizedUsername);
}

export function resetLocalAccountPassword(db, { accountId, salt, passwordHash, iterations }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare(`UPDATE accounts SET password_salt = ?, password_hash = ?, password_iterations = ? WHERE id = ?`)
      .run(salt, passwordHash, iterations, accountId);
    if (Number(update.changes) !== 1) throw new Error('账号不存在，密码未更改');
    const sessionsRevoked = Number(db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId).changes);
    db.prepare('DELETE FROM auth_challenges WHERE account_id = ?').run(accountId);
    const tableExists = name => Number(db.prepare("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present").get(name).present) === 1;
    let totpDisabled = false;
    let extensionPairingsRevoked = 0;
    let extensionTokensRevoked = 0;
    if (tableExists('account_extension_pairings')) {
      extensionPairingsRevoked = Number(db.prepare('DELETE FROM account_extension_pairings WHERE account_id = ?').run(accountId).changes);
    }
    if (tableExists('account_extension_tokens')) {
      extensionTokensRevoked = Number(db.prepare(`UPDATE account_extension_tokens SET revoked_at = ?
        WHERE account_id = ? AND revoked_at IS NULL`).run(Date.now(), accountId).changes);
    }
    if (tableExists('account_totp')) {
      totpDisabled = Number(db.prepare(`UPDATE account_totp SET enabled = 0,
        secret_iv = NULL, secret_ciphertext = NULL, secret_tag = NULL, last_counter = -1,
        pending_id = NULL, pending_iv = NULL, pending_ciphertext = NULL, pending_tag = NULL,
        pending_expires = NULL, activation_id = NULL, recovery_batch_id = NULL
        WHERE account_id = ? AND (enabled = 1 OR pending_id IS NOT NULL)`).run(accountId).changes) === 1;
    }
    if (tableExists('account_totp_recovery_codes')) {
      db.prepare('DELETE FROM account_totp_recovery_codes WHERE account_id = ?').run(accountId);
    }
    if (tableExists('auth_mfa_challenges')) {
      db.prepare('DELETE FROM auth_mfa_challenges WHERE account_id = ?').run(accountId);
    }
    db.exec('COMMIT');
    return { sessionsRevoked, extensionPairingsRevoked, extensionTokensRevoked, totpDisabled };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
