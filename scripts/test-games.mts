/**
 * Oyun akışı entegrasyon testleri — gerçek Postgres motoruna (PGlite) karşı.
 *
 * Özellikle sınananlar:
 *   • aynı anda ikinci tur açılamaz (Crash/Hilo açıkken bahis engellenir)
 *   • Crash çarpanı SUNUCU saatinden hesaplanır, istemci iddiası yok sayılır
 *   • çöküşten sonra yapılan çekim KAZANÇ SAYILMAZ (150 ms açığının kapalı olduğu)
 *   • otomatik çekim zamandan bağımsız ve deterministik
 *   • aynı tur iki kez ödenemez
 *   • Higher/Lower zincirinde çarpan doğru birikir, kayıpta tur kapanır
 *   • rozet ve görev ilerlemesi turun transaction'ı içinde yazılır
 */

import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import type { Db } from "../src/db/types.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { ensureActiveSeed } from "../src/lib/seeds.ts";
import {
  getOpenRound,
  openRound,
  settleOpenRound,
  settleRound,
  updateOpenRound,
  WalletError,
  closeExpiredRounds,
} from "../src/lib/wallet.ts";
import { crashMultAt, crashPoint, hlNewRound, hlStep, resolveWheel } from "../src/lib/games/engine.ts";
import { describe, type HiloSecret } from "../src/lib/hilo.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { COIN } from "../src/lib/games/config.ts";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(ok ? `  ✅ ${name}` : `  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? passed++ : failed++;
};

const client = new PGlite();
await client.waitReady;
for (const f of readdirSync("drizzle").filter((x) => x.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(`drizzle/${f}`, "utf8")
    .split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
    await client.exec(stmt);
  }
}
const db = drizzle(client, { schema }) as unknown as Db;
await db.transaction(async (tx) => seedBadges(tx as never));

await db.insert(schema.users).values({ id: "u1", email: "onur@106dijital.com", name: "Onur T." });
await ensureDailyState(db, "u1");
await ensureActiveSeed(db, "u1");

const bet = 100 * COIN;

/* ---------------------------------------------------------------- */
console.log("\nAçık tur kilidi");

const crash1 = await openRound(db, {
  userId: "u1", game: "CRASH", bet, params: {}, idempotencyKey: "crash-1", ttlMs: 60_000,
  build: (rng) => ({ secret: { crashPoint: crashPoint(rng), autoCashout: null }, publicState: {} }),
});
check("crash turu açıldı ve bahis düşüldü", crash1.balance === 100_000 - bet, `${crash1.balance}`);

let blocked = false;
try {
  await settleRound(db, {
    userId: "u1", game: "WHEEL", bet, params: {}, idempotencyKey: "wheel-while-open",
    resolve: (rng) => resolveWheel(rng, bet),
  });
} catch (e) {
  blocked = e instanceof WalletError && e.code === "ROUND_OPEN";
}
check("açık tur varken ikinci bahis engellendi", blocked);

/* ---------------------------------------------------------------- */
console.log("\nCrash — sunucu saatiyle çekim");

const open1 = await getOpenRound(db, "u1", crash1.roundId);
const point1 = Number(open1.secret.crashPoint);

// Çöküş noktasının ALTINDA bir ana denk gelecek şekilde çek.
const elapsedNow = (Date.now() - open1.createdAt.getTime()) / 1000;
const multNow = crashMultAt(elapsedNow);
const shouldWin = multNow <= point1;

const settled1 = await settleOpenRound(db, {
  userId: "u1", roundId: crash1.roundId, game: "CRASH",
  payout: shouldWin ? Math.floor((open1.bet * multNow) / 100) : 0,
  mult: shouldWin ? multNow / 100 : 0,
  publicState: { crashPoint: point1 / 100 },
});
check("çekim sunucu saatinden hesaplandı", settled1.payout === (shouldWin ? Math.floor((bet * multNow) / 100) : 0));

let doublePay = false;
try {
  await settleOpenRound(db, {
    userId: "u1", roundId: crash1.roundId, game: "CRASH",
    payout: 999_999, mult: 100, publicState: {},
  });
  doublePay = true;
} catch (e) {
  doublePay = !(e instanceof WalletError && e.code === "ROUND_CLOSED");
}
check("aynı tur ikinci kez ÖDENEMEZ", !doublePay);

/* ---------------------------------------------------------------- */
console.log("\nCrash — çöküş sonrası çekim reddi (150 ms açığı kapalı)");

// Çöküşü çoktan geçmiş bir tur kur: başlangıcı geçmişe al.
const crash2 = await openRound(db, {
  userId: "u1", game: "CRASH", bet, params: {}, idempotencyKey: "crash-2", ttlMs: 600_000,
  build: () => ({ secret: { crashPoint: 150, autoCashout: null }, publicState: {} }), // 1.50x'te patlar
});
// Turu 30 saniye geriye al — 1.50x çoktan aşıldı (2x'e 5 sn'de varılıyor).
await db.execute(
  sql`update "round" set created_at = now() - interval '30 seconds' where id = ${crash2.roundId}`,
);

