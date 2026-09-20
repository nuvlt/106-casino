/**
 * Migration doğrulaması — gerçek Postgres motoruna ihtiyaç duymadan.
 *
 * PGlite, Postgres'in WASM'a derlenmiş tam sürümü. drizzle/0000_init.sql
 * gerçekten çalıştırılır; tablolar, indeksler ve kısıtlar bellekte kurulur.
 * Böylece "şema geçerli görünüyor" değil, "şema gerçekten kuruluyor" derim.
 */

import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dir = "drizzle";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const db = new PGlite();
await db.waitReady;

for (const file of files) {
  const sql = readFileSync(`${dir}/${file}`, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const [i, statement] of statements.entries()) {
    try {
      await db.exec(statement);
    } catch (e) {
      console.error(`\n❌ ${file} — ${i + 1}. ifade başarısız:\n${statement}\n`);
      throw e;
    }
  }
  console.log(`✅ ${file} — ${statements.length} ifade uygulandı`);
}

const tables = await db.query<{ table_name: string }>(
  `select table_name from information_schema.tables
   where table_schema = 'public' order by table_name`,
);
const indexes = await db.query<{ indexname: string }>(
  `select indexname from pg_indexes where schemaname = 'public'`,
);
const fks = await db.query<{ n: string }>(
  `select conname as n from pg_constraint where contype = 'f'`,
);

console.log(`\n${tables.rows.length} tablo, ${indexes.rows.length} indeks, ${fks.rows.length} yabancı anahtar`);
console.log(tables.rows.map((r) => r.table_name).join(", "));

// Kısmi tekil indeks gerçekten çalışıyor mu? (kullanıcı başına tek aktif tohum)
await db.exec(`insert into "user" (id, email) values ('u1', 'a@106dijital.com')`);
await db.exec(
  `insert into seed_pair (id, user_id, server_seed, server_seed_hash, client_seed, active)
   values ('s1', 'u1', 'x', 'y', 'z', true)`,
);
await db.exec(
  `insert into seed_pair (id, user_id, server_seed, server_seed_hash, client_seed, active)
   values ('s2', 'u1', 'x', 'y', 'z', false)`,
);
try {
  await db.exec(
    `insert into seed_pair (id, user_id, server_seed, server_seed_hash, client_seed, active)
     values ('s3', 'u1', 'x', 'y', 'z', true)`,
  );
  console.error("❌ İki aktif tohum çifti kabul edildi — kısmi indeks çalışmıyor!");
  process.exit(1);
} catch {
  console.log("✅ Kısmi tekil indeks: kullanıcı başına ikinci aktif tohum reddedildi");
}

// Pasif tohum birden fazla olabilmeli.
await db.exec(
  `insert into seed_pair (id, user_id, server_seed, server_seed_hash, client_seed, active)
   values ('s4', 'u1', 'x', 'y', 'z', false)`,
);
console.log("✅ Birden fazla pasif tohum çifti kabul ediliyor");

await db.close();
