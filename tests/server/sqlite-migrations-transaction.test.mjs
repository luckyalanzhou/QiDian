import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSelfHostedDatabase } from '../../server/sqlite-migrations.mjs';

test('SQLite migration preserves SQLITE_FULL when SQLite has already rolled back the transaction', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-migration-full-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const migrationsDir = join(temp, 'migrations');
  const databasePath = join(temp, 'data.sqlite');
  await mkdir(migrationsDir);
  await writeFile(join(migrationsDir, '0006_username_only_login.sql'), [
    'PRAGMA max_page_count=4;',
    'CREATE TABLE large_payloads(data BLOB);',
    'INSERT INTO large_payloads VALUES (zeroblob(1048576));'
  ].join('\n'));

  await assert.rejects(openSelfHostedDatabase({ databasePath, migrationsDir }), error => {
    assert.match(error.message, /SQLite migration 0006_username_only_login\.sql failed; prior data was preserved: database or disk is full/);
    assert.equal(error.cause?.message, 'database or disk is full');
    assert.match(error.rollbackError?.message ?? '', /no transaction is active/);
    return true;
  });

  const raw = new DatabaseSync(databasePath);
  try {
    assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM qidian_schema_migrations').get().count, 0);
    assert.equal(raw.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'large_payloads'), undefined);
    assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    raw.close();
  }
});

test('ordinary migration SQL failures retain the cause and roll back schema changes', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-migration-failure-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const migrationsDir = join(temp, 'migrations');
  const databasePath = join(temp, 'data.sqlite');
  await mkdir(migrationsDir);
  await writeFile(join(migrationsDir, '0001_invalid.sql'), [
    'CREATE TABLE temporary_schema(value INTEGER);',
    'INSERT INTO missing_table(value) VALUES (1);'
  ].join('\n'));

  await assert.rejects(openSelfHostedDatabase({ databasePath, migrationsDir }), error => {
    assert.match(error.message, /SQLite migration 0001_invalid\.sql failed; prior data was preserved/);
    assert.match(error.cause?.message ?? '', /no such table: missing_table/);
    assert.equal(error.rollbackError, undefined);
    return true;
  });

  const raw = new DatabaseSync(databasePath);
  try {
    assert.equal(raw.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'temporary_schema'), undefined);
    assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    raw.close();
  }
});

test('foreign key restoration failure is diagnostic and does not replace the migration error', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'qidian-migration-fk-restore-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const migrationsDir = join(temp, 'migrations');
  const databasePath = join(temp, 'data.sqlite');
  await mkdir(migrationsDir);
  await writeFile(join(migrationsDir, '0006_username_only_login.sql'), [
    'CREATE TABLE temporary_schema(value INTEGER);',
    'INSERT INTO missing_table(value) VALUES (1);'
  ].join('\n'));

  const originalExec = DatabaseSync.prototype.exec;
  t.mock.method(DatabaseSync.prototype, 'exec', function (sql) {
    if (sql === 'PRAGMA foreign_keys=ON') throw new Error('synthetic foreign key restore failure');
    return originalExec.call(this, sql);
  });

  await assert.rejects(openSelfHostedDatabase({ databasePath, migrationsDir }), error => {
    assert.match(error.message, /SQLite migration 0006_username_only_login\.sql failed; prior data was preserved/);
    assert.match(error.cause?.message ?? '', /no such table: missing_table/);
    assert.equal(error.rollbackError, undefined);
    assert.equal(error.foreignKeyRestoreError?.message, 'synthetic foreign key restore failure');
    return true;
  });

  const raw = new DatabaseSync(databasePath);
  try {
    assert.equal(raw.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', 'temporary_schema'), undefined);
    assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    raw.close();
  }
});
