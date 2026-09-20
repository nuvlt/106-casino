/**
 * Veritabanı istemcisi.
 *
 * Vercel serverless'ta her istek yeni bir modül örneği yaratabilir; bu yüzden
 * bağlantı globalThis üzerinde yeniden kullanılır ve havuz küçük tutulur
 * (Railway Postgres'in bağlantı limiti sınırlı).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as {
  __106_sql?: ReturnType<typeof postgres>;
};

function client() {
  if (!connectionString) {
    throw new Error("DATABASE_URL tanımlı değil — .env dosyasını kontrol edin.");
  }
  globalForDb.__106_sql ??= postgres(connectionString, {
    max: 5, // serverless: düşük tut
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // pgbouncer transaction pooling ile uyumluluk
  });
  return globalForDb.__106_sql;
}

export const db = drizzle(client(), { schema });

export * as schema from "./schema";
