import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openSelfHostedDatabase } from '../../server/sqlite-migrations.mjs';
import { findVault } from '../../server/repositories/vault-repository.js';
import { validateVault } from '../../server/validation.js';

test('normalized vault migration backfills every record while preserving historical snapshots', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-vault-migration-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const oldMigrations = join(temp, 'old-migrations');
  await mkdir(oldMigrations);
  for (const name of [
    '0001_initial.sql', '0002_accounts.sql', '0003_email_auth.sql', '0004_account_profiles.sql',
    '0005_snapshot_retention.sql', '0006_username_only_login.sql', '0007_session_idle_timeout.sql',
    '0008_streamed_unbounded_assets.sql'
  ]) await copyFile(resolve('migrations', name), join(oldMigrations, name));

  const databasePath = join(temp, 'data', 'qidian.sqlite');
  const prior = await openSelfHostedDatabase({ databasePath, migrationsDir: oldMigrations });
  const accountId = 'vault-account';
  const snapshot = {
    categories: ['技术'], noteTypes: [{ id: 'note', name: '普通笔记' }],
    notes: [{ id: 'note-1', title: '标题', type: 'note', category: '技术', tags: ['SQLite', '数据库'],
      body: '正文', source: '', created: 1, updated: 2, pinned: false, status: 'published', publishedAt: 2,
      publishedSnapshot: { title: '标题', type: 'note', category: '技术', tags: ['SQLite'], body: '正文', source: '', updated: 2 } }],
    bookmarks: [{ id: 'folder-1', kind: 'folder', title: '资料', children: [
      { id: 'link-1', kind: 'link', title: 'SQLite', url: 'https://sqlite.org', created: 3 }
    ] }],
    trash: [{ id: 'trash-1', kind: 'bookmark', deletedAt: 4, item: { id: 'deleted-link', kind: 'link', title: '旧链接', url: 'https://example.com' }, parentId: '', index: 0, previousId: '', nextId: '' }],
    theme: 'dark', pasteMode: 'plain', noteTypesExpanded: false,
    dashboardBookmarkLayout: 'double', dashboardBookmarkFolders: { 'folder-1': true },
    bookmarkDirectoryOpen: false, bookmarkFolderStates: { 'folder-1': false }
  };
  const serialized = JSON.stringify(snapshot);
  try {
    await prior.prepare(`INSERT INTO accounts(id, username, username_normalized, password_salt, password_hash, password_iterations, created)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(accountId, 'owner', 'owner', 'salt', 'hash', 600000, 1).run();
    await prior.prepare('UPDATE legacy_claim SET claimed_by = ? WHERE id = 1').bind(accountId).run();
    await prior.prepare('INSERT INTO account_vaults(account_id, revision, data, updated) VALUES (?, ?, ?, ?)')
      .bind(accountId, 9, serialized, 10).run();
    await prior.prepare('INSERT INTO account_snapshots(account_id, revision, data, created) VALUES (?, ?, ?, ?)')
      .bind(accountId, 8, serialized, 9).run();
  } finally { prior.close(); }

  const current = await openSelfHostedDatabase({ databasePath, migrationsDir: resolve('migrations') });
  try {
    const vaultColumns = (await current.prepare('PRAGMA table_info(account_vaults)').all()).results.map(row => row.name);
    assert.deepEqual(vaultColumns, ['account_id', 'revision', 'updated', 'write_token']);
    assert.deepEqual(await current.prepare('SELECT revision, data FROM account_snapshots WHERE account_id = ?').bind(accountId).all(), {
      results: [{ revision: 8, data: serialized }]
    });
    assert.deepEqual((await current.prepare('SELECT id, position, data FROM account_notes WHERE account_id = ?').bind(accountId).all()).results, [
      { id: 'note-1', position: 0, data: JSON.stringify({
        id: 'note-1', title: '标题', type: 'note', category: '技术', body: '正文', source: '', created: 1,
        updated: 2, pinned: false, status: 'published', publishedAt: 2, publishedSnapshot: {
          title: '标题', type: 'note', category: '技术', body: '正文', source: '', updated: 2
        }
      }) }
    ]);
    assert.deepEqual((await current.prepare('SELECT note_id, scope, tag, position FROM account_note_tags WHERE account_id = ? ORDER BY scope, position').bind(accountId).all()).results, [
      { note_id: 'note-1', scope: 'current', tag: 'SQLite', position: 0 },
      { note_id: 'note-1', scope: 'current', tag: '数据库', position: 1 },
      { note_id: 'note-1', scope: 'published', tag: 'SQLite', position: 0 }
    ]);
    assert.deepEqual((await current.prepare('SELECT id, parent_id, position, kind FROM account_bookmarks WHERE account_id = ? ORDER BY position').bind(accountId).all()).results, [
      { id: 'folder-1', parent_id: null, position: 0, kind: 'folder' },
      { id: 'link-1', parent_id: 'folder-1', position: 0, kind: 'link' }
    ]);
    assert.deepEqual((await current.prepare('SELECT key, value FROM account_preferences WHERE account_id = ? ORDER BY key').bind(accountId).all()).results, [
      { key: 'bookmarkDirectoryOpen', value: 'false' },
      { key: 'bookmarkFolderStates', value: '{"folder-1":false}' },
      { key: 'dashboardBookmarkFolders', value: '{"folder-1":true}' },
      { key: 'dashboardBookmarkLayout', value: '"double"' },
      { key: 'noteTypesExpanded', value: 'false' },
      { key: 'pasteMode', value: '"plain"' },
      { key: 'theme', value: '"dark"' }
    ]);
    const loaded = await findVault(current, accountId);
    assert.equal(loaded.revision, 9);
    assert.deepEqual(validateVault(JSON.parse(loaded.data)), validateVault(snapshot));
    assert.deepEqual((await current.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally { current.close(); }
});

test('normalized vault migration rolls back completely and leaves a pre-migration copy on malformed legacy JSON', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-vault-migration-rollback-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const oldMigrations = join(temp, 'old-migrations');
  await mkdir(oldMigrations);
  for (const name of [
    '0001_initial.sql', '0002_accounts.sql', '0003_email_auth.sql', '0004_account_profiles.sql',
    '0005_snapshot_retention.sql', '0006_username_only_login.sql', '0007_session_idle_timeout.sql',
    '0008_streamed_unbounded_assets.sql'
  ]) await copyFile(resolve('migrations', name), join(oldMigrations, name));

  const databasePath = join(temp, 'data', 'qidian.sqlite');
  const prior = await openSelfHostedDatabase({ databasePath, migrationsDir: oldMigrations });
  try {
    await prior.prepare(`INSERT INTO accounts(id, username, username_normalized, password_salt, password_hash, password_iterations, created)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind('bad-account', 'owner', 'owner', 'salt', 'hash', 600000, 1).run();
    await prior.prepare('INSERT INTO account_vaults(account_id, revision, data, updated) VALUES (?, ?, ?, ?)')
      .bind('bad-account', 4, '{malformed-json', 10).run();
  } finally { prior.close(); }

  await assert.rejects(openSelfHostedDatabase({ databasePath, migrationsDir: resolve('migrations') }),
    /0009_normalized_vault_records\.sql failed; prior data was preserved/);
  const raw = new DatabaseSync(databasePath);
  try {
    assert.deepEqual(raw.prepare('SELECT account_id, revision, data FROM account_vaults').all().map(row => ({ ...row })), [
      { account_id:'bad-account', revision:4, data:'{malformed-json' }
    ]);
    assert.equal(raw.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'account_notes'), undefined);
    assert.equal(raw.prepare('SELECT 1 FROM qidian_schema_migrations WHERE name = ?').get('0009_normalized_vault_records.sql'), undefined);
  } finally { raw.close(); }
  const backups = await readdir(join(temp, 'data', 'migration-backups'));
  assert.equal(backups.filter(name => name.startsWith('0009_normalized_vault_records-before-')).length, 1);
});
