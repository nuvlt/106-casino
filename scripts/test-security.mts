/**
 * Güvenlik regresyon testleri — Aşama 6 güvenlik incelemesinde bulunan
 * açıkların kapalı kaldığını doğrular.
 *
 * Eşzamanlılık testleri asıl anlamını gerçek Postgres'te kazanır:
 *   TEST_DATABASE_URL=postgresql://... npm run test:security
 */

import { eq, and } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { ensureActiveSeed, rotateSeed } from "../src/lib/seeds.ts";
import { openRound, settleOpenRound, settleRound } from "../src/lib/wallet.ts";
import { resolveWheel } from "../src/lib/games/engine.ts";
import { describe as hiloDescribe } from "../src/lib/hilo.ts";
import { COIN, HL_MAX_MULT } from "../src/lib/games/config.ts";
import { makeTestDb } from "./test-db.mts";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(ok ? `  ✅ ${name}` : `  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? passed++ : failed++;
};
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    // Kod karşılaştırılır: test dosyası ile uygulama modülleri farklı yollardan
    // (göreli / "@/" takma adı) yüklendiğinde sınıf kimliği ayrışabiliyor.
    return (e as { code?: string }).code ?? String(e);
  }
};

const { db, close } = await makeTestDb();
await db.transaction(async (tx) => seedBadges(tx as never));
for (const id of ["u1", "u2"]) {
  await db.insert(schema.users).values({ id, email: `${id}@106dijital.com`, name: id });
  await ensureDailyState(db, id);
  await ensureActiveSeed(db, id);
}
const bet = 10 * COIN;
const crash = (key: string, userId = "u1") =>
  openRound(db, {
    userId, game: "CRASH", bet, params: {}, idempotencyKey: key, ttlMs: 600_000,
    build: () => ({ secret: { crashPoint: 500, autoCashout: null }, publicState: {} }),
  });

console.log("\nAçık tur varken tohum döndürülemez");
const r1 = await crash("sec-open-1");
const rotCode = await codeOf(rotateSeed(db, "u1"));
check("açık turda döndürme reddedildi", rotCode === "ROUND_OPEN", rotCode);
const [pair] = await db
  .select({ active: schema.seedPairs.active })
  .from(schema.seedPairs)
  .where(and(eq(schema.seedPairs.userId, "u1"), eq(schema.seedPairs.active, true)));
check("tohum hâlâ gizli ve aktif", pair?.active === true);
await settleOpenRound(db, { userId: "u1", roundId: r1.roundId, game: "CRASH", payout: 0, mult: 0, publicState: {} });
check("tur bitince döndürme serbest", (await codeOf(rotateSeed(db, "u1"))) === "OK");

console.log("\nDöndürme ile tur açılışı aynı anda");
for (let i = 0; i < 5; i++) {
  const [open, rot] = await Promise.all([codeOf(crash(`sec-race-${i}`)), codeOf(rotateSeed(db, "u1"))]);
  const openRounds = await db.select().from(schema.rounds)
    .where(and(eq(schema.rounds.userId, "u1"), eq(schema.rounds.state, "OPEN")));
  // İkisi birden başarılı olmamalı: tur açıldıysa tohumu o tur bitmeden açılmamış olmalı.
  const leaked = open === "OK" && rot === "OK" && openRounds.length > 0 &&
    (await db.select().from(schema.seedPairs).where(eq(schema.seedPairs.id,
      (await db.select().from(schema.rounds).where(eq(schema.rounds.id, openRounds[0]!.id)))[0]!.seedPairId)))[0]!.revealedAt != null;
  check(`deneme ${i + 1}: açık turun tohumu açılmadı`, !leaked, `${open}/${rot}`);
  for (const r of openRounds) {
    await settleOpenRound(db, { userId: "u1", roundId: r.id, game: "CRASH", payout: 0, mult: 0, publicState: {} });
  }
}

console.log("\nAynı anda iki açık tur açılamaz");
const pair2 = await Promise.all([crash("sec-dbl-a"), crash("sec-dbl-b")].map(codeOf));
const opens = await db.select().from(schema.rounds)
  .where(and(eq(schema.rounds.userId, "u1"), eq(schema.rounds.state, "OPEN")));
check("yalnızca bir tur açık kaldı", opens.length === 1, `${pair2.join("/")} → ${opens.length} açık tur`);
check("ikinci istek 'açık tur var' ile reddedildi", pair2.includes("ROUND_OPEN"), pair2.join("/"));
for (const r of opens) {
  await settleOpenRound(db, { userId: "u1", roundId: r.id, game: "CRASH", payout: 0, mult: 0, publicState: {} });
}

console.log("\nBaşkasının istek anahtarı");
const own = await settleRound(db, {
  userId: "u1", game: "WHEEL", bet, params: {}, idempotencyKey: "sec-key-1", resolve: (rng) => resolveWheel(rng, bet),
});
const other = await codeOf(settleRound(db, {
  userId: "u2", game: "WHEEL", bet, params: {}, idempotencyKey: "sec-key-1", resolve: (rng) => resolveWheel(rng, bet),
}));
check("başkasının anahtarı reddedildi", other === "DUPLICATE_KEY", other);
const again = await settleRound(db, {
  userId: "u1", game: "WHEEL", bet, params: {}, idempotencyKey: "sec-key-1", resolve: (rng) => resolveWheel(rng, bet),
});
check("kendi anahtarıyla tekrar aynı turu döndürür", again.roundId === own.roundId);

console.log("\nBakiye aşılamaz — coin'i yetmeyen oynayamaz");
// Önce bir ısınma turu: "İlk Adım" rozeti ödülü testin ortasında bakiyeyi büyütmesin.
await settleRound(db, {
  userId: "u2", game: "DICE", bet, params: {}, idempotencyKey: "sec-warmup",
  resolve: () => ({ payout: 0, mult: 0, detail: {} }),
});
await db.update(schema.users).set({ balance: 3 * bet }).where(eq(schema.users.id, "u2"));
const burst = await Promise.all(
  Array.from({ length: 10 }, (_, i) =>
    codeOf(settleRound(db, {
      userId: "u2", game: "DICE", bet, params: {}, idempotencyKey: `sec-burst-${i}`,
      // Hep kaybeden bir tur: kazanç bakiyeyi büyütüp testi bulandırmasın.
      resolve: () => ({ payout: 0, mult: 0, detail: {} }),
    })),
  ),
);
const [u2] = await db.select({ balance: schema.users.balance }).from(schema.users).where(eq(schema.users.id, "u2"));
const accepted = burst.filter((c) => c === "OK").length;
check("aynı anda 10 bahisten yalnızca bakiyenin yettiği 3'ü kabul edildi", accepted === 3, `${accepted} kabul`);
check("reddedilenler 'yetersiz bakiye' ile döndü", burst.filter((c) => c === "INSUFFICIENT_FUNDS").length === 7, burst.join(","));
check("bakiye sıfırın altına inmedi", u2!.balance === 0, `${u2!.balance}`);

console.log("\nYüksek/Alçak çarpan tavanı");
const nearCap = hiloDescribe({ deck: Array.from({ length: 52 }, (_, i) => i), position: 0, mult: HL_MAX_MULT / 2 });
const shown = [nearCap.nextMult.higher, nearCap.nextMult.lower].filter((x): x is number => x != null);
check("gösterilen sonraki çarpan tavanı aşmıyor", shown.every((m) => m <= HL_MAX_MULT), shown.join(", "));
check("tavan × en yüksek bahis 32-bit sınırın altında", HL_MAX_MULT * 500 * COIN < 2_147_483_647);

console.log(`\n${passed} geçti, ${failed} başarısız`);
await close();
process.exit(failed ? 1 : 0);
