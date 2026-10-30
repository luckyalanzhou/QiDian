import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { adaptDatabaseSync } from '../../server/adapters/sqlite-adapter.mjs';

test('SQLite batch preserves SQLITE_FULL when SQLite already rolled the transaction back', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = adaptDatabaseSync(raw);
  raw.exec('PRAGMA max_page_count=3; CREATE TABLE payloads(data BLOB)');

  await assert.rejects(db.batch([
    { run: async () => raw.prepare('INSERT INTO payloads(data) VALUES (?)').run(Buffer.alloc(1024 * 1024)) }
  ]), error => {
    assert.equal(error.message, 'database or disk is full');
    assert.match(error.rollbackError?.message ?? '', /no transaction is active/);
    return true;
  });
  assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM payloads').get().count, 0);
  db.close();
});

test('SQLite batch rolls back ordinary statement failures and keeps the primary error', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = adaptDatabaseSync(raw);
  raw.exec('CREATE TABLE values_table(value INTEGER UNIQUE)');

  await assert.rejects(db.batch([
    db.prepare('INSERT INTO values_table(value) VALUES (?)').bind(1),
    db.prepare('INSERT INTO values_table(value) VALUES (?)').bind(1)
  ]), /UNIQUE constraint failed/);
  assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM values_table').get().count, 0);
  db.close();
});

test('concurrent SQLite batches do not interleave transactions', async () => {
  const raw = new DatabaseSync(':memory:');
  const db = adaptDatabaseSync(raw);
  raw.exec('CREATE TABLE writes(value INTEGER UNIQUE)');

  const results = await Promise.allSettled([
    db.batch([db.prepare('INSERT INTO writes(value) VALUES (?)').bind(1)]),
    db.batch([db.prepare('INSERT INTO writes(value) VALUES (?)').bind(2)])
  ]);

  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled']);
  assert.deepEqual(raw.prepare('SELECT value FROM writes ORDER BY value').all().map(row => row.value), [1, 2]);
  db.close();
});
