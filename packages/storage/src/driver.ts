export type SqlParam = string | number | boolean | null | Uint8Array;

export interface SqlExecutionResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Cross-platform SQLite driver abstraction.
 *
 * Implementations:
 * - Desktop / Node / Tests: `NodeSqliteDriver` (Node 22 built-in `node:sqlite`) or
 *   `createBetterSqlite3Driver(db)` (Electron `better-sqlite3`).
 * - Android (Phase 3): `@capacitor-community/sqlite` adapter implementing this exact interface.
 */
export interface SqlDriver {
  readonly dialect: 'sqlite';
  readonly name: string;

  /**
   * Executes a parameterized query and returns rows as positional column-value arrays.
   * Compatible with Drizzle ORM's `sqlite-proxy` array mode (safe for multi-table JOINs).
   */
  queryValues(sql: string, params?: SqlParam[]): Promise<unknown[][]>;

  /**
   * Executes a parameterized query and returns rows as keyed objects.
   */
  queryObjects<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: SqlParam[]
  ): Promise<T[]>;

  /**
   * Executes a write or DDL statement (INSERT / UPDATE / DELETE / CREATE).
   */
  execute(sql: string, params?: SqlParam[]): Promise<SqlExecutionResult>;

  /**
   * Executes a raw multi-statement SQL script (used for migrations and PRAGMAs).
   */
  execScript(sql: string): Promise<void>;

  /**
   * Runs an async callback inside a SQLite transaction (BEGIN / COMMIT / ROLLBACK).
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Closes the underlying SQLite connection.
   */
  close(): Promise<void>;
}

type SqliteBinding = string | number | null | Uint8Array;

function normalizeParams(params: SqlParam[] = []): SqliteBinding[] {
  return params.map((p) => {
    if (typeof p === 'boolean') {
      return p ? 1 : 0;
    }
    return p;
  });
}

interface NodeSqliteStatementLike {
  all: (...params: SqliteBinding[]) => unknown[];
  run: (...params: SqliteBinding[]) => {
    changes?: number | bigint;
    lastInsertRowid?: number | bigint;
  };
  setReturnArrays?: (enabled: boolean) => void;
}

interface NodeSqliteDatabaseLike {
  exec: (sql: string) => void;
  prepare: (sql: string) => NodeSqliteStatementLike;
  close: () => void;
}

/**
 * Zero-native-build SQLite driver backed by Node 22's built-in `node:sqlite` (`DatabaseSync`).
 * Supports both `:memory:` (ideal for unit tests) and file-backed local databases.
 */
export class NodeSqliteDriver implements SqlDriver {
  readonly dialect = 'sqlite' as const;
  readonly name = 'node:sqlite';

  private db: NodeSqliteDatabaseLike | null = null;
  private readonly location: string;
  private inTransaction = false;

  constructor(location = ':memory:') {
    this.location = location;
  }

  private async ensureOpen(): Promise<NodeSqliteDatabaseLike> {
    if (this.db) {
      return this.db;
    }
    // Dynamic import avoids breaking non-Node bundlers (e.g., Capacitor WebView)
    const mod = (await import('node:sqlite')) as unknown as {
      DatabaseSync: new (path: string) => NodeSqliteDatabaseLike;
    };
    const instance = new mod.DatabaseSync(this.location);
    instance.exec('PRAGMA foreign_keys = ON;');
    if (this.location !== ':memory:') {
      instance.exec('PRAGMA journal_mode = WAL;');
    }
    this.db = instance;
    return instance;
  }

  async queryValues(sql: string, params?: SqlParam[]): Promise<unknown[][]> {
    const db = await this.ensureOpen();
    const stmt = db.prepare(sql);
    const normalized = normalizeParams(params);
    if (typeof stmt.setReturnArrays === 'function') {
      stmt.setReturnArrays(true);
      return stmt.all(...normalized) as unknown[][];
    }
    const rows = stmt.all(...normalized) as Record<string, unknown>[];
    return rows.map((row) => Object.values(row));
  }

  async queryObjects<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: SqlParam[]
  ): Promise<T[]> {
    const db = await this.ensureOpen();
    const stmt = db.prepare(sql);
    const normalized = normalizeParams(params);
    return stmt.all(...normalized) as T[];
  }

  async execute(sql: string, params?: SqlParam[]): Promise<SqlExecutionResult> {
    const db = await this.ensureOpen();
    const stmt = db.prepare(sql);
    const result = stmt.run(...normalizeParams(params));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async execScript(sql: string): Promise<void> {
    const db = await this.ensureOpen();
    db.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const db = await this.ensureOpen();
    if (this.inTransaction) {
      return fn();
    }
    this.inTransaction = true;
    db.exec('BEGIN IMMEDIATE;');
    try {
      const value = await fn();
      db.exec('COMMIT;');
      return value;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback error if transaction was already aborted
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Minimal structural interface matching `better-sqlite3` Database instances
 * so Electron desktop can plug in `better-sqlite3` without forcing native builds in core/storage.
 */
export interface BetterSqlite3StatementLike {
  raw: (toggle?: boolean) => BetterSqlite3StatementLike;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
}

export interface BetterSqlite3Like {
  exec: (sql: string) => void;
  prepare: (sql: string) => BetterSqlite3StatementLike;
  close: () => void;
}

/**
 * Adapts an existing `better-sqlite3` Database instance to the universal `SqlDriver` contract.
 */
export function createBetterSqlite3Driver(db: BetterSqlite3Like): SqlDriver {
  db.exec('PRAGMA foreign_keys = ON;');
  let inTx = false;

  return {
    dialect: 'sqlite',
    name: 'better-sqlite3',

    async queryValues(sql: string, params?: SqlParam[]): Promise<unknown[][]> {
      const stmt = db.prepare(sql).raw(true);
      return stmt.all(...normalizeParams(params)) as unknown[][];
    },

    async queryObjects<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: SqlParam[]
    ): Promise<T[]> {
      const stmt = db.prepare(sql);
      return stmt.all(...normalizeParams(params)) as T[];
    },

    async execute(sql: string, params?: SqlParam[]): Promise<SqlExecutionResult> {
      const stmt = db.prepare(sql);
      const res = stmt.run(...normalizeParams(params));
      return {
        changes: res.changes,
        lastInsertRowid: res.lastInsertRowid,
      };
    },

    async execScript(sql: string): Promise<void> {
      db.exec(sql);
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (inTx) {
        return fn();
      }
      inTx = true;
      db.exec('BEGIN IMMEDIATE;');
      try {
        const result = await fn();
        db.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Ignore rollback failure
        }
        throw err;
      } finally {
        inTx = false;
      }
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
