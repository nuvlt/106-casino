/**
 * Crash "tur yaşıyor mu?" ucunun doğruluğu.
 *
 * Asıl sınanan hata: istemci çöküşü bilmediği için çarpanı sonsuza kadar
 * büyütüyordu; oyuncu ekranda 4x görürken tur 1.02x'te patlamış oluyordu.
 * Artık istemci düzenli olarak soruyor. Bu testler, sorunun cevabının
 * DOĞRU anda değiştiğini ve geleceği SIZDIRMADIĞINI doğrular.
 */

import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import type { Db } from "../src/db/types.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { ensureActiveSeed } from "../src/lib/seeds.ts";
import { openRound } from "../src/lib/wallet.ts";
import { pollCrashRound } from "../src/lib/crash.ts";
import { COIN } from "../src/lib/games/config.ts";
import { makeTestDb } from "./test-db.mts";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  console.log(ok ? `  ✅ ${n}` : `  ❌ ${n}${d ? " — " + d : ""}`);
  ok ? pass++ : fail++;
};

const { db, close } = await makeTestDb();
await db.transaction(async (tx) => seedBadges(tx as never));
await db.insert(schema.users).values({ id: "u1", email: "o@106dijital.com", name: "Onur" });
await ensureDailyState(db, "u1");
await ensureActiveSeed(db, "u1");

const bet = 100 * COIN;
const open = async (key: string, crashPoint: number, auto: number | null) =>
  openRound(db, {
    userId: "u1", game: "CRASH", bet, params: {}, idempotencyKey: key, ttlMs: 600_000,
    build: () => ({ secret: { crashPoint, autoCashout: auto }, publicState: {} }),
  });
const age = (id: string, seconds: number) =>
  db.execute(sql`update "round" set created_at = now() - (${seconds} || ' seconds')::interval where id = ${id}`);

/** Aynı anda tek tur kuralı var; senaryolar arasında turu kapat. */
const closeRound = async (id: string) => {
  await age(id, 600);
  await pollCrashRound(db, "u1", id);
};

/* ---------------------------------------------------------------- */
console.log("\nUçuş sürerken");

const r1 = await open("poll-a", 10_000, null); // 100x'te patlar, daha çok var
const s1 = await pollCrashRound(db, "u1", r1.roundId);
check("tur yaşıyorsa alive=true", s1.alive === true);
check("yaşayan turda çöküş noktası SIZDIRILMIYOR",
  !JSON.stringify(s1).includes("crashPoint"), JSON.stringify(s1).slice(0, 120));

await closeRound(r1.roundId);

/* ---------------------------------------------------------------- */
console.log("\nÇöküş geçildiğinde");

// 1.50x'te patlıyor; 30 saniye geçmiş — 2x'e 5 saniyede varılıyor.
const r2 = await open("poll-b", 150, null);
await age(r2.roundId, 30);
const s2 = await pollCrashRound(db, "u1", r2.roundId);
check("patlamış tur alive=false", s2.alive === false);
check("gerçek çöküş noktası bildiriliyor", s2.ended?.crashPoint === 1.5, String(s2.ended?.crashPoint));
check("çekilmemiş turda ödeme yok", s2.ended?.payout === 0);
check("cashedOutAt null", s2.ended?.cashedOutAt === null);

const again = await pollCrashRound(db, "u1", r2.roundId);
check("tekrar sorulduğunda aynı sonuç (çift ödeme yok)",
  again.alive === false && again.ended?.payout === 0);

/* ---------------------------------------------------------------- */
console.log("\nOtomatik çekim hedefe ulaştığında");

const before = (await db.select().from(schema.users).where(eq(schema.users.id, "u1")))[0]!.balance;
const r3 = await open("poll-c", 500, 200); // 5x'te patlar, 2x'te otomatik çekim
await age(r3.roundId, 30);
const s3 = await pollCrashRound(db, "u1", r3.roundId);
const after = (await db.select().from(schema.users).where(eq(schema.users.id, "u1")))[0]!.balance;
check("hedefe ulaşan otomatik çekim kapandı", s3.alive === false);
check("2.00x ödendi", s3.ended?.payout === bet * 2, String(s3.ended?.payout));
// Bahis tur açılırken düşüldü, sonra 2x ödendi: net +bet.
check("bakiyeye net +1 bahis yansıdı", after === before + bet, `${before} → ${after}`);

/* ---------------------------------------------------------------- */
console.log("\nKarar anı hassasiyeti");

// 2x'e tam 5 saniyede varılır. 4.5 saniyede henüz patlamamış olmalı.
const r4 = await open("poll-d", 200, null);
await age(r4.roundId, 4.5);
const s4 = await pollCrashRound(db, "u1", r4.roundId);
check("çöküşten hemen ÖNCE tur yaşıyor", s4.alive === true);

await age(r4.roundId, 5.6);
const s5 = await pollCrashRound(db, "u1", r4.roundId);
check("çöküşten hemen SONRA tur bitti", s5.alive === false);

/* ---------------------------------------------------------------- */
const [sum] = await db
  .select({ t: sql<number>`coalesce(sum(${schema.ledgerEntries.amount}),0)::int` })
  .from(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, "u1"));
const [u] = await db.select().from(schema.users).where(eq(schema.users.id, "u1"));
check("ledger toplamı = bakiye", Number(sum!.t) === u!.balance, `${sum!.t} vs ${u!.balance}`);

await close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail === 0 ? 0 : 1);
