import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { type SqlDriver, type SqlParam } from './driver.js';
import { schema, type TutorSchema } from './schema.js';

export type TutorDatabase = SqliteRemoteDatabase<TutorSchema>;

/**
 * Creates a Drizzle ORM database instance backed by any cross-platform `SqlDriver`.
 */
export function createTutorDatabase(driver: SqlDriver): TutorDatabase {
  const executeSingle = async (
    sql: string,
    params: unknown[],
    method: 'run' | 'all' | 'values' | 'get'
  ): Promise<{ rows: unknown[] }> => {
    const typedParams = params as SqlParam[];

    if (method === 'run') {
      await driver.execute(sql, typedParams);
      return { rows: [] };
    }

    const rows = await driver.queryValues(sql, typedParams);

    if (method === 'get') {
      // Drizzle sqlite-proxy expects `rows` to be the single row array (or undefined) for `get`
      return { rows: rows[0] as unknown[] };
    }

    return { rows };
  };

  const executeBatch = async (
    batch: Array<{ sql: string; params: unknown[]; method: 'run' | 'all' | 'values' | 'get' }>
  ): Promise<Array<{ rows: unknown[] }>> => {
    return driver.transaction(async () => {
      const results: Array<{ rows: unknown[] }> = [];
      for (const item of batch) {
        results.push(await executeSingle(item.sql, item.params, item.method));
      }
      return results;
    });
  };

  return drizzle(executeSingle, executeBatch, { schema });
}
