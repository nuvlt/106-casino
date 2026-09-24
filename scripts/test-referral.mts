/**
 * Davet sistemi testleri — gerçek Postgres motoru (PGlite ya da
 * TEST_DATABASE_URL ile gerçek sunucu).
 *
 *   • geçersiz kod / kendi kodu / eski hesap bağlanmaz
 *   • yeni hesap bağlanır, ikinci kez bağlanamaz
 *   • bonus iki tarafa BİR kez ödenir; eşzamanlı çağrı çift ödemez
 *   • bonus günlük sıfırlamanın ÜSTÜNE biner (ensureDailyState önce)
 *   • ledger toplamı bakiyeyle tutar
 *   • davet edenin bonus sınırı
 */

import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import {
  findInviterByCode,
  getOrCreateInviteCode,
  inviteSummary,
  isInviteCode,
  linkReferral,
  NEW_USER_WINDOW_MS,
  settleReferralRewards,
} from "../src/lib/referral.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { DAILY_GRANT, REFERRAL_BONUS, REFERRAL_MAX_REWARDED } from "../src/lib/games/config.ts";
import { makeTestDb } from "./test-db.mts";

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

const { db, close } = await makeTestDb();
await db.transaction(async (tx) => seedBadges(tx as never));

const balanceOf = async (id: string) =>
  (await db.select({ b: schema.users.balance }).from(schema.users).where(eq(schema.users.id, id)))[0]!.b;

const ledgerSum = async (id: string) =>
  Number(
    (
      await db
        .select({ s: sql<string>`coalesce(sum(${schema.ledgerEntries.amount}), 0)` })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.userId, id))
    )[0]!.s,
  );

const old = new Date(Date.now() - NEW_USER_WINDOW_MS - 60_000);
await db.insert(schema.users).values([
  { id: "inviter", email: "onur@106dijital.com", name: "Onur Altaş", createdAt: old },
  { id: "veteran", email: "eski@106dijital.com", name: "Eski Oyuncu", createdAt: old },
  { id: "newbie", email: "yeni@106dijital.com", name: "Ayşe Kaya" },
]);

/* ---------------------------------------------------------------- */
console.log("\nDavet kodu");

const code = await getOrCreateInviteCode(db, "inviter");
check("kod biçimi geçerli", isInviteCode(code), code);
check("ikinci çağrı aynı kodu döndürüyor", (await getOrCreateInviteCode(db, "inviter")) === code);
const [c1, c2] = await Promise.all([
  getOrCreateInviteCode(db, "veteran"),
  getOrCreateInviteCode(db, "veteran"),
]);
check("eşzamanlı üretim tek kod veriyor", c1 === c2);
check("koddan davet eden bulunuyor", (await findInviterByCode(db, code))?.id === "inviter");
check("bozuk kod reddediliyor", (await findInviterByCode(db, "DROP TABLE")) === null);
check("büyük harf/uzunluk kontrolü", !isInviteCode("ABCDEFGH") && !isInviteCode("abc"));

/* ---------------------------------------------------------------- */
console.log("\nİlişki kurma");

check("geçersiz kod → invalid", (await linkReferral(db, "newbie", "zzzzzzzz")) === "invalid");
check("kendi kodu → self", (await linkReferral(db, "inviter", code)) === "self");
check("eski hesap → not_new", (await linkReferral(db, "veteran", code)) === "not_new");
check("yeni hesap → linked", (await linkReferral(db, "newbie", code)) === "linked");
check("ikinci kez → already", (await linkReferral(db, "newbie", code)) === "already");

const rows = await db.select().from(schema.referrals);
check("tek ilişki kaydı", rows.length === 1, `${rows.length}`);
check("iki taraf da bonus hakkında", rows[0]?.inviterBonus === REFERRAL_BONUS && rows[0]?.inviteeBonus === REFERRAL_BONUS);

/* ---------------------------------------------------------------- */
console.log("\nÖdeme");

