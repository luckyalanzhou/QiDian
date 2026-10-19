export function listVaultSnapshots(db, accountId) {
  return db.prepare('SELECT revision, created FROM account_snapshots WHERE account_id = ? ORDER BY revision DESC').bind(accountId).all();
}

export async function createCurrentVaultSnapshot(db, accountId, created) {
  const current = await db.prepare('SELECT revision, data FROM account_vaults WHERE account_id = ?').bind(accountId).first();
  if (!current) return null;
  await db.batch([
    db.prepare(`INSERT INTO account_snapshots(account_id, revision, data, created) VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id, revision) DO UPDATE SET data = excluded.data, created = excluded.created`)
      .bind(accountId, current.revision, current.data, created),
    db.prepare(`DELETE FROM account_snapshots WHERE account_id = ? AND revision NOT IN (
      SELECT revision FROM account_snapshots WHERE account_id = ? ORDER BY created DESC, revision DESC LIMIT 20
    )`).bind(accountId, accountId)
  ]);
  return { revision: current.revision, created };
}

export function findVaultSnapshot(db, accountId, revision) {
  return db.prepare('SELECT revision, data FROM account_snapshots WHERE account_id = ? AND revision = ?').bind(accountId, revision).first();
}
