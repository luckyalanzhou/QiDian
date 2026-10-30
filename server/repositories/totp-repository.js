export function findTotpState(db, accountId) {
  return db.prepare(`SELECT enabled, secret_iv, secret_ciphertext, secret_tag, last_counter,
      pending_id, pending_iv, pending_ciphertext, pending_tag, pending_expires
    FROM account_totp WHERE account_id = ?`).bind(accountId).first();
}

export function beginTotpEnrollment(db, { accountId, pendingId, encrypted, expires }) {
  return db.prepare(`INSERT INTO account_totp(
      account_id, enabled, pending_id, pending_iv, pending_ciphertext, pending_tag, pending_expires
    ) VALUES (?, 0, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      pending_id = excluded.pending_id, pending_iv = excluded.pending_iv,
      pending_ciphertext = excluded.pending_ciphertext, pending_tag = excluded.pending_tag,
      pending_expires = excluded.pending_expires, last_counter = -1,
      activation_id = NULL, recovery_batch_id = NULL
    WHERE account_totp.enabled = 0`)
    .bind(accountId, pendingId, encrypted.iv, encrypted.ciphertext, encrypted.tag, expires).run();
}

export async function enableTotp(db, { accountId, pendingId, counter, activationId, recoveryBatchId, recoveryCodeHashes, now }) {
  const results = await db.batch([
    db.prepare(`UPDATE account_totp SET
        enabled = 1, secret_iv = pending_iv, secret_ciphertext = pending_ciphertext, secret_tag = pending_tag,
        last_counter = ?, activation_id = ?, recovery_batch_id = ?,
        pending_id = NULL, pending_iv = NULL, pending_ciphertext = NULL, pending_tag = NULL, pending_expires = NULL
      WHERE account_id = ? AND enabled = 0 AND pending_id = ? AND pending_expires > ? AND last_counter < ?`)
      .bind(counter, activationId, recoveryBatchId, accountId, pendingId, now, counter),
    ...recoveryCodeHashes.map(codeHash => db.prepare(`INSERT INTO account_totp_recovery_codes(account_id, code_hash, batch_id, created)
      SELECT ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM account_totp WHERE account_id = ? AND enabled = 1
          AND activation_id = ? AND recovery_batch_id = ?
      )`).bind(accountId, codeHash, recoveryBatchId, now, accountId, activationId, recoveryBatchId))
  ]);
  if (results[0]?.meta?.changes !== 1 || results.slice(1).some(result => result?.meta?.changes !== 1)) return false;
  return true;
}

export function findMfaChallenge(db, tokenHash, now) {
  return db.prepare('SELECT account_id, expires FROM auth_mfa_challenges WHERE token_hash = ? AND expires > ?')
    .bind(tokenHash, now).first();
}

export function consumeTotpChallenge(db, {
  tokenHash, accountId, counter, sessionTokenHash, created, expires, now
}) {
  return db.batch([
    db.prepare(`UPDATE account_totp SET last_counter = ? WHERE account_id = ? AND enabled = 1 AND last_counter < ?
      AND EXISTS (SELECT 1 FROM auth_mfa_challenges WHERE token_hash = ? AND account_id = ? AND expires > ?)`)
      .bind(counter, accountId, counter, tokenHash, accountId, now),
    db.prepare(`INSERT INTO sessions(token_hash, account_id, created, expires)
      SELECT ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM auth_mfa_challenges WHERE token_hash = ? AND account_id = ? AND expires > ?
      ) AND EXISTS (
        SELECT 1 FROM account_totp WHERE account_id = ? AND enabled = 1 AND last_counter = ?
      )`)
      .bind(sessionTokenHash, accountId, created, expires, tokenHash, accountId, now, accountId, counter),
    db.prepare(`DELETE FROM auth_mfa_challenges WHERE token_hash = ? AND EXISTS (
      SELECT 1 FROM sessions WHERE token_hash = ? AND account_id = ?
    )`).bind(tokenHash, sessionTokenHash, accountId)
  ]);
}

export function consumeRecoveryChallenge(db, {
  tokenHash, accountId, codeHash, sessionTokenHash, created, expires, now
}) {
  return db.batch([
    db.prepare(`UPDATE account_totp_recovery_codes SET consumed_at = ? WHERE account_id = ? AND code_hash = ? AND consumed_at IS NULL
      AND EXISTS (SELECT 1 FROM auth_mfa_challenges WHERE token_hash = ? AND account_id = ? AND expires > ?)`)
      .bind(now, accountId, codeHash, tokenHash, accountId, now),
    db.prepare(`INSERT INTO sessions(token_hash, account_id, created, expires)
      SELECT ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM auth_mfa_challenges WHERE token_hash = ? AND account_id = ? AND expires > ?
      ) AND EXISTS (
        SELECT 1 FROM account_totp_recovery_codes WHERE account_id = ? AND code_hash = ? AND consumed_at = ?
      )`)
      .bind(sessionTokenHash, accountId, created, expires, tokenHash, accountId, now, accountId, codeHash, now),
    db.prepare(`DELETE FROM auth_mfa_challenges WHERE token_hash = ? AND EXISTS (
      SELECT 1 FROM sessions WHERE token_hash = ? AND account_id = ?
    )`).bind(tokenHash, sessionTokenHash, accountId)
  ]);
}

export function disableTotpWithCounter(db, { accountId, counter }) {
  return db.batch([
    db.prepare(`UPDATE account_totp SET enabled = 0, secret_iv = NULL, secret_ciphertext = NULL, secret_tag = NULL,
        pending_id = NULL, pending_iv = NULL, pending_ciphertext = NULL, pending_tag = NULL, pending_expires = NULL
      WHERE account_id = ? AND enabled = 1 AND last_counter < ?`).bind(accountId, counter),
    db.prepare(`DELETE FROM account_totp_recovery_codes WHERE account_id = ? AND EXISTS (
      SELECT 1 FROM account_totp WHERE account_id = ? AND enabled = 0
    )`).bind(accountId, accountId),
    db.prepare(`DELETE FROM auth_mfa_challenges WHERE account_id = ? AND NOT EXISTS (
      SELECT 1 FROM account_totp WHERE account_id = ? AND enabled = 1
    )`).bind(accountId, accountId)
  ]);
}

export function disableTotpWithRecoveryCode(db, { accountId, codeHash, now }) {
  return db.batch([
    db.prepare(`UPDATE account_totp_recovery_codes SET consumed_at = ? WHERE account_id = ? AND code_hash = ? AND consumed_at IS NULL`)
      .bind(now, accountId, codeHash),
    db.prepare(`UPDATE account_totp SET enabled = 0, secret_iv = NULL, secret_ciphertext = NULL, secret_tag = NULL,
        pending_id = NULL, pending_iv = NULL, pending_ciphertext = NULL, pending_tag = NULL, pending_expires = NULL
      WHERE account_id = ? AND enabled = 1 AND EXISTS (
        SELECT 1 FROM account_totp_recovery_codes WHERE account_id = ? AND code_hash = ? AND consumed_at = ?
      )`).bind(accountId, accountId, codeHash, now),
    db.prepare(`DELETE FROM account_totp_recovery_codes WHERE account_id = ? AND EXISTS (
      SELECT 1 FROM account_totp WHERE account_id = ? AND enabled = 0
    )`).bind(accountId, accountId),
    db.prepare(`DELETE FROM auth_mfa_challenges WHERE account_id = ? AND NOT EXISTS (
      SELECT 1 FROM account_totp WHERE account_id = ? AND enabled = 1
    )`).bind(accountId, accountId)
  ]);
}
