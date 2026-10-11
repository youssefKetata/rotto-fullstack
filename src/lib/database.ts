import "server-only";

import postgres from "postgres";

// Keep one small pool per server process, including development hot reloads.
const server = globalThis as typeof globalThis & {
  rottoDatabase?: postgres.Sql;
};

export function getDatabase(): postgres.Sql {
  if (!server.rottoDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    server.rottoDatabase = postgres(url, {
      max: 10,
      connect_timeout: 5,
      idle_timeout: 20,
      prepare: false,
      onnotice: () => {},
    });
  }
  return server.rottoDatabase;
}

export type DatabaseTransaction = postgres.TransactionSql;
