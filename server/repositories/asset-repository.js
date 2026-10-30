const CHUNK_BYTES = 256 * 1024;
export const ASSET_CHUNK_BYTES = CHUNK_BYTES;

export function listAccountAssets(db, accountId) {
  return db.prepare(`SELECT a.id, a.name, a.mime, a.size, a.created FROM account_assets a
    WHERE a.account_id = ? AND a.complete = 1 AND (a.import_scope_id IS NULL OR EXISTS (
      SELECT 1 FROM account_asset_import_scopes s WHERE s.account_id = a.account_id
        AND s.id = a.import_scope_id AND s.status = 'committed')) ORDER BY a.created DESC`)
    .bind(accountId).all();
}

export function beginAccountAssetUpload(db, { accountId, id, name, created, importScopeId = null }) {
  if (importScopeId) return db.prepare(`INSERT INTO account_assets(account_id, id, name, mime, size, created, complete, import_scope_id)
    SELECT ?, ?, ?, 'application/octet-stream', 0, ?, 0, ?
    WHERE EXISTS (SELECT 1 FROM account_asset_import_scopes WHERE account_id = ? AND id = ? AND status = 'staging')`)
    .bind(accountId, id, name, created, importScopeId, accountId, importScopeId).run();
  return db.prepare(`INSERT INTO account_assets(account_id, id, name, mime, size, created, complete, import_scope_id)
    VALUES (?, ?, ?, 'application/octet-stream', 0, ?, 0, NULL)`).bind(accountId, id, name, created).run();
}

export function beginAccountAssetImportUpload(db, { accountId, id, name, size, created, importScopeId }) {
  return db.prepare(`INSERT INTO account_assets(account_id, id, name, mime, size, created, complete, import_scope_id)
    SELECT ?, ?, ?, 'application/octet-stream', ?, ?, 0, ?
    WHERE EXISTS (SELECT 1 FROM account_asset_import_scopes WHERE account_id = ? AND id = ? AND status = 'staging')`)
    .bind(accountId, id, name, size, created, importScopeId, accountId, importScopeId).run();
}

export function findAccountAssetImportUpload(db, accountId, id, importScopeId) {
  return db.prepare(`SELECT a.name, a.size, a.created FROM account_assets a JOIN account_asset_import_scopes s
    ON s.account_id = a.account_id AND s.id = a.import_scope_id
    WHERE a.account_id = ? AND a.id = ? AND a.complete = 0 AND a.import_scope_id = ? AND s.status = 'staging'`)
    .bind(accountId, id, importScopeId).first();
}

export function appendAccountAssetUploadChunks(db, accountId, id, chunks, updated = Date.now(), importScopeId = null) {
  if (!chunks.length) return Promise.resolve();
  if (importScopeId) return db.batch([
    ...chunks.map(({ ordinal, bytes }) => db.prepare(`INSERT INTO account_asset_chunks(account_id, asset_id, ordinal, data)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM account_assets a JOIN account_asset_import_scopes s
        ON s.account_id = a.account_id AND s.id = a.import_scope_id
        WHERE a.account_id = ? AND a.id = ? AND a.complete = 0 AND a.import_scope_id = ? AND s.status = 'staging')`)
      .bind(accountId, id, ordinal, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), accountId, id, importScopeId)),
    db.prepare(`UPDATE account_assets SET created = ? WHERE account_id = ? AND id = ? AND complete = 0 AND import_scope_id = ?
      AND EXISTS (SELECT 1 FROM account_asset_import_scopes WHERE account_id = ? AND id = ? AND status = 'staging')`)
      .bind(updated, accountId, id, importScopeId, accountId, importScopeId),
    db.prepare(`UPDATE account_asset_import_scopes SET updated = ? WHERE account_id = ? AND id = ? AND status = 'staging'`)
      .bind(updated, accountId, importScopeId)
  ]);
  return db.batch([...chunks.map(({ ordinal, bytes }) => db.prepare(
    'INSERT INTO account_asset_chunks(account_id, asset_id, ordinal, data) VALUES (?, ?, ?, ?)'
  ).bind(accountId, id, ordinal, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))),
  db.prepare('UPDATE account_assets SET created = ? WHERE account_id = ? AND id = ? AND complete = 0').bind(updated, accountId, id)]);
}

