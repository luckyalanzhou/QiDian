// Local test/preview adapter backed by the same SQLite database engine as the Docker deployment.
import { DatabaseSync } from 'node:sqlite';

const SQLITE_SYNC_RUN = Symbol('sqliteSyncRun');

function addRollbackDiagnostic(error, rollbackError) {
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    try {
      Object.defineProperty(error, 'rollbackError', {
        value: rollbackError,
        configurable: true,
        enumerable: true
      });
      return error;
    } catch {}
  }
  return new AggregateError([error, rollbackError], error instanceof Error ? error.message : String(error), { cause: error });
}

export function adaptDatabaseSync(db) {
  const convert = value => value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  const clean = row => row && Object.fromEntries(Object.entries(row).map(([key,value]) => [key,value instanceof Uint8Array ? [...value] : value]));
  function prepare(sql, args = []) {
    const runSync = () => {
      const result = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: result.changes } };
    };
    return {
      bind(...values) { return prepare(sql, values.map(convert)); },
      async first() { return clean(db.prepare(sql).get(...args)) || null; },
      async all() { return { results: db.prepare(sql).all(...args).map(clean) }; },
      [SQLITE_SYNC_RUN]: runSync,
      async run() { return runSync(); }
    };
  }
  return { prepare, async exec(sql) { db.exec(sql); },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) {
          if (typeof statement[SQLITE_SYNC_RUN] === 'function') result.push(statement[SQLITE_SYNC_RUN]());
          else result.push(await statement.run());
        }
        db.exec('COMMIT');
        return result;
      }
      catch(error) {
        try { db.exec('ROLLBACK'); }
        catch(rollbackError) { throw addRollbackDiagnostic(error, rollbackError); }
        throw error;
      }
    }, close() { db.close(); } };
}

export function sqliteAdapter(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  return adaptDatabaseSync(db);
}
