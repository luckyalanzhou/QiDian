import { HttpError, validateVault } from '../validation.js';

/** Coordinates knowledge-base use cases without coupling them to HTTP requests. */
export function createVaultService(repository, { now = Date.now } = {}) {
  async function read(db, accountId) {
    const row = await repository.findVault(db, accountId);
    if (!row) throw new HttpError(404, '知识库不存在');
    return { revision: row.revision, data: JSON.parse(row.data) };
  }

  async function readRevision(db, accountId) {
    const row = await repository.findVaultRevision(db, accountId);
    if (!row) throw new HttpError(404, '知识库不存在');
    return { revision: row.revision };
  }

  async function saveAtRevision(db, accountId, input) {
    if (!Number.isSafeInteger(input?.revision) || input.revision < 0) {
      throw new HttpError(400, '版本无效');
    }

    const data = validateVault(input.data);
    const result = await repository.saveVaultAtRevision(db, {
      accountId,
      revision: input.revision,
      data: JSON.stringify(data),
      updated: now()
    });
    if (result.meta.changes !== 1) throw new HttpError(409, '知识库版本已更新，需要重新同步');
    return { revision: input.revision + 1 };
  }

  return { read, readRevision, saveAtRevision };
}
