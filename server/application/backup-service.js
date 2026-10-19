import { HttpError } from '../validation.js';

/** Coordinates account-scoped snapshot use cases independently of HTTP. */
export function createBackupService(repository, { now = Date.now } = {}) {
  async function list(db, accountId) {
    const { results } = await repository.listVaultSnapshots(db, accountId);
    return results;
  }

  async function create(db, accountId) {
    const snapshot = await repository.createCurrentVaultSnapshot(db, accountId, now());
    if (!snapshot) throw new HttpError(404, '知识库不存在');
    return snapshot;
  }

  async function read(db, accountId, revision) {
    const row = await repository.findVaultSnapshot(db, accountId, revision);
    if (!row) throw new HttpError(404, '备份不存在');
    return { revision: row.revision, data: JSON.parse(row.data) };
  }

  return { list, create, read };
}
