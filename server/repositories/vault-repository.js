import { vaultFromRecords } from '../application/vault-records.mjs';
import { diffVaultChanges } from '../../shared/vault-changes.js';

const TABLES = [
  'account_note_tags', 'account_notes', 'account_bookmarks', 'account_categories',
  'account_note_types', 'account_trash', 'account_preferences'
];

async function readRecords(db, accountId) {
  const [notes, tags, bookmarks, categories, noteTypes, trash, preferences] = await Promise.all([
    db.prepare('SELECT id, position, data FROM account_notes WHERE account_id = ? ORDER BY position, id').bind(accountId).all(),
    db.prepare('SELECT note_id AS noteId, scope, tag, position FROM account_note_tags WHERE account_id = ? ORDER BY note_id, scope, position').bind(accountId).all(),
    db.prepare('SELECT id, parent_id AS parentId, position, kind, data FROM account_bookmarks WHERE account_id = ?').bind(accountId).all(),
    db.prepare('SELECT value, position FROM account_categories WHERE account_id = ? ORDER BY position').bind(accountId).all(),
    db.prepare('SELECT id, name, position FROM account_note_types WHERE account_id = ? ORDER BY position').bind(accountId).all(),
    db.prepare('SELECT id, position, data FROM account_trash WHERE account_id = ? ORDER BY position').bind(accountId).all(),
    db.prepare('SELECT key, value FROM account_preferences WHERE account_id = ?').bind(accountId).all()
  ]);
  return {
    notes: notes.results, tags: tags.results, bookmarks: bookmarks.results,
    categories: categories.results, noteTypes: noteTypes.results, trash: trash.results,
    preferences: Object.fromEntries(preferences.results.map(row => [row.key, JSON.parse(row.value)]))
  };
}

/** Build the legacy-compatible snapshot while detecting writes during the read. */
export async function findVault(db, accountId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await db.prepare('SELECT revision, updated FROM account_vaults WHERE account_id = ?').bind(accountId).first();
    if (!before) return null;
    const records = await readRecords(db, accountId);
    const after = await db.prepare('SELECT revision FROM account_vaults WHERE account_id = ?').bind(accountId).first();
    if (after?.revision === before.revision) {
      return { revision: before.revision, updated: before.updated, data: JSON.stringify(vaultFromRecords(records)) };
    }
  }
  throw new Error('Knowledge base changed repeatedly while reading');
}

export function findVaultRevision(db, accountId) {
  return db.prepare('SELECT revision FROM account_vaults WHERE account_id = ?').bind(accountId).first();
}