// /api/me sırası: önce günlük hak, sonra davet.
await ensureDailyState(db, "newbie");
const [a, b] = await Promise.all([
  settleReferralRewards(db, "newbie"),
  settleReferralRewards(db, "newbie"),
]);
const paid = [...a, ...b];
check("eşzamanlı iki çağrıdan yalnız biri ödüyor", paid.length === 1, `${paid.length} haber`);
check("haber 'welcome' ve davet edenin adı doğru", paid[0]?.kind === "welcome" && paid[0]?.name === "Onur Altaş");
check("yeni oyuncu 1.000 + bonus aldı", (await balanceOf("newbie")) === DAILY_GRANT + REFERRAL_BONUS,
  `${await balanceOf("newbie")}`);
check("tekrar çağrı bir şey ödemiyor", (await settleReferralRewards(db, "newbie")).length === 0);

// Davet eden henüz uygulamayı bugün açmadı: önce günlük hak, sonra bonus.
await ensureDailyState(db, "inviter");
const inviterNews = await settleReferralRewards(db, "inviter");
check("davet eden 'friend' haberi aldı", inviterNews.length === 1 && inviterNews[0]?.kind === "friend"
  && inviterNews[0]?.name === "Ayşe Kaya");
check("davet edenin bonusu sıfırlamanın üstüne bindi",
  (await balanceOf("inviter")) === DAILY_GRANT + REFERRAL_BONUS, `${await balanceOf("inviter")}`);

for (const id of ["newbie", "inviter"]) {
  check(`${id}: ledger toplamı = bakiye`, (await ledgerSum(id)) === (await balanceOf(id)),
    `ledger ${await ledgerSum(id)}, bakiye ${await balanceOf(id)}`);
}
const bonusRows = await db.select().from(schema.ledgerEntries)
  .where(eq(schema.ledgerEntries.type, "REFERRAL_BONUS"));
check("iki REFERRAL_BONUS defter kaydı", bonusRows.length === 2, `${bonusRows.length}`);

/* ---------------------------------------------------------------- */
console.log("\nKarne ve sınır");

let summary = await inviteSummary(db, "inviter");
check("karne: 1 davet, bonus kazanılmış", summary.invited === 1 && summary.earned === REFERRAL_BONUS,
  JSON.stringify(summary));

// Sınırı doldur: yeni hesaplar aç ve bağla.
for (let i = 0; i < REFERRAL_MAX_REWARDED + 1; i++) {
  const id = `f${i}`;
  await db.insert(schema.users).values({ id, email: `f${i}@106dijital.com`, name: `Arkadaş ${i}` });
  await linkReferral(db, id, code);
}
const capped = await db.select().from(schema.referrals).where(eq(schema.referrals.inviterId, "inviter"));
const withBonus = capped.filter((r) => r.inviterBonus > 0).length;
check(`davet edene en fazla ${REFERRAL_MAX_REWARDED} bonus`, withBonus === REFERRAL_MAX_REWARDED, `${withBonus}`);
check("sınır sonrası davet yine sayılıyor", capped.length === REFERRAL_MAX_REWARDED + 2, `${capped.length}`);
check("sınır sonrası davet edilen yine bonus alıyor", capped.every((r) => r.inviteeBonus === REFERRAL_BONUS));

const before = await balanceOf("inviter");
const bulk = await settleReferralRewards(db, "inviter");
const gained = (await balanceOf("inviter")) - before;
check("bekleyen davetler tek seferde ödendi", bulk.length === REFERRAL_MAX_REWARDED + 1, `${bulk.length}`);
check("yalnızca bonuslu olanlar para ekledi",
  gained === (REFERRAL_MAX_REWARDED - 1) * REFERRAL_BONUS, `${gained}`);
check("sınır sonrası haberin bonusu 0", bulk.some((n) => n.bonus === 0));
summary = await inviteSummary(db, "inviter");
check("karne: bonus hakkı bitti", summary.rewardsLeft === 0 && summary.invited === REFERRAL_MAX_REWARDED + 2,
  JSON.stringify(summary));
check("inviter: ledger toplamı = bakiye", (await ledgerSum("inviter")) === (await balanceOf("inviter")));

/* ---------------------------------------------------------------- */
console.log("\nHesap silinince");
await db.delete(schema.users).where(eq(schema.users.id, "newbie"));
check("ilişki kaydı da siliniyor (cascade)",
  (await db.select().from(schema.referrals).where(eq(schema.referrals.inviteeId, "newbie"))).length === 0);

await close();
console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