export async function appendAccountAssetImportChunks(db, accountId, id, chunks, updated, importScopeId) {
  if (!chunks.length) return;
  const upload = await db.prepare(`SELECT a.name, a.size FROM account_assets a JOIN account_asset_import_scopes s
    ON s.account_id = a.account_id AND s.id = a.import_scope_id
    WHERE a.account_id = ? AND a.id = ? AND a.complete = 0 AND a.import_scope_id = ? AND s.status = 'staging'`)
    .bind(accountId, id, importScopeId).first();
  if (!upload) throw new Error('Attachment import upload is unavailable');
  for (const { ordinal, bytes } of chunks) {
    const start = ordinal * CHUNK_BYTES;
    const expected = Math.min(CHUNK_BYTES, upload.size - start);
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || expected <= 0 || bytes.byteLength !== expected) {
      throw new Error('Attachment import chunk has an invalid range');
    }
    const current = await getAccountAssetChunk(db, accountId, id, ordinal);
    if (current) {
      const stored = current.data instanceof Uint8Array ? current.data : current.data instanceof ArrayBuffer
        ? new Uint8Array(current.data) : new Uint8Array(current.data || []);
      if (stored.byteLength !== bytes.byteLength || stored.some((byte, index) => byte !== bytes[index])) {
        throw new Error('Attachment import chunk conflicts with an earlier attempt');
      }
      continue;
    }
  }
  await db.batch([
    ...chunks.map(({ ordinal, bytes }) => db.prepare(`INSERT OR IGNORE INTO account_asset_chunks(account_id, asset_id, ordinal, data)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM account_assets a JOIN account_asset_import_scopes s
        ON s.account_id = a.account_id AND s.id = a.import_scope_id
        WHERE a.account_id = ? AND a.id = ? AND a.complete = 0 AND a.import_scope_id = ? AND s.status = 'staging')`)
      .bind(accountId, id, ordinal, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), accountId, id, importScopeId)),
    db.prepare(`UPDATE account_assets SET created = ? WHERE account_id = ? AND id = ? AND complete = 0 AND import_scope_id = ?`)
      .bind(updated, accountId, id, importScopeId),
    db.prepare(`UPDATE account_asset_import_scopes SET updated = ? WHERE account_id = ? AND id = ? AND status = 'staging'`)
      .bind(updated, accountId, importScopeId)
  ]);
  for (const { ordinal, bytes } of chunks) {
    const current = await getAccountAssetChunk(db, accountId, id, ordinal);
    const stored = current?.data instanceof Uint8Array ? current.data : current?.data instanceof ArrayBuffer
      ? new Uint8Array(current.data) : new Uint8Array(current?.data || []);
    if (stored.byteLength !== bytes.byteLength || stored.some((byte, index) => byte !== bytes[index])) {
      throw new Error('Attachment import chunk was not stored consistently');
    }
  }
}