export function insertVaultRecordStatements(db, accountId, records, { writeToken, requireLegacyClaim = false } = {}) {
  const guard = writeToken
    ? 'EXISTS (SELECT 1 FROM account_vaults v WHERE v.account_id = ? AND v.write_token = ?)'
    : 'EXISTS (SELECT 1 FROM account_vaults v WHERE v.account_id = ?)';
  const guardParameters = writeToken ? [accountId, writeToken] : [accountId];
  const legacyGuard = requireLegacyClaim ? ' AND (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?' : '';
  const gateParameters = [...guardParameters, ...(requireLegacyClaim ? [accountId] : [])];
  const json = value => JSON.stringify(value);
  return [
    db.prepare(`INSERT INTO account_notes(account_id, id, position, data)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.position'), json(value -> '$.data')
      FROM json_each(?) WHERE ${guard}${legacyGuard}`).bind(accountId, json(records.notes), ...gateParameters),
    db.prepare(`INSERT INTO account_note_tags(account_id, note_id, scope, tag, position)
      SELECT ?, json_extract(value, '$.noteId'), json_extract(value, '$.scope'), json_extract(value, '$.tag'), json_extract(value, '$.position')
      FROM json_each(?) WHERE ${guard}${legacyGuard}`).bind(accountId, json(records.tags), ...gateParameters),
    db.prepare(`INSERT INTO account_bookmarks(account_id, id, parent_id, position, kind, data)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.parentId'), json_extract(value, '$.position'),
        json_extract(value, '$.kind'), json(value -> '$.data') FROM json_each(?) WHERE ${guard}${legacyGuard}`)
      .bind(accountId, json(records.bookmarks), ...gateParameters),
    db.prepare(`INSERT INTO account_categories(account_id, position, value)
      SELECT ?, json_extract(value, '$.position'), json_extract(value, '$.value') FROM json_each(?) WHERE ${guard}${legacyGuard}`)
      .bind(accountId, json(records.categories), ...gateParameters),
    db.prepare(`INSERT INTO account_note_types(account_id, id, position, name)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.position'), json_extract(value, '$.name') FROM json_each(?) WHERE ${guard}${legacyGuard}`)
      .bind(accountId, json(records.noteTypes), ...gateParameters),
    db.prepare(`INSERT INTO account_trash(account_id, id, position, data)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.position'), json(value -> '$.data') FROM json_each(?) WHERE ${guard}${legacyGuard}`)
      .bind(accountId, json(records.trash), ...gateParameters),
    db.prepare(`INSERT INTO account_preferences(account_id, key, value)
      SELECT ?, key, json(value) FROM json_each(?) WHERE ${guard}${legacyGuard}`)
      .bind(accountId, json(Object.entries(records.preferences).map(([key, value]) => ({ key, value }))), ...gateParameters)
  ];
}

export function deleteVaultRecordStatements(db, accountId, { writeToken, requireLegacyClaim = false } = {}) {
  const tokenGuard = writeToken ? ' AND EXISTS (SELECT 1 FROM account_vaults v WHERE v.account_id = ? AND v.write_token = ?)' : '';
  const claimGuard = requireLegacyClaim ? ' AND (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?' : '';
  const parameters = [accountId, ...(writeToken ? [accountId, writeToken] : []), ...(requireLegacyClaim ? [accountId] : [])];
  return TABLES.map(table => db.prepare(`DELETE FROM ${table} WHERE account_id = ?${tokenGuard}${claimGuard}`).bind(...parameters));
}

function gated(db, accountId, token, sql, parameters = []) {
  const guard = 'EXISTS (SELECT 1 FROM account_vaults v WHERE v.account_id = ? AND v.write_token = ?)';
  const statement = sql.includes('/*GUARD*/') ? sql.replace('/*GUARD*/', guard) : `${sql} AND ${guard}`;
  return db.prepare(statement).bind(...parameters, accountId, token);
}

function deleteIds(db, accountId, token, table, column, ids) {
  return gated(db, accountId, token,
    `DELETE FROM ${table} WHERE account_id = ? AND ${column} IN (SELECT value FROM json_each(?))`, [accountId, JSON.stringify(ids)]);
}

