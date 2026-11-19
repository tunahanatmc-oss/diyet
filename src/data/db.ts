import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { MIGRATIONS, SCHEMA_VERSION } from './schema';

export type Row = Record<string, any>;
export type DB = Database;

let SQL: SqlJsStatic | null = null;

export async function initSql(locate?: (file: string) => string): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  const mod: any = await import('sql.js');
  const init = mod.default ?? mod;
  SQL = await init(locate ? { locateFile: locate } : {});
  return SQL!;
}

export function q<T = Row>(db: DB, sql: string, params: SqlValue[] | Record<string, SqlValue> = []): T[] {
  const st = db.prepare(sql);
  try {
    st.bind(params as any);
    const out: T[] = [];
    while (st.step()) out.push(st.getAsObject() as T);
    return out;
  } finally { st.free(); }
}
export function one<T = Row>(db: DB, sql: string, params: SqlValue[] = []): T | undefined { return q<T>(db, sql, params)[0]; }
export function run(db: DB, sql: string, params: SqlValue[] | Record<string, SqlValue> = []): number {
  db.run(sql, params as any);
  return (one<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')?.id) ?? 0;
}

export function userVersion(db: DB): number { return (one<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version) ?? 0; }

/** Apply pending migrations; each in a transaction, rolled back on failure (spec 7.2). */
export function migrate(db: DB): number {
  db.run('PRAGMA foreign_keys = ON');
  let v = userVersion(db);
  if (v > SCHEMA_VERSION) throw new Error(`Bu veri daha yeni bir uygulama sürümüne ait (şema ${v} > ${SCHEMA_VERSION}). Uygulamayı güncelleyin.`);
  while (v < SCHEMA_VERSION) {
    try {
      db.run('BEGIN');
      db.exec(MIGRATIONS[v]);
      db.run(`PRAGMA user_version = ${v + 1}`);
      db.run('COMMIT');
      v++;
    } catch (e) { db.run('ROLLBACK'); throw e; }
  }
  return v;
}

export async function openDb(bytes?: Uint8Array | null, locate?: (f: string) => string): Promise<DB> {
  const S = await initSql(locate);
  const db = bytes ? new S.Database(bytes) : new S.Database();
  migrate(db);
  return db;
}

export function tx<T>(db: DB, fn: () => T): T {
  db.run('BEGIN');
  try { const r = fn(); db.run('COMMIT'); return r; } catch (e) { db.run('ROLLBACK'); throw e; }
}
