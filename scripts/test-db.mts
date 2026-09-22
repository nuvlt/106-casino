/**
 * Testler için veritabanı.
 *
 * Varsayılan: PGlite — süreç içinde, kurulum gerektirmez.
 *
 * TEST_DATABASE_URL verilirse testler GERÇEK bir Postgres sunucusuna,
 * üretimdeki sürücüyle (postgres.js, aynı ayarlar) karşı koşar. PGlite
 * bazı tip dönüşümlerinde daha hoşgörülü; örneğin ham `sql` şablonuna
 * konan Date nesnesini sorunsuz yazıyor, postgres.js ise reddediyor.
 * Üretime çıkmadan önce bir kez gerçek sunucuyla koşmak bu farkları
 * yakalar:
 *
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/casino_test npm run test:all
 *
 * DİKKAT: Verilen veritabanındaki "public" şeması her test dosyasında
 * silinip yeniden kurulur. Asla üretim adresi vermeyin.
 */

import { readFileSync, readdirSync } from "node:fs";
import type { Db } from "../src/db/types.ts";
import * as schema from "../src/db/schema.ts";

function migrationStatements(): string[] {
  return readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) =>
      readFileSync(`drizzle/${f}`, "utf8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean),
    );
}

export async function makeTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.TEST_DATABASE_URL;

  if (url) {
    if (/rlwy\.net|railway/i.test(url)) {
      throw new Error("TEST_DATABASE_URL üretim veritabanına benziyor — testler şemayı siler, durduruldu.");
    }
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // src/db/index.ts ile aynı ayarlar.
    const sql = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
    await sql.unsafe("drop schema if exists public cascade; create schema public;");
    for (const stmt of migrationStatements()) await sql.unsafe(stmt);
    const db = drizzle(sql, { schema }) as unknown as Db;
    return { db, close: () => sql.end({ timeout: 5 }) };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  await client.waitReady;
  for (const stmt of migrationStatements()) await client.exec(stmt);
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, close: () => client.close() };
}