function applyChangeStatements(db, accountId, token, changes) {
  const json = value => JSON.stringify(value);
  const statements = [];
  statements.push(deleteIds(db, accountId, token, 'account_note_tags', 'note_id', changes.notes.delete));
  statements.push(deleteIds(db, accountId, token, 'account_notes', 'id', changes.notes.delete));
  statements.push(db.prepare(`DELETE FROM account_note_tags WHERE account_id = ?
    AND note_id IN (SELECT json_extract(value, '$.id') FROM json_each(?))
    AND EXISTS (SELECT 1 FROM account_vaults v WHERE v.account_id = ? AND v.write_token = ?)`)
    .bind(accountId, json(changes.notes.upsert), accountId, token));

  const noteRecords = changes.notes.upsert.map(({ id, position, data }) => {
    const { tags = [], ...note } = data;
    const tagsRows = tags.map((tag, index) => ({ noteId: id, scope: 'current', tag, position: index }));
    if (note.publishedSnapshot) {
      const { tags: publishedTags = [], ...publishedSnapshot } = note.publishedSnapshot;
      note.publishedSnapshot = publishedSnapshot;
      tagsRows.push(...publishedTags.map((tag, index) => ({ noteId: id, scope: 'published', tag, position: index })));
    }
    return { id, position, data: note, tagsRows };
  });
  statements.push(gated(db, accountId, token, `INSERT INTO account_notes(account_id, id, position, data)
    SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.position'), json(value -> '$.data') FROM json_each(?)
    WHERE /*GUARD*/ ON CONFLICT(account_id, id) DO UPDATE SET position = excluded.position, data = excluded.data`,
    [accountId, json(noteRecords)]));
  const tagRecords = noteRecords.flatMap(row => row.tagsRows);
  statements.push(gated(db, accountId, token, `INSERT INTO account_note_tags(account_id, note_id, scope, tag, position)
    SELECT ?, json_extract(value, '$.noteId'), json_extract(value, '$.scope'), json_extract(value, '$.tag'), json_extract(value, '$.position')
    FROM json_each(?) WHERE /*GUARD*/`, [accountId, json(tagRecords)]));

  statements.push(deleteIds(db, accountId, token, 'account_bookmarks', 'id', changes.bookmarks.delete));
  statements.push(gated(db, accountId, token, `INSERT INTO account_bookmarks(account_id, id, parent_id, position, kind, data)
    SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.parentId'), json_extract(value, '$.position'),
      json_extract(value, '$.kind'), json(value -> '$.data') FROM json_each(?)
    WHERE /*GUARD*/ ON CONFLICT(account_id, id) DO UPDATE SET parent_id = excluded.parent_id, position = excluded.position,
      kind = excluded.kind, data = excluded.data`, [accountId, json(changes.bookmarks.upsert)]));

  if (changes.categories !== null) {
    statements.push(gated(db, accountId, token, 'DELETE FROM account_categories WHERE account_id = ?', [accountId]));
    statements.push(gated(db, accountId, token, `INSERT INTO account_categories(account_id, position, value)
      SELECT ?, CAST(key AS INTEGER), value FROM json_each(?) WHERE /*GUARD*/`, [accountId, json(changes.categories)]));
  }
  if (changes.noteTypes !== null) {
    statements.push(gated(db, accountId, token, 'DELETE FROM account_note_types WHERE account_id = ?', [accountId]));
    statements.push(gated(db, accountId, token, `INSERT INTO account_note_types(account_id, id, position, name)
      SELECT ?, json_extract(value, '$.id'), CAST(key AS INTEGER), json_extract(value, '$.name') FROM json_each(?) WHERE /*GUARD*/`,
      [accountId, json(changes.noteTypes)]));
  }

  statements.push(deleteIds(db, accountId, token, 'account_trash', 'id', changes.trash.delete));
  statements.push(gated(db, accountId, token, `INSERT INTO account_trash(account_id, id, position, data)
    SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.position'), json(value -> '$.data') FROM json_each(?)
    WHERE /*GUARD*/ ON CONFLICT(account_id, id) DO UPDATE SET position = excluded.position, data = excluded.data`,
    [accountId, json(changes.trash.upsert)]));

  statements.push(gated(db, accountId, token, `DELETE FROM account_preferences WHERE account_id = ?
    AND key IN (SELECT value FROM json_each(?))`, [accountId, json(changes.preferences.delete)]));
  statements.push(gated(db, accountId, token, `INSERT INTO account_preferences(account_id, key, value)
    SELECT ?, json_extract(value, '$.key'), json(value -> '$.value') FROM json_each(?)
    WHERE /*GUARD*/ ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value`,
    [accountId, json(Object.entries(changes.preferences.set).map(([key, value]) => ({ key, value })))]));
  return statements;
}

