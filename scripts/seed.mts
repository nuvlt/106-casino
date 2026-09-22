/**
 * Üretim veritabanına rozet tanımlarını yazar (idempotent).
 *
 *   DIRECT_DATABASE_URL=postgresql://... npm run db:seed
 *
 * Migration'dan sonra bir kez çalıştırılır; rozet listesi değişince
 * tekrar çalıştırmak güvenlidir (var olanı günceller, çift kayıt açmaz).
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema.ts";
import { BADGES, seedBadges } from "../src/lib/badges.ts";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url || url.startsWith("pglite://")) {
  console.error("DIRECT_DATABASE_URL (veya DATABASE_URL) gerçek bir Postgres adresi olmalı.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(sql, { schema });
await db.transaction(async (tx) => seedBadges(tx as never));
await sql.end({ timeout: 5 });
console.log(`✅ ${BADGES.length} rozet tanımı yazıldı.`);
