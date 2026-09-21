/**
 * Çoklu top testleri.
 *
 * Asıl soru şu: "aynı anda 10 top" bir arayüz kolaylığı mı, yoksa
 * ekonomiye yeni bir delik mi? Her topun ayrı bir tur olarak kaydı
 * tutulmalı, toplam bahis tam olarak bahis × top olmalı ve defter
 * bakiyeyle tutmaya devam etmeli.
 */

import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import type { Db } from "../src/db/types.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { ensureActiveSeed } from "../src/lib/seeds.ts";
import { settleRound } from "../src/lib/wallet.ts";
import { resolvePlinko } from "../src/lib/games/engine.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { COIN } from "../src/lib/games/config.ts";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); failed++; }
}

const client = new PGlite();
await client.waitReady;
for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(`drizzle/${file}`, "utf8")
    .split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) {
    await client.exec(stmt);
  }
}
const db = drizzle(client, { schema }) as unknown as Db;
await db.transaction(async (tx) => seedBadges(tx as never));
await db.insert(schema.users).values({ id: "u1", email: "onur@106dijital.com", name: "Onur T." });
await ensureDailyState(db, "u1");
await ensureActiveSeed(db, "u1");

const balanceOf = async () => {
  const [u] = await db.select({ b: schema.users.balance }).from(schema.users).where(eq(schema.users.id, "u1"));
  return u!.b;
};

/** Ucun yaptığının aynısı: N topu sırayla ayrı tur olarak çöz. */
async function dropBalls(bet: number, balls: number, key: string) {
  const out = [];
  for (let i = 0; i < balls; i++) {
    out.push(await settleRound(db, {
      userId: "u1",
      game: "PLINKO",
      bet,
      params: { risk: "medium", rows: 12, ball: i },
      idempotencyKey: `${key}-${i}`,
      resolve: (rng) => resolvePlinko(rng, bet, "medium", 12),
    }));
  }
  return out;
}

const bet = 10 * COIN;

console.log("\nHer top ayrı bir tur");
const before = await balanceOf();
const drops = await dropBalls(bet, 5, "cok-top-1");
check("5 top = 5 tur", drops.length === 5, String(drops.length));
check("her turun kimliği farklı", new Set(drops.map((d) => d.roundId)).size === 5);

const rounds = await db.select().from(schema.rounds).where(eq(schema.rounds.userId, "u1"));
check("veritabanında 5 tur var", rounds.length === 5, String(rounds.length));

const nonces = rounds.map((r) => r.nonce).sort((a, b) => a - b);
check("her turun nonce'ı ayrı", new Set(nonces).size === 5, JSON.stringify(nonces));

console.log("\nPara");
const payout = drops.reduce((s, d) => s + d.payout, 0);
// İlk tur "İlk Adım" rozetini tetikler ve rozet ödülü de bakiyeye
// yazılır; beklenen tutara onu da katmazsak test kodu değil kendini
// yanlışlar.
const badgeReward = drops
  .flatMap((d) => d.newBadges)
  .reduce((s, b) => s + b.reward, 0);
const after = await balanceOf();
check("bakiye = önceki − (bahis×5) + ödeme + rozet ödülü",
  after === before - bet * 5 + payout + badgeReward,
  `${after} != ${before - bet * 5 + payout + badgeReward} (rozet ${badgeReward})`);

console.log("\nAynı anahtarla tekrar gönderim");
const again = await dropBalls(bet, 5, "cok-top-1");
check("tekrar atılan toplar aynı turlardır",
  again.every((r, i) => r.roundId === drops[i]!.roundId));
check("bakiye ikinci gönderimde değişmedi", (await balanceOf()) === after, String(await balanceOf()));

const roundsAfter = await db.select().from(schema.rounds).where(eq(schema.rounds.userId, "u1"));
check("yeni tur açılmadı", roundsAfter.length === 5, String(roundsAfter.length));

console.log("\nBahis top başınadır");
const b2 = await balanceOf();
const three = await dropBalls(bet, 3, "cok-top-2");
const staked = bet * 3;
const paid = three.reduce((s, d) => s + d.payout, 0);
check("toplam bahis = bahis × top", (await balanceOf()) === b2 - staked + paid,
  `${await balanceOf()} != ${b2 - staked + paid}`);

console.log("\nDefter");
const [sum] = await db
  .select({ total: sql<number>`coalesce(sum(${schema.ledgerEntries.amount}), 0)::int` })
  .from(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, "u1"));
check("ledger toplamı = bakiye", sum!.total === (await balanceOf()),
  `${sum!.total} != ${await balanceOf()}`);

const bets = await db.select().from(schema.ledgerEntries)
  .where(eq(schema.ledgerEntries.type, "BET"));
check("her top için bir BET kaydı", bets.length === 8, String(bets.length));

console.log(`\n${passed} geçti, ${failed} başarısız\n`);
process.exit(failed === 0 ? 0 : 1);
