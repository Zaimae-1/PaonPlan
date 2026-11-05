import pg from "pg";
import type { PoolClient, QueryResultRow } from "pg";

pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1082, (date) => date);

const globalDb = globalThis as typeof globalThis & { paonPool?: pg.Pool; paonConnection?: string };

export function database() {
  if (!process.env.DATABASE_URL) throw new DomainError("Database usaha belum dikonfigurasi. Lihat panduan di README.", 503);
  if (globalDb.paonConnection !== process.env.DATABASE_URL) {
    void globalDb.paonPool?.end().catch(() => {});
    globalDb.paonPool = undefined;
    globalDb.paonConnection = process.env.DATABASE_URL;
  }
  return globalDb.paonPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000 });
}

export class DomainError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function requireCondition(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new DomainError(message, status);
}

export type Connection = pg.Pool | PoolClient;

export async function rows<T extends QueryResultRow>(db: Connection, sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T extends QueryResultRow>(db: Connection, sql: string, params: unknown[] = []) {
  return (await rows<T>(db, sql, params))[0] as T | undefined;
}

export async function transaction<T>(work: (db: PoolClient) => Promise<T>) {
  const db = await database().connect();
  try {
    await db.query("BEGIN");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
}
