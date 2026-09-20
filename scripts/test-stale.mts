/** Yarım kalmış Crash turlarının doğru sonuçlandığını doğrular. */
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { ensureActiveSeed } from "../src/lib/seeds.ts";
import { openRound } from "../src/lib/wallet.ts";
import { resolveDecidedCrashRounds } from "../src/lib/crash.ts";
import { COIN } from "../src/lib/games/config.ts";

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(ok ? `  ✅ ${n}` : `  ❌ ${n}${d?" — "+d:""}`); ok ? pass++ : fail++; };

const client = new PGlite();
await client.waitReady;
for (const f of readdirSync("drizzle").filter(x => x.endsWith(".sql")).sort())
  for (const st of readFileSync(`drizzle/${f}`, "utf8").split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean))
    await client.exec(st);
const db = drizzle(client, { schema });
await db.transaction(async (tx) => seedBadges(tx));
await db.insert(schema.users).values({ id: "u1", email: "o@106dijital.com", name: "Onur" });
await ensureDailyState(db, "u1");
await ensureActiveSeed(db, "u1");

const bet = 100 * COIN;

// 1) Çöküşü geçmiş, otomatik çekimi olmayan tur → kayıp olarak kapanmalı
const r1 = await openRound(db, {
  userId: "u1", game: "CRASH", bet, params: {}, idempotencyKey: "stale-a", ttlMs: 600000,
  build: () => ({ secret: { crashPoint: 150, autoCashout: null }, publicState: {} }),
});
await db.execute(sql`update "round" set created_at = now() - interval '60 seconds' where id = ${r1.roundId}`);
const n1 = await resolveDecidedCrashRounds(db, "u1");
const row1 = (await db.select().from(schema.rounds).where(eq(schema.rounds.id, r1.roundId)))[0];
check("çöküşü geçmiş tur kapatıldı", n1 === 1 && row1.state === "SETTLED");
check("kaybedilen turda ödeme kalemi yok", row1.payout === 0);
const payouts1 = await db.select().from(schema.ledgerEntries)
  .where(eq(schema.ledgerEntries.roundId, r1.roundId));
check("deftere PAYOUT yazılmadı",
  payouts1.every((l) => l.type !== "PAYOUT"),
  payouts1.map((l) => l.type).join(","));

// 2) Hedefine ulaşmış otomatik çekim → KAZANÇ olarak ödenmeli
const r2 = await openRound(db, {
  userId: "u1", game: "CRASH", bet, params: {}, idempotencyKey: "stale-b", ttlMs: 600000,
  build: () => ({ secret: { crashPoint: 500, autoCashout: 200 }, publicState: {} }),
});
await db.execute(sql`update "round" set created_at = now() - interval '60 seconds' where id = ${r2.roundId}`);
const before2 = (await db.select().from(schema.users).where(eq(schema.users.id,"u1")))[0].balance;
const n2 = await resolveDecidedCrashRounds(db, "u1");
const after2 = (await db.select().from(schema.users).where(eq(schema.users.id,"u1")))[0].balance;
check("hedefe ulaşmış otomatik çekim kapatıldı", n2 === 1);
check("sekme kapansa bile otomatik çekim ÖDENDİ", after2 === before2 + bet * 2, `${before2} → ${after2}`);

// 3) Hâlâ uçan tura dokunulmamalı
const r3 = await openRound(db, {
  userId: "u1", game: "CRASH", bet, params: {}, idempotencyKey: "stale-c", ttlMs: 600000,
  build: () => ({ secret: { crashPoint: 10000, autoCashout: null }, publicState: {} }),
});
const n3 = await resolveDecidedCrashRounds(db, "u1");
const row3 = (await db.select().from(schema.rounds).where(eq(schema.rounds.id, r3.roundId)))[0];
check("devam eden tura dokunulmadı", n3 === 0 && row3.state === "OPEN");

// 4) Defter hâlâ mutabık
const [sum] = await db.select({ t: sql`coalesce(sum(${schema.ledgerEntries.amount}),0)::int` }).from(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId,"u1"));
const [u] = await db.select().from(schema.users).where(eq(schema.users.id,"u1"));
check("ledger toplamı = bakiye", Number(sum.t) === u.balance, `${sum.t} vs ${u.balance}`);

await client.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail === 0 ? 0 : 1);