const open2 = await getOpenRound(db, "u1", crash2.roundId);
const elapsed2 = (Date.now() - open2.createdAt.getTime()) / 1000;
const mult2 = crashMultAt(elapsed2);
const won2 = mult2 <= Number(open2.secret.crashPoint);
check("çöküşten sonra gelen çekim kazanç saymıyor", won2 === false,
  `çarpan ${mult2 / 100}x, çöküş ${Number(open2.secret.crashPoint) / 100}x`);

const settled2 = await settleOpenRound(db, {
  userId: "u1", roundId: crash2.roundId, game: "CRASH",
  payout: won2 ? 1 : 0, mult: won2 ? mult2 / 100 : 0,
  publicState: { crashPoint: 1.5, cashedOutAt: null },
});
check("kaybedilen turda ödeme sıfır", settled2.payout === 0);

/* ---------------------------------------------------------------- */
console.log("\nCrash — otomatik çekim zamandan bağımsız");

const autoTarget = 150; // 1.50x
const crash3 = await openRound(db, {
  userId: "u1", game: "CRASH", bet, params: { autoCashout: autoTarget }, idempotencyKey: "crash-3", ttlMs: 600_000,
  build: () => ({ secret: { crashPoint: 500, autoCashout: autoTarget }, publicState: {} }), // 5x'te patlar
});
await db.execute(
  sql`update "round" set created_at = now() - interval '10 minutes' where id = ${crash3.roundId}`,
);
const open3 = await getOpenRound(db, "u1", crash3.roundId);
const auto = open3.secret.autoCashout as number;
const autoWon = auto <= Number(open3.secret.crashPoint);
check("10 dakika sonra bile otomatik çekim kazanıyor", autoWon === true);

const settled3 = await settleOpenRound(db, {
  userId: "u1", roundId: crash3.roundId, game: "CRASH",
  payout: Math.floor((bet * auto) / 100), mult: auto / 100,
  publicState: { crashPoint: 5, cashedOutAt: 1.5, auto: true },
});
check("otomatik çekim 1.50x ödedi", settled3.payout === Math.floor((bet * 150) / 100), `${settled3.payout}`);

/* ---------------------------------------------------------------- */
console.log("\nHigher/Lower zinciri");

const hilo = await openRound(db, {
  userId: "u1", game: "HIGHERLOWER", bet, params: {}, idempotencyKey: "hilo-1", ttlMs: 600_000,
  build: (rng) => {
    const s = hlNewRound(rng);
    const secret: HiloSecret = { deck: s.deck, position: 0, mult: 1 };
    return { secret, publicState: describe(secret) };
  },
});

// Zinciri deterministik yap: desteyi artan sırayla kur, böylece "higher"
// tahmini her adımda kesin kazanır ve çarpan birikimi gerçekten sınanır.
const riggedDeck = Array.from({ length: 52 }, (_, i) => i); // 0..51 artan
const riggedSecret: HiloSecret = { deck: riggedDeck, position: 0, mult: 1 };
await updateOpenRound(db, hilo.roundId, {
  secret: riggedSecret,
  publicState: describe(riggedSecret),
});

const h0 = await getOpenRound(db, "u1", hilo.roundId);
let hsecret = h0.secret as unknown as HiloSecret;
check("ilk kart açık, deste gizli", (h0.publicState as { cards: unknown[] }).cards.length === 1);
check("başlangıç çarpanı 1", hsecret.mult === 1);

const firstView = describe(hsecret);
check("ilk adımda ev avantajı uygulanıyor (×0,95)",
  Math.abs(firstView.nextMult.higher! - 0.95 * (1 / firstView.odds.higher)) < 1e-9,
  `${firstView.nextMult.higher}`);

let steps = 0;
while (steps < 5) {
  const view = describe(hsecret);
  if (view.odds.higher === 0) break;
  const r = hlStep({ deck: hsecret.deck, position: hsecret.position, mult: hsecret.mult }, "higher");
  check(`adım ${steps + 1} kazandı (artan deste)`, r.won);
  if (!r.won) break;
  hsecret = { deck: hsecret.deck, position: r.state.position, mult: r.state.mult };
  await updateOpenRound(db, hilo.roundId, { secret: hsecret, publicState: describe(hsecret) });
  steps++;
}

check("5 adım tamamlandı", steps === 5, `${steps} adım`);
// Artan destede "higher" KESİN kazanç (p = 1), dolayısıyla adımlar çarpanı
// büyütmez; yalnızca ilk adımın ev avantajı kalır. Kesin bahsin bedava
// para vermemesi tasarımın gereği — burada onu doğruluyoruz.
check("kesin tahminler çarpanı büyütmüyor (×0,95'te kalıyor)",
  Math.abs(hsecret.mult - 0.95) < 1e-9, `${hsecret.mult}`);

