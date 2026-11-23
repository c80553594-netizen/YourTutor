import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { type SqlDriver, type SqlExecutionResult, type SqlParam } from '@yourtutor/storage';

/**
 * Minimal structural interface matching `@capacitor-community/sqlite`'s `SQLiteDBConnection`,
 * enabling deterministic unit testing of the Capacitor SQLite driver adapter in Node.
 */
export interface CapacitorDbConnectionLike {
  query(statement: string, values?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
  run(
    statement: string,
    values?: unknown[],
    transaction?: boolean
  ): Promise<{ changes?: { changes?: number; lastId?: number } }>;
  execute(statements: string, transaction?: boolean): Promise<{ changes?: { changes?: number } }>;
  beginTransaction(): Promise<unknown>;
  commitTransaction(): Promise<unknown>;
  rollbackTransaction(): Promise<unknown>;
  close(): Promise<void>;
}

function normalizeMobileParams(params: SqlParam[] = []): unknown[] {
  return params.map((p) => {
    if (typeof p === 'boolean') {
      return p ? 1 : 0;
    }
    return p;
  });
}

/**
 * Implements `@yourtutor/storage`'s `SqlDriver` contract over `@capacitor-community/sqlite`,
 * allowing Android to reuse the exact same Drizzle ORM schema and incremental migrations as Desktop.
 */
export class CapacitorSqliteDriver implements SqlDriver {
  readonly dialect = 'sqlite' as const;
  readonly name = 'capacitor-sqlite';

  private db: CapacitorDbConnectionLike | null;
  private readonly dbName: string;
  private inTransaction = false;

  constructor(options: { dbName?: string; connection?: CapacitorDbConnectionLike } = {}) {
    this.dbName = options.dbName ?? 'yourtutor_local';
    this.db = options.connection ?? null;
  }

  private async ensureConnection(): Promise<CapacitorDbConnectionLike> {
    if (this.db) {
      return this.db;
    }
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const retCC = (await sqlite.checkConnectionsConsistency()).result;
    const isConn = (await sqlite.isConnection(this.dbName, false)).result;
    const conn: SQLiteDBConnection =
      retCC && isConn
        ? await sqlite.retrieveConnection(this.dbName, false)
        : await sqlite.createConnection(this.dbName, false, 'no-encryption', 1, false);
    await conn.open();
    await conn.execute('PRAGMA foreign_keys = ON;', false);
    this.db = conn;
    return this.db;
  }

  async queryValues(sql: string, params?: SqlParam[]): Promise<unknown[][]> {
    const conn = await this.ensureConnection();
    const res = await conn.query(sql, normalizeMobileParams(params));
    const rows = res.values ?? [];
    return rows.map((row) => Object.values(row));
  }

  async queryObjects<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: SqlParam[]
  ): Promise<T[]> {
    const conn = await this.ensureConnection();
    const res = await conn.query(sql, normalizeMobileParams(params));
    return (res.values ?? []) as T[];
  }

  async execute(sql: string, params?: SqlParam[]): Promise<SqlExecutionResult> {
    const conn = await this.ensureConnection();
    const res = await conn.run(sql, normalizeMobileParams(params), !this.inTransaction);
    return {
      changes: res.changes?.changes ?? 0,
      lastInsertRowid: res.changes?.lastId,
    };
  }

  async execScript(sql: string): Promise<void> {
    const conn = await this.ensureConnection();
    await conn.execute(sql, !this.inTransaction);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const conn = await this.ensureConnection();
    if (this.inTransaction) {
      return fn();
    }
    this.inTransaction = true;
    await conn.beginTransaction();
    try {
      const value = await fn();
      await conn.commitTransaction();
      return value;
    } catch (err) {
      try {
        await conn.rollbackTransaction();
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
