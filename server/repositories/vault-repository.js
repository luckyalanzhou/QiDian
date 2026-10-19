export function findVault(db, accountId) {
  return db.prepare('SELECT revision, data FROM account_vaults WHERE account_id = ?').bind(accountId).first();
}

export function findVaultRevision(db, accountId) {
  return db.prepare('SELECT revision FROM account_vaults WHERE account_id = ?').bind(accountId).first();
}

export function saveVaultAtRevision(db, { accountId, revision, data, updated }) {
  return db.prepare('UPDATE account_vaults SET data = ?, revision = revision + 1, updated = ? WHERE account_id = ? AND revision = ?')
    .bind(data, updated, accountId, revision).run();
}