function assetReferenceGuard(allowStagingScope) {
  const staging = allowStagingScope
    ? ' OR EXISTS (SELECT 1 FROM account_asset_import_scopes staging WHERE staging.account_id = a.account_id AND staging.id = a.import_scope_id AND staging.id = ? AND staging.status = \'staging\')'
    : '';
  return 'AND NOT EXISTS (SELECT 1 FROM json_each(?) requested WHERE NOT EXISTS (' +
    'SELECT 1 FROM account_assets a WHERE a.account_id = ? AND a.id = requested.value AND a.complete = 1 ' +
    'AND (a.import_scope_id IS NULL OR EXISTS (SELECT 1 FROM account_asset_import_scopes committed ' +
    'WHERE committed.account_id = a.account_id AND committed.id = a.import_scope_id AND committed.status = \'committed\')' +
    staging + ')))';
}

async function findUnavailableAssetReferences(db, { accountId, assetIds, importScopeId }) {
  const staging = importScopeId
    ? ' OR EXISTS (SELECT 1 FROM account_asset_import_scopes s WHERE s.account_id = a.account_id AND s.id = a.import_scope_id AND s.id = ? AND s.status = \'staging\')'
    : '';
  const result = await db.prepare('SELECT requested.value AS id FROM json_each(?) requested WHERE NOT EXISTS (' +
    'SELECT 1 FROM account_assets a WHERE a.account_id = ? AND a.id = requested.value AND a.complete = 1 ' +
    'AND (a.import_scope_id IS NULL OR EXISTS (SELECT 1 FROM account_asset_import_scopes committed ' +
    'WHERE committed.account_id = a.account_id AND committed.id = a.import_scope_id AND committed.status = \'committed\')' +
    staging + '))').bind(JSON.stringify(assetIds), accountId, ...(importScopeId ? [importScopeId] : [])).all();
  return result.results.map(row => String(row.id));
}

async function persistChanges(db, { accountId, revision, current, changes, updated, importScopeId, addedAssetIds = [] }) {
  const token = crypto.randomUUID();
  const snapshotCreated = Number.isFinite(current.updated) && current.updated > 0 ? current.updated : updated;
  const guard = 'EXISTS (SELECT 1 FROM account_vaults v WHERE v.account_id = ? AND v.write_token = ?)';
  const importGuard = importScopeId
    ? ' AND EXISTS (SELECT 1 FROM account_asset_import_scopes s WHERE s.account_id = ? AND s.id = ? AND s.status = \'staging\')'
    : '';
  const referenceGuard = addedAssetIds.length ? assetReferenceGuard(!!importScopeId) : '';
  const referenceGuardParameters = addedAssetIds.length
    ? [JSON.stringify(addedAssetIds), accountId, ...(importScopeId ? [importScopeId] : [])]
    : [];
  const batch = [
    db.prepare(`UPDATE account_vaults SET revision = revision + 1, updated = ?, write_token = ?
      WHERE account_id = ? AND revision = ?${importGuard}${referenceGuard}`).bind(updated, token, accountId, revision,
      ...(importScopeId ? [accountId, importScopeId] : []), ...referenceGuardParameters),
    ...(importScopeId ? [db.prepare(`UPDATE account_asset_import_scopes SET status = 'committed', updated = ?, result_revision = ?
      WHERE account_id = ? AND id = ? AND status = 'staging' AND ${guard}`)
      .bind(updated, revision + 1, accountId, importScopeId, accountId, token)] : []),
    db.prepare(`INSERT OR IGNORE INTO account_snapshots(account_id, revision, data, created)
      SELECT ?, ?, ?, ? WHERE ${guard}
        AND NOT EXISTS (SELECT 1 FROM account_snapshots WHERE account_id = ? AND created >= ?)`)
      .bind(accountId, revision, current.data, snapshotCreated, accountId, token, accountId, snapshotCreated - 60000),
    ...applyChangeStatements(db, accountId, token, changes),
    db.prepare(`INSERT INTO account_vault_changes(account_id, revision, changes, created)
      SELECT ?, ?, ?, ? WHERE ${guard}`)
      .bind(accountId, revision + 1, JSON.stringify(changes), updated, accountId, token),
    db.prepare(`DELETE FROM account_snapshots WHERE account_id = ? AND ${guard}
      AND revision NOT IN (SELECT revision FROM account_snapshots WHERE account_id = ? ORDER BY created DESC, revision DESC LIMIT 20)`)
      .bind(accountId, accountId, token, accountId),
    db.prepare(`DELETE FROM account_vault_changes WHERE account_id = ? AND ${guard}
      AND revision <= (SELECT COALESCE(MAX(revision), 0) - 1000 FROM account_vault_changes WHERE account_id = ?)`)
      .bind(accountId, accountId, token, accountId)
  ];
  const results = await db.batch(batch);
  const result = results?.[0] || { meta: { changes: 0 } };
  if (result.meta?.changes !== 1 && addedAssetIds.length) {
    const latest = await findVaultRevision(db, accountId);
    if (latest?.revision === revision) {
      const unavailableAssetIds = await findUnavailableAssetReferences(db, { accountId, assetIds: addedAssetIds, importScopeId });
      if (unavailableAssetIds.length) return { ...result, unavailableAssetIds };
    }
  }
  return result;
}