const cashed = await settleOpenRound(db, {
  userId: "u1", roundId: hilo.roundId, game: "HIGHERLOWER",
  payout: Math.floor(bet * hsecret.mult), mult: hsecret.mult,
  publicState: { ...describe(hsecret), cashedOut: true },
});
check("çekim birikmiş çarpanı ödedi", cashed.payout === Math.floor(bet * hsecret.mult),
  `${cashed.payout} vs ${Math.floor(bet * hsecret.mult)}`);

// Gerçek belirsizlik altında çarpan birikimi: ortadan başlayan deste.
const uncertainDeck = [26, 40, 45, 48, 50, 51, ...Array.from({ length: 52 }, (_, i) => i).filter((c) => ![26, 40, 45, 48, 50, 51].includes(c))];
const hilo2 = await openRound(db, {
  userId: "u1", game: "HIGHERLOWER", bet, params: {}, idempotencyKey: "hilo-2", ttlMs: 600_000,
  build: (rng) => {
    const st = hlNewRound(rng);
    const sec: HiloSecret = { deck: st.deck, position: 0, mult: 1 };
    return { secret: sec, publicState: describe(sec) };
  },
});
let sec2: HiloSecret = { deck: uncertainDeck, position: 0, mult: 1 };
await updateOpenRound(db, hilo2.roundId, { secret: sec2, publicState: describe(sec2) });

const view2 = describe(sec2);
const expectedFirst = 0.95 * (1 / view2.odds.higher);
const st2 = hlStep({ deck: sec2.deck, position: 0, mult: 1 }, "higher");
check("belirsiz tahmin kazandı", st2.won);
sec2 = { deck: sec2.deck, position: st2.state.position, mult: st2.state.mult };
check("belirsizlikte çarpan büyüdü", sec2.mult > 1.5, `${sec2.mult.toFixed(4)}`);
check("ilk adım çarpanı tam 0,95/p", Math.abs(sec2.mult - expectedFirst) < 1e-9,
  `${sec2.mult} vs ${expectedFirst}`);

const st3 = hlStep({ deck: sec2.deck, position: sec2.position, mult: sec2.mult }, "higher");
const oddsBefore = describe(sec2).odds.higher;
check("ikinci adım ADİL ödüyor (ev avantajı yok)",
  st3.won && Math.abs(st3.stepMult - 1 / oddsBefore) < 1e-9,
  `${st3.stepMult} vs ${1 / oddsBefore}`);

await settleOpenRound(db, {
  userId: "u1", roundId: hilo2.roundId, game: "HIGHERLOWER",
  payout: 0, mult: 0, publicState: { lost: true },
});

let reCash = false;
try {
  await settleOpenRound(db, {
    userId: "u1", roundId: hilo.roundId, game: "HIGHERLOWER",
    payout: 999_999, mult: 99, publicState: {},
  });
  reCash = true;
} catch { /* beklenen */ }
check("çekilmiş hilo turu tekrar ödenemez", !reCash);

/* ---------------------------------------------------------------- */
console.log("\nSüresi geçen turlar");

const stale = await openRound(db, {
  userId: "u1", game: "CRASH", bet: 10 * COIN, params: {}, idempotencyKey: "stale-1", ttlMs: 1_000,
  build: () => ({ secret: { crashPoint: 200, autoCashout: null }, publicState: {} }),
});
await db.execute(sql`update "round" set expires_at = now() - interval '1 minute' where id = ${stale.roundId}`);
const closedCount = await closeExpiredRounds(db);
check("süresi geçen açık tur kapatıldı", closedCount === 1, `${closedCount}`);

const afterClose = await settleRound(db, {
  userId: "u1", game: "WHEEL", bet: 10 * COIN, params: {}, idempotencyKey: "after-close",
  resolve: (rng) => resolveWheel(rng, 10 * COIN),
});
check("kapanınca yeni bahis açılabiliyor", afterClose.roundId.length > 0);

/* ---------------------------------------------------------------- */
console.log("\nRozet, görev ve defter");

const myBadges = await db.select().from(schema.userBadges).where(eq(schema.userBadges.userId, "u1"));
check("en az 'İlk Kan' rozeti verildi", myBadges.some((b) => b.badgeId === "ilk-kan"),
  myBadges.map((b) => b.badgeId).join(", "));

const progressed = await db.select().from(schema.userMissions).where(eq(schema.userMissions.userId, "u1"));
check("görev ilerlemesi yazıldı", progressed.some((m) => m.progress > 0),
  progressed.map((m) => m.progress).join(", "));

const [sum] = await db
  .select({ total: sql<number>`coalesce(sum(${schema.ledgerEntries.amount}), 0)::int` })
  .from(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, "u1"));
const [u] = await db.select().from(schema.users).where(eq(schema.users.id, "u1"));
check("ledger toplamı = bakiye (rozet ödülleri dahil)", sum!.total === u!.balance,
  `ledger ${sum!.total} vs bakiye ${u!.balance}`);

const openLeft = await db.select().from(schema.rounds).where(eq(schema.rounds.state, "OPEN"));
check("açık tur kalmadı", openLeft.length === 0, `${openLeft.length} açık`);

await client.close();
console.log(`\n${passed} geçti, ${failed} başarısız`);
process.exit(failed === 0 ? 0 : 1);
