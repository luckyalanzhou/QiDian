import { HttpError, validateVault } from '../validation.js';
import { applyVaultChanges, diffVaultChanges } from '../../shared/vault-changes.js';
import { preserveLegacyBookmarkMetadata } from '../../shared/bookmarks.js';
import { findAddedAssetReferences } from './asset-references.js';

/** Coordinates knowledge-base use cases without coupling them to HTTP requests. */
export function createVaultService(repository, { now = Date.now } = {}) {
  async function read(db, accountId) {
    const row = await repository.findVault(db, accountId);
    if (!row) throw new HttpError(404, '知识库不存在');
    return { revision: row.revision, data: validateVault(JSON.parse(row.data)) };
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

    const proposed = validateVault(input.data);
    const current = await repository.findVault(db, accountId);
    if (!current) throw new HttpError(404, '知识库不存在');
    if (current.revision !== input.revision) throw new HttpError(409, '知识库版本已更新，需要重新同步');
    const currentData = validateVault(JSON.parse(current.data));
    const data = validateVault(preserveLegacyBookmarkMetadata(currentData, proposed));
    const addedAssetIds = findAddedAssetReferences(currentData, data);
    const result = await repository.saveVaultAtRevision(db, {
      accountId,
      revision: input.revision,
      data: JSON.stringify(data),
      addedAssetIds,
      updated: now()
    });
    if (result.unavailableAssetIds?.length) throw new HttpError(422, '附件不存在或尚未上传完成，请重新添加后再保存');
    if (result.meta.changes !== 1) throw new HttpError(409, '知识库版本已更新，需要重新同步');
    return { revision: input.revision + 1 };
  }

  async function importAtRevision(db, accountId, input) {
    if (!Number.isSafeInteger(input?.revision) || input.revision < 0) throw new HttpError(400, '版本无效');
    if (typeof input?.scopeId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.scopeId)) {
      throw new HttpError(400, '附件导入作用域无效');
    }
    const scope = await repository.findAccountAssetImportResult(db, accountId, input.scopeId);
    if (!scope) throw new HttpError(404, '附件导入作用域不存在');
    if (scope.status === 'committed' && Number.isSafeInteger(scope.resultRevision)) return { revision: scope.resultRevision };
    if (scope.status !== 'staging') throw new HttpError(409, '附件导入作用域已中止，请重新导入');

    const data = validateVault(input.data);
    const current = await repository.findVault(db, accountId);
    if (!current) throw new HttpError(404, '知识库不存在');
    if (current.revision !== input.revision) throw new HttpError(409, '知识库版本已更新，请重新载入后再导入');
    const currentData = validateVault(JSON.parse(current.data));
    const addedAssetIds = findAddedAssetReferences(currentData, data);
    const result = await repository.saveVaultImportAtRevision(db, {
      accountId, importScopeId: input.scopeId, revision: input.revision,
      data: JSON.stringify(data), addedAssetIds, updated: now()
    });
    if (result.meta.changes !== 1) {
      const latestScope = await repository.findAccountAssetImportResult(db, accountId, input.scopeId);
      if (latestScope?.status === 'committed' && Number.isSafeInteger(latestScope.resultRevision)) {
        return { revision: latestScope.resultRevision };
      }
      if (latestScope?.status !== 'staging') throw new HttpError(409, '附件导入作用域已中止，请重新导入');
      if (result.unavailableAssetIds?.length) throw new HttpError(422, '备份引用的附件不存在或尚未上传完成，请重新导入');
      throw new HttpError(409, '知识库版本已更新，请重新载入后再导入');
    }
    return { revision: input.revision + 1 };
  }

  async function saveChangesAtRevision(db, accountId, input) {
    if (!Number.isSafeInteger(input?.revision) || input.revision < 0) throw new HttpError(400, '版本无效');
    const current = await repository.findVault(db, accountId);
    if (!current) throw new HttpError(404, '知识库不存在');
    if (current.revision !== input.revision) throw new HttpError(409, '知识库版本已更新，需要重新同步');

    let data;
    const currentData = validateVault(JSON.parse(current.data));
    try { data = validateVault(preserveLegacyBookmarkMetadata(currentData, applyVaultChanges(currentData, input.changes))); }
    catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error?.message || '知识库变更无效');
    }
    const changes = diffVaultChanges(currentData, data);
    const addedAssetIds = findAddedAssetReferences(currentData, data);
    const result = await repository.saveVaultChangesAtRevision(db, {
      accountId, revision: input.revision, changes, addedAssetIds, updated: now()
    });
    if (result.unavailableAssetIds?.length) throw new HttpError(422, '附件不存在或尚未上传完成，请重新添加后再保存');
    if (result.meta.changes !== 1) throw new HttpError(409, '知识库版本已更新，需要重新同步');
    return { revision: input.revision + 1 };
  }

  async function readChanges(db, accountId, afterRevision) {
    if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) throw new HttpError(400, '同步版本无效');
    const result = await repository.findVaultChanges(db, accountId, afterRevision);
    if (!result) throw new HttpError(404, '知识库不存在');
    return result;
  }

  return { read, readRevision, saveAtRevision, importAtRevision, saveChangesAtRevision, readChanges };
}
