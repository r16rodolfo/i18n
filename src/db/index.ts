import type { SQLWrapper } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    // Supabase pooler in transaction mode (port 6543) does not support
    // prepared statements, so they must be disabled.
    const client = postgres(url, { prepare: false, max: 5 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Lazy proxy so importing this module never opens a connection (e.g. at build time)
export const db = {
  get query() {
    return getDb().query;
  },
  insert: (...args: Parameters<Database["insert"]>) => getDb().insert(...args),
  update: (...args: Parameters<Database["update"]>) => getDb().update(...args),
  delete: (...args: Parameters<Database["delete"]>) => getDb().delete(...args),
  select: (...args: Parameters<Database["select"]>) => getDb().select(...args),
  execute: <T extends Record<string, unknown>>(query: SQLWrapper | string) =>
    getDb().execute<T>(query),
};
