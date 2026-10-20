// Local test/preview adapter backed by the same SQLite database engine as the Docker deployment.
import { DatabaseSync } from 'node:sqlite';
export function adaptDatabaseSync(db) {
  const convert = value => value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  const clean = row => row && Object.fromEntries(Object.entries(row).map(([key,value]) => [key,value instanceof Uint8Array ? [...value] : value]));
  function prepare(sql, args = []) {
    return {
      bind(...values) { return prepare(sql, values.map(convert)); },
      async first() { return clean(db.prepare(sql).get(...args)) || null; },
      async all() { return { results: db.prepare(sql).all(...args).map(clean) }; },
      async run() { const result = db.prepare(sql).run(...args); return { success: true, meta: { changes: result.changes } }; }
    };
  }
  return { prepare, async exec(sql) { db.exec(sql); },
    async batch(statements) {
      db.exec('BEGIN');
      try { const result=[];for(const statement of statements) result.push(await statement.run());db.exec('COMMIT');return result; }
      catch(error) { db.exec('ROLLBACK');throw error; }
    }, close() { db.close(); } };
}

export function sqliteAdapter(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  return adaptDatabaseSync(db);
}
