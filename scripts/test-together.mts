/**
 * Transaction içinde aynı anda başlatılan işlerden biri hata verirse,
 * diğerinin sonraki yazımı ASLA kalıcı olmamalı (bkz. src/lib/together.ts).
 *
 * Gerçek Postgres'te (TEST_DATABASE_URL) Promise.all ile bu test düşer:
 * ROLLBACK'ten sonra gönderilen INSERT otomatik onaylanır.
 */

import { sql } from "drizzle-orm";
import { together } from "../src/lib/together.ts";
import { makeTestDb } from "./test-db.mts";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(ok ? `  ✅ ${name}` : `  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? passed++ : failed++;
};

const { db, close } = await makeTestDb();
await db.execute(sql`create table probe (id int)`);

console.log("\nHata veren dal, kardeş dalın yazımını geri alır");
let thrown: unknown = null;
try {
  await db.transaction(async (tx) => {
    await together([
      (async () => {
        await tx.execute(sql`select 1`);
        throw new Error("iş kuralı hatası");
      })(),
      (async () => {
        await tx.execute(sql`select 1`);
        await tx.execute(sql`select pg_sleep(0.05)`);
        await tx.execute(sql`insert into probe values (1)`);
      })(),
    ]);
  });
} catch (e) {
  thrown = e;
}
// Bekleyen olası "kaçak" sorgulara zaman tanı.
await new Promise((r) => setTimeout(r, 200));
const rows = (await db.execute(sql`select count(*)::int as n from probe`)) as unknown as
  | { rows: { n: number }[] }
  | { n: number }[];
const n = Array.isArray(rows) ? rows[0]!.n : rows.rows[0]!.n;
check("hata dışarı fırlatıldı", thrown instanceof Error && thrown.message === "iş kuralı hatası");
check("kardeş dalın INSERT'i kalıcı olmadı", n === 0, `probe satır sayısı ${n}`);

console.log("\nHata önceliği dizideki sıraya göre");
try {
  await together([
    new Promise((_, rej) => setTimeout(() => rej(new Error("birinci")), 30)),
    Promise.reject(new Error("ikinci")),
  ]);
} catch (e) {
  check("önce gelen dalın hatası kazanır", (e as Error).message === "birinci");
}

console.log(`\n${passed} geçti, ${failed} başarısız`);
await close();
process.exit(failed ? 1 : 0);
