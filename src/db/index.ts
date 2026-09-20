/**
 * Veritabanı istemcisi.
 *
 * İKİ KİP
 * -------
 * 1. Üretim / Railway:  DATABASE_URL=postgresql://...
 *    Vercel serverless'ta her istek yeni modül örneği yaratabilir; bağlantı
 *    globalThis üzerinde yeniden kullanılır ve havuz küçük tutulur.
 *
 * 2. Yerel geliştirme:  DATABASE_URL=pglite://memory
 *    Postgres'in WASM'a derlenmiş tam sürümü süreç içinde çalışır.
 *    Hiçbir sunucu kurmaya gerek yok — `npm run dev` yeter; şema ilk
 *    istekte otomatik uygulanır.
 *
 *    "memory" verilirse veri bellekte tutulur ve sunucu kapanınca silinir
 *    (her açılışta temiz 1.000 coin — denemek için en pratiği).
 *    Bir klasör adı verilirse (pglite://.pglite) veri diske yazılır; bu
 *    durumda sunucuyu düzgün kapatmak gerekir, sert öldürülürse klasör
 *    bozulabilir ve elle silinmesi gerekir.
 */

import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import * as schema from "./schema";
import type { Db } from "./types";

const url = process.env.DATABASE_URL ?? "";
const isEmbedded = url.startsWith("pglite://");

const globalForDb = globalThis as unknown as {
  __106_db?: Db;
  __106_sql?: ReturnType<typeof postgres>;
  __106_ready?: Promise<void>;
};

function createDb(): Db {
  if (!url) {
    throw new Error(
      "DATABASE_URL tanımlı değil. Yerel geliştirme için: DATABASE_URL=pglite://.pglite",
    );
  }

  if (isEmbedded) {
    // PGlite yanında .wasm ve .data dosyaları taşır; paketleyiciye girerse
    // bunlar kaybolur. eval("require") paketleyiciyi atlayıp Node'un gerçek
    // require'ını verir, böylece paket node_modules'tan olduğu gibi yüklenir.
    // Yalnızca yerel geliştirme yolunda çalışır; üretimde bu dal hiç girilmez.
    const nodeRequire = eval("require") as NodeRequire;
    const { PGlite } = nodeRequire("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    const target = url.replace("pglite://", "");
    const client = !target || target === "memory" ? new PGlite() : new PGlite(target);
    return drizzlePglite(client, { schema }) as unknown as Db;
  }

  globalForDb.__106_sql ??= postgres(url, {
    max: 5, // serverless: düşük tut
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // pgbouncer transaction pooling ile uyumluluk
  });
  return drizzlePg(globalForDb.__106_sql, { schema }) as unknown as Db;
}

globalForDb.__106_db ??= createDb();
export const db: Db = globalForDb.__106_db;

/**
 * Gömülü kipte şemayı ve rozet tanımlarını hazırlar (bir kez).
 * Gerçek Postgres kullanılıyorsa hiçbir şey yapmaz — orada migration
 * `npm run db:migrate` ile elle uygulanır.
 */
export async function ensureSchema(): Promise<void> {
  if (!isEmbedded) return;
  globalForDb.__106_ready ??= (async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { sql } = await import("drizzle-orm");

    // Şema zaten kuruluysa migration dosyalarına hiç dokunma.
    let probe;
    try {
      probe = await db.execute(sql.raw(`select to_regclass('public."user"') as t`));
    } catch (e) {
      const dir = url.replace("pglite://", "");
      if (dir && dir !== "memory") {
        throw new Error(
          `Gömülü veritabanı açılamadı (${dir}). Sunucu daha önce düzgün ` +
            `kapatılmamış olabilir; "${dir}" klasörünü silip tekrar deneyin. ` +
            `Kalıcılık gerekmiyorsa DATABASE_URL=pglite://memory kullanın.`,
          { cause: e },
        );
      }
      throw e;
    }
    const rows = (probe as unknown as { rows?: { t: string | null }[] }).rows ?? [];
    const alreadySetUp = rows[0]?.t != null;

    if (!alreadySetUp) {
      const dir = join(process.cwd(), "drizzle");
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
        const statements = readFileSync(join(dir, file), "utf8")
          .split("--> statement-breakpoint")
          .map((x) => x.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await db.execute(sql.raw(statement));
        }
      }
    }

    const { seedBadges } = await import("@/lib/badges");
    await db.transaction(async (tx) => seedBadges(tx as never));
  })();
  return globalForDb.__106_ready;
}

export * as schema from "./schema";
