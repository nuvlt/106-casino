/**
 * Cüzdan ve ekonomi entegrasyon testleri.
 *
 * Gerçek Postgres motoruna (PGlite/WASM) karşı çalışır — sahte nesne yok,
 * gerçek transaction, gerçek kısıtlar. Test ettiklerimiz:
 *   • günlük hak bir kez verilir, ikinci çağrı hiçbir şey yazmaz
 *   • bakiye biriktirmez (SET edilir, eklenmez)
 *   • yetersiz bakiye reddedilir
 *   • aynı idempotency anahtarı ikinci turu AÇMAZ
 *   • ledger toplamı bakiyeyle birebir tutar
 *   • zirve bakiye düşüşte korunur (sıralamanın temeli)
 */

import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import type { Db } from "../src/db/types.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { ensureActiveSeed } from "../src/lib/seeds.ts";
import { settleRound, WalletError } from "../src/lib/wallet.ts";
import { resolveDice, resolveWheel } from "../src/lib/games/engine.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { COIN, DAILY_GRANT } from "../src/lib/games/config.ts";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const client = new PGlite();
await client.waitReady;
for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(`drizzle/${file}`, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await client.exec(stmt);
  }
}
const db = drizzle(client, { schema }) as unknown as Db;
await db.transaction(async (tx) => seedBadges(tx as never));

await db.insert(schema.users).values({ id: "u1", email: "onur@106dijital.com", name: "Onur T." });

/* ---------------------------------------------------------------- */
console.log("\nGünlük hak ve seri");

const first = await ensureDailyState(db, "u1");
check("ilk çağrı 1.000 coin veriyor", first.balance === DAILY_GRANT, `${first.balance}`);
check("seri 1. günden başlıyor", first.streakDay === 1);
check("taze verildi işareti doğru", first.freshlyGranted === true);

const second = await ensureDailyState(db, "u1");
check("ikinci çağrı tekrar para vermiyor", second.balance === DAILY_GRANT && !second.freshlyGranted);

const claimCount = await db.select().from(schema.dailyClaims).where(eq(schema.dailyClaims.userId, "u1"));
check("tek günlük hak kaydı var", claimCount.length === 1, `${claimCount.length} kayıt`);

const missionRows = await db.select().from(schema.userMissions).where(eq(schema.userMissions.userId, "u1"));
check("3 günlük görev atandı", missionRows.length === 3, `${missionRows.length} görev`);

await ensureActiveSeed(db, "u1");

/* ---------------------------------------------------------------- */
console.log("\nBahis akışı");

const bet = 100 * COIN;
const r1 = await settleRound(db, {
  userId: "u1",
  game: "WHEEL",
  bet,
  params: {},
  idempotencyKey: "key-1",
  resolve: (rng) => resolveWheel(rng, bet),
});
// İlk tur "İlk Kan" rozetini de kazandırır; ödülü bakiyeye eklenir.
const badgeReward = r1.newBadges.reduce((sum, b) => sum + b.reward, 0);
check("tur çözüldü ve bakiye güncellendi (rozet ödülü dahil)",
  r1.balance === DAILY_GRANT - bet + r1.payout + badgeReward,
  `beklenen ${DAILY_GRANT - bet + r1.payout + badgeReward}, gelen ${r1.balance}`);
check("ilk tur 'İlk Kan' rozetini verdi", r1.newBadges.some((b) => b.id === "ilk-kan"),
  r1.newBadges.map((b) => b.id).join(","));
check("çarpan ile ödeme tutarlı", r1.payout === Math.floor(bet * r1.mult));
check("tohum bilgisi dönüyor, serverSeed dönmüyor",
  !!r1.fairness.serverSeedHash && !("serverSeed" in r1.fairness));

const r1again = await settleRound(db, {
  userId: "u1",
  game: "WHEEL",
  bet,
  params: {},
  idempotencyKey: "key-1",
  resolve: (rng) => resolveWheel(rng, bet),
});
check("aynı idempotency anahtarı yeni tur AÇMIYOR", r1again.roundId === r1.roundId);

const allRounds = await db.select().from(schema.rounds);
check("veritabanında tek tur var", allRounds.length === 1, `${allRounds.length} tur`);

/* ---------------------------------------------------------------- */
console.log("\nYetersiz bakiye");

const [me] = await db.select().from(schema.users).where(eq(schema.users.id, "u1"));
const tooMuch = (me!.balance + 1000) as number;
let rejected = false;
try {
  await settleRound(db, {
    userId: "u1",
    game: "DICE",
    bet: tooMuch,
    params: {},
    idempotencyKey: "key-too-much",
    resolve: (rng) => resolveDice(rng, tooMuch, 4750, "under"),
  });
} catch (e) {
  rejected = e instanceof WalletError;
}
check("bakiyeden fazla bahis reddedildi", rejected);

/* ---------------------------------------------------------------- */
console.log("\nDefter mutabakatı (100 tur)");

for (let i = 0; i < 100; i++) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, "u1"));
  if (!u || u.balance < 10 * COIN) break;
  const stake = Math.min(10 * COIN, u.balance);
  await settleRound(db, {
    userId: "u1",
    game: "DICE",
    bet: stake,
    params: { winOutcomes: 4750, mode: "under" },
    idempotencyKey: `loop-${i}`,
    resolve: (rng) => resolveDice(rng, stake, 4750, "under"),
  });
}

const [ledgerSum] = await db
  .select({ total: sql<number>`coalesce(sum(${schema.ledgerEntries.amount}), 0)::int` })
  .from(schema.ledgerEntries)
  .where(eq(schema.ledgerEntries.userId, "u1"));
const [finalUser] = await db.select().from(schema.users).where(eq(schema.users.id, "u1"));

check("ledger toplamı = bakiye", ledgerSum!.total === finalUser!.balance,
  `ledger ${ledgerSum!.total} vs bakiye ${finalUser!.balance}`);

const [stat] = await db.select().from(schema.playerStats).where(eq(schema.playerStats.userId, "u1"));
check("zirve bakiye düşüşte korunuyor", stat!.peakBalance >= finalUser!.balance,
  `zirve ${stat!.peakBalance}, şu an ${finalUser!.balance}`);
check("oynanan tur sayısı kaydedildi", (stat!.roundsPlayed ?? 0) > 1, `${stat!.roundsPlayed}`);
check("çevrim toplamı kaydedildi", (stat!.totalWagered ?? 0) > 0);

const touched = stat!.gamesTouched as string[];
check("denenen oyunlar takip ediliyor", touched.includes("WHEEL") && touched.includes("DICE"),
  JSON.stringify(touched));

/* ---------------------------------------------------------------- */
console.log("\nGizli alan sızıntısı");

// Gerçek serverSeed değerini alıp, istemciye dönen yapıda geçmediğini doğrula.
const [activeSeed] = await db
  .select()
  .from(schema.seedPairs)
  .where(eq(schema.seedPairs.userId, "u1"))
  .limit(1);
const clientFacing = JSON.stringify(r1);
check("istemciye dönen yanıtta serverSeed'in kendisi geçmiyor",
  activeSeed !== undefined && !clientFacing.includes(activeSeed.serverSeed));
check("ama hash'i yayınlanıyor (taahhüt)",
  activeSeed !== undefined && clientFacing.includes(activeSeed.serverSeedHash));

await client.close();

console.log(`\n${passed} geçti, ${failed} başarısız`);
process.exit(failed === 0 ? 0 : 1);
