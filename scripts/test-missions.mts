/**
 * Görev ödülü alma testleri — gerçek Postgres motoruna (PGlite) karşı.
 *
 * Kritik soru: bir ödül iki kez alınabilir mi? Ödül tutarı istemciden
 * etkilenebilir mi? Başkasının görevini alabilir miyim?
 */

import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import type { Db } from "../src/db/types.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { claimMission, MissionError } from "../src/lib/mission-claim.ts";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); failed++; }
}

const client = new PGlite();
await client.waitReady;
for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(`drizzle/${file}`, "utf8")
    .split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
    await client.exec(stmt);
  }
}
const db = drizzle(client, { schema }) as unknown as Db;
await db.transaction(async (tx) => seedBadges(tx as never));

await db.insert(schema.users).values([
  { id: "u1", email: "onur@106dijital.com", name: "Onur T." },
  { id: "u2", email: "baska@106dijital.com", name: "Başka K." },
]);

await ensureDailyState(db, "u1");
await ensureDailyState(db, "u2");

/** Kullanıcının ilk görev satırı. */
async function firstMissionOf(userId: string) {
  const [um] = await db
    .select({ id: schema.userMissions.id, missionId: schema.userMissions.missionId })
    .from(schema.userMissions)
    .where(eq(schema.userMissions.userId, userId))
    .limit(1);
  return um!;
}

const um1 = await firstMissionOf("u1");
const [def] = await db
  .select({ reward: schema.missions.reward })
  .from(schema.missions)
  .where(eq(schema.missions.id, um1.missionId))
  .limit(1);
const reward = def!.reward;

const balanceOf = async (id: string) => {
  const [u] = await db.select({ b: schema.users.balance }).from(schema.users).where(eq(schema.users.id, id));
  return u!.b;
};

console.log("\nTamamlanmamış görev");
try {
  await claimMission(db, "u1", um1.missionId);
  check("tamamlanmamış görev reddedilir", false, "hata fırlatmadı");
} catch (e) {
  check("tamamlanmamış görev reddedilir", e instanceof MissionError && e.code === "NOT_COMPLETED",
    e instanceof MissionError ? e.code : String(e));
}

// Görevi tamamlanmış say.
await db.update(schema.userMissions)
  .set({ completedAt: new Date(), progress: 999 })
  .where(eq(schema.userMissions.id, um1.id));

console.log("\nBaşkasının tamamlaması");
// Aynı gün herkes aynı görev TANIMLARINI paylaşır. u1 görevi bitirdi,
// u2 bitirmedi: u2 aynı görev kimliğiyle istese bile kendi satırına
// bakılır ve eli boş döner.
const u2Before = await balanceOf("u2");
try {
  await claimMission(db, "u2", um1.missionId);
  check("başkasının tamamlaması işe yaramaz", false, "hata fırlatmadı — ÖDÜL SIZDI");
} catch (e) {
  check("başkasının tamamlaması işe yaramaz",
    e instanceof MissionError && e.code === "NOT_COMPLETED",
    e instanceof MissionError ? e.code : String(e));
}
check("u2 bakiyesi değişmedi", (await balanceOf("u2")) === u2Before, String(await balanceOf("u2")));

console.log("\nOlmayan görev");
try {
  await claimMission(db, "u1", "yok-boyle-bir-gorev");
  check("olmayan görev reddedilir", false, "hata fırlatmadı");
} catch (e) {
  check("olmayan görev reddedilir", e instanceof MissionError && e.code === "NOT_FOUND",
    e instanceof MissionError ? e.code : String(e));
}

console.log("\nİlk alım");
const before = await balanceOf("u1");
const res = await claimMission(db, "u1", um1.missionId);
check("ödül tutarı görev tanımından gelir", res.reward === reward, `${res.reward} != ${reward}`);
check("bakiye tam ödül kadar arttı", (await balanceOf("u1")) === before + reward);
check("dönen bakiye gerçek bakiyeyle aynı", res.balance === (await balanceOf("u1")));

const [entry] = await db.select().from(schema.ledgerEntries)
  .where(and(eq(schema.ledgerEntries.userId, "u1"), eq(schema.ledgerEntries.type, "MISSION_REWARD")));
check("ledger'a MISSION_REWARD yazıldı", !!entry);
check("ledger tutarı ödülle aynı", entry?.amount === reward);
check("ledger balanceAfter doğru", entry?.balanceAfter === (await balanceOf("u1")));

console.log("\nİkinci alım (çift ödeme koruması)");
const afterFirst = await balanceOf("u1");
try {
  await claimMission(db, "u1", um1.missionId);
  check("ikinci alım reddedilir", false, "hata fırlatmadı — ÇİFT ÖDEME");
} catch (e) {
  check("ikinci alım reddedilir", e instanceof MissionError && e.code === "ALREADY_CLAIMED",
    e instanceof MissionError ? e.code : String(e));
}
check("bakiye ikinci denemede artmadı", (await balanceOf("u1")) === afterFirst);

console.log("\nEşzamanlı iki alım");
// İkinci bir görevi tamamlanmış yapıp aynı anda iki kez al.
const all = await db
  .select({ id: schema.userMissions.id, missionId: schema.userMissions.missionId })
  .from(schema.userMissions).where(eq(schema.userMissions.userId, "u1"));
const second = all.find((m) => m.id !== um1.id)!;
await db.update(schema.userMissions)
  .set({ completedAt: new Date(), progress: 999 })
  .where(eq(schema.userMissions.id, second.id));

const balBefore = await balanceOf("u1");
const results = await Promise.allSettled([
  claimMission(db, "u1", second.missionId),
  claimMission(db, "u1", second.missionId),
]);
const ok = results.filter((r) => r.status === "fulfilled").length;
check("eşzamanlı iki istekten yalnızca biri başarılı", ok === 1, `${ok} istek başarılı oldu`);

const [secondDef] = await db.select({ reward: schema.missions.reward })
  .from(schema.missions)
  .innerJoin(schema.userMissions, eq(schema.userMissions.missionId, schema.missions.id))
  .where(eq(schema.userMissions.id, second.id));
check("bakiye yalnızca bir ödül kadar arttı",
  (await balanceOf("u1")) === balBefore + secondDef!.reward,
  `${await balanceOf("u1")} != ${balBefore + secondDef!.reward}`);

console.log("\nDefter tutarlılığı");
const [sum] = await db.select({ total: sql<number>`coalesce(sum(${schema.ledgerEntries.amount}), 0)::int` })
  .from(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, "u1"));
check("ledger toplamı = bakiye", sum!.total === (await balanceOf("u1")),
  `${sum!.total} != ${await balanceOf("u1")}`);

console.log(`\n${passed} geçti, ${failed} başarısız\n`);
process.exit(failed === 0 ? 0 : 1);