/** Replace the old full-snapshot wire format while writing only changed rows. */
export async function saveVaultAtRevision(db, { accountId, revision, data, updated, addedAssetIds = [] }) {
  const current = await findVault(db, accountId);
  if (!current || current.revision !== revision) return { meta: { changes: 0 } };
  return persistChanges(db, { accountId, revision, current,
    changes: diffVaultChanges(JSON.parse(current.data), JSON.parse(data)), updated, addedAssetIds });
}

/** Apply a validated delta at the expected account revision. */
export async function saveVaultChangesAtRevision(db, { accountId, revision, changes, updated, addedAssetIds = [] }) {
  const current = await findVault(db, accountId);
  if (!current || current.revision !== revision) return { meta: { changes: 0 } };
  return persistChanges(db, { accountId, revision, current, changes, updated, addedAssetIds });
}

/** Replace the complete vault and commit its staged attachments in the same batch. */
export async function saveVaultImportAtRevision(db, { accountId, revision, data, updated, importScopeId, addedAssetIds = [] }) {
  const current = await findVault(db, accountId);
  if (!current || current.revision !== revision) return { meta: { changes: 0 } };
  return persistChanges(db, {
    accountId, revision, current,
    changes: diffVaultChanges(JSON.parse(current.data), JSON.parse(data)),
    updated, importScopeId, addedAssetIds
  });
}

export async function findVaultChanges(db, accountId, afterRevision) {
  const result = await db.prepare(`SELECT vault.revision AS currentRevision,
      (SELECT MIN(retained.revision) FROM account_vault_changes retained WHERE retained.account_id = vault.account_id) AS oldestRevision,
      journal.revision AS changeRevision, journal.changes AS changeData
    FROM account_vaults vault
    LEFT JOIN account_vault_changes journal ON journal.account_id = vault.account_id
      AND journal.revision > ? AND journal.revision <= vault.revision
    WHERE vault.account_id = ?
    ORDER BY journal.revision
    LIMIT 101`).bind(afterRevision, accountId).all();
  if (!result.results.length) return null;

  const currentRevision = Number(result.results[0].currentRevision);
  const oldestRevision = result.results[0].oldestRevision == null ? null : Number(result.results[0].oldestRevision);
  const resetRequired = Number(afterRevision) > currentRevision
    || (Number(afterRevision) < currentRevision
      && (oldestRevision === null || Number(afterRevision) < oldestRevision - 1));
  if (resetRequired) return { revision: currentRevision, resetRequired: true, changes: [] };
  const rows = result.results.filter(row => row.changeRevision != null);
  return { revision: currentRevision, resetRequired: false, hasMore: rows.length > 100,
    changes: rows.slice(0, 100).map(row => ({ revision: row.changeRevision, changes: JSON.parse(row.changeData) })) };
}