export async function finalizeAccountAssetUpload(db, { accountId, id, name, mime, size, created, importScopeId = null }) {
  const upload = importScopeId
    ? await db.prepare(`SELECT name, size AS expectedSize FROM account_assets WHERE account_id = ? AND id = ? AND complete = 0 AND import_scope_id = ?
      AND EXISTS (SELECT 1 FROM account_asset_import_scopes WHERE account_id = ? AND id = ? AND status = 'staging')`)
      .bind(accountId, id, importScopeId, accountId, importScopeId).first()
    : await db.prepare('SELECT name, size AS expectedSize FROM account_assets WHERE account_id = ? AND id = ? AND complete = 0 AND import_scope_id IS NULL')
      .bind(accountId, id).first();
  const chunks = await db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes
    , MIN(ordinal) AS firstOrdinal, MAX(ordinal) AS lastOrdinal
    FROM account_asset_chunks WHERE account_id = ? AND asset_id = ?`).bind(accountId, id).first();
  const chunkCount = Math.ceil(size / CHUNK_BYTES);
  if (!upload || upload.name !== name || (Number(upload.expectedSize) > 0 && Number(upload.expectedSize) !== size) ||
    Number(chunks?.bytes) !== size || Number(chunks?.count) !== chunkCount || Number(chunks?.firstOrdinal) !== 0 ||
    Number(chunks?.lastOrdinal) !== chunkCount - 1) {
    throw new Error('Incomplete attachment upload');
  }
  const result = importScopeId
    ? await db.prepare(`UPDATE account_assets SET mime = ?, size = ?, created = ?, complete = 1
      WHERE account_id = ? AND id = ? AND complete = 0 AND import_scope_id = ?
        AND EXISTS (SELECT 1 FROM account_asset_import_scopes WHERE account_id = ? AND id = ? AND status = 'staging')`)
      .bind(mime, size, created, accountId, id, importScopeId, accountId, importScopeId).run()
    : await db.prepare(`UPDATE account_assets SET mime = ?, size = ?, created = ?, complete = 1
      WHERE account_id = ? AND id = ? AND complete = 0 AND import_scope_id IS NULL`).bind(mime, size, created, accountId, id).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('Incomplete attachment upload');
  return result;
}

export function deleteAccountAssetUpload(db, accountId, id) {
  return db.prepare('DELETE FROM account_assets WHERE account_id = ? AND id = ? AND complete = 0').bind(accountId, id).run();
}

export function listAssetAccountIds(db) {
  return db.prepare('SELECT id AS accountId FROM accounts ORDER BY id').all();
}

export function deleteExpiredAccountAssetUploads(db, accountId, olderThan) {
  return db.prepare(`DELETE FROM account_assets WHERE account_id = ? AND complete = 0 AND created < ?
    AND NOT ${referencedAsset}`).bind(accountId, olderThan).run();
}

export function findAccountAsset(db, accountId, id) {
  return db.prepare(`SELECT a.id, a.name, a.mime, a.size, a.created FROM account_assets a
    WHERE a.account_id = ? AND a.id = ? AND a.complete = 1 AND (a.import_scope_id IS NULL OR EXISTS (
      SELECT 1 FROM account_asset_import_scopes s WHERE s.account_id = a.account_id
        AND s.id = a.import_scope_id AND s.status = 'committed'))`).bind(accountId, id).first();
}

export function getAccountAssetChunk(db, accountId, id, ordinal) {
  return db.prepare('SELECT data FROM account_asset_chunks WHERE account_id = ? AND asset_id = ? AND ordinal = ?')
    .bind(accountId, id, ordinal).first();
}

function assertAssetPrunePage(olderThan, afterId, limit) {
  if (!Number.isSafeInteger(olderThan)) throw new TypeError('Asset prune cutoff must be a safe integer');
  if (typeof afterId !== 'string') throw new TypeError('Asset prune cursor must be a string');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Asset prune batch size is invalid');
}

export function findAccountAssetPruneRevision(db, accountId) {
  return db.prepare('SELECT revision FROM account_vaults WHERE account_id = ?').bind(accountId).first();
}

const ASSET_REFERENCE_TABLES = Object.freeze({
  notes: { table:'account_notes', cursor:'id' },
  bookmarks: { table:'account_bookmarks', cursor:'id' },
  trash: { table:'account_trash', cursor:'id' },
  snapshots: { table:'account_snapshots', cursor:'revision' }
});

/** Read attachment-reference sources once in bounded keyset pages for a stable vault revision. */
export function listAccountAssetReferencePage(db, accountId, source, afterId, limit) {
  if (typeof afterId !== 'string') throw new TypeError('Asset reference cursor must be a string');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Asset reference page size is invalid');
  const definition = ASSET_REFERENCE_TABLES[source];
  if (!definition) throw new TypeError('Asset reference source is invalid');
  if (source === 'snapshots') {
    return db.prepare(`SELECT CAST(revision AS TEXT) AS id, data FROM ${definition.table}
      WHERE account_id = ? AND revision > ? ORDER BY revision LIMIT ?`)
      .bind(accountId, Number(afterId || 0), limit).all();
  }
  return db.prepare(`SELECT ${definition.cursor} AS id, data FROM ${definition.table}
    WHERE account_id = ? AND ${definition.cursor} > ? ORDER BY ${definition.cursor} LIMIT ?`)
    .bind(accountId, afterId, limit).all();
}

export function findExpiredAccountAssetCandidates(db, accountId, olderThan, afterId, limit) {
  assertAssetPrunePage(olderThan, afterId, limit);
  return db.prepare(`SELECT id, size, created FROM account_assets
    WHERE account_id = ? AND complete = 1 AND created <= ? AND id > ?
      AND (import_scope_id IS NULL OR EXISTS (SELECT 1 FROM account_asset_import_scopes s
        WHERE s.account_id = account_assets.account_id AND s.id = account_assets.import_scope_id AND s.status = 'committed'))
    ORDER BY id LIMIT ?`).bind(accountId, olderThan, afterId, limit).all();
}

export function createAccountAssetImportScope(db, { accountId, id, created }) {
  return db.prepare(`INSERT INTO account_asset_import_scopes(account_id, id, status, created, updated, result_revision)
    VALUES (?, ?, 'staging', ?, ?, NULL)`).bind(accountId, id, created, created).run();
}

export function findAccountAssetImportScope(db, accountId, id) {
  return db.prepare(`SELECT id, status, created, updated, result_revision AS resultRevision
    FROM account_asset_import_scopes WHERE account_id = ? AND id = ?`).bind(accountId, id).first();
}

export function findAccountAssetImportResult(db, accountId, id) {
  return db.prepare(`SELECT status, result_revision AS resultRevision FROM account_asset_import_scopes
    WHERE account_id = ? AND id = ?`).bind(accountId, id).first();
}

export function findExpiredAccountAssetImportScopes(db, accountId, olderThan) {
  return db.prepare(`SELECT id FROM account_asset_import_scopes WHERE account_id = ? AND status = 'staging' AND updated < ?`)
    .bind(accountId, olderThan).all();
}

const referencedAsset = `(
  EXISTS (SELECT 1 FROM account_notes n WHERE n.account_id = account_assets.account_id AND instr(n.data, '/api/assets/' || account_assets.id) > 0)
  OR EXISTS (SELECT 1 FROM account_bookmarks b WHERE b.account_id = account_assets.account_id AND instr(b.data, '/api/assets/' || account_assets.id) > 0)
  OR EXISTS (SELECT 1 FROM account_trash t WHERE t.account_id = account_assets.account_id AND instr(t.data, '/api/assets/' || account_assets.id) > 0)
  OR EXISTS (SELECT 1 FROM account_snapshots s WHERE s.account_id = account_assets.account_id AND instr(s.data, '/api/assets/' || account_assets.id) > 0)
)`;

const referencedSnapshotAsset = `EXISTS (
  SELECT 1 FROM account_snapshots s
  WHERE s.account_id = account_assets.account_id
    AND instr(s.data, '/api/assets/' || account_assets.id) > 0
)`;

export async function deleteAccountAssets(db, accountId, assetIds, olderThan, expectedRevision) {
  if (!assetIds.length) return [];
  if (!Number.isSafeInteger(olderThan)) throw new TypeError('Asset prune cutoff must be a safe integer');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('Asset prune revision is invalid');
  const results = await db.batch(assetIds.map(id => db.prepare(`DELETE FROM account_assets
    WHERE account_id = ? AND id = ? AND complete = 1 AND created <= ?
      AND EXISTS (SELECT 1 FROM account_vaults v WHERE v.account_id = ? AND v.revision = ?)
      AND NOT ${referencedSnapshotAsset}
      AND (import_scope_id IS NULL OR EXISTS (SELECT 1 FROM account_asset_import_scopes s
        WHERE s.account_id = account_assets.account_id AND s.id = account_assets.import_scope_id AND s.status = 'committed'))
    `).bind(accountId, id, olderThan, accountId, expectedRevision)));
  return [...new Set(assetIds.filter((id, index) => results?.[index]?.meta?.changes === 1))];
}

/** Abort only a staging scope, retaining any asset already referenced by saved data. */
export function abortAccountAssetImportScope(db, { accountId, id, updated, olderThan }) {
  const expiry = Number.isSafeInteger(olderThan) ? ' AND updated < ?' : '';
  const expiryParameters = Number.isSafeInteger(olderThan) ? [olderThan] : [];
  return db.batch([
    db.prepare(`UPDATE account_asset_import_scopes SET status = 'aborted', updated = ?
      WHERE account_id = ? AND id = ? AND status = 'staging'${expiry}`).bind(updated, accountId, id, ...expiryParameters),
    db.prepare(`UPDATE account_assets SET import_scope_id = NULL WHERE account_id = ? AND import_scope_id = ?
      AND EXISTS (SELECT 1 FROM account_asset_import_scopes s WHERE s.account_id = ? AND s.id = ? AND s.status = 'aborted')
      AND ${referencedAsset}`).bind(accountId, id, accountId, id),
    db.prepare(`DELETE FROM account_assets WHERE account_id = ? AND import_scope_id = ?
      AND EXISTS (SELECT 1 FROM account_asset_import_scopes s WHERE s.account_id = ? AND s.id = ? AND s.status = 'aborted')
      AND NOT ${referencedAsset}`).bind(accountId, id, accountId, id)
  ]);
}
