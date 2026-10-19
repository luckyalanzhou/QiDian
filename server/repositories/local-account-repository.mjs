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
    db.exec('COMMIT');
    return { sessionsRevoked };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
