/**
 * Yeni dört oyunun testleri: Rulet, Klasik 777, Kapalıçarşı, Blackjack.
 *
 * Motor kuralları (saf fonksiyonlar) + gerçek Postgres motoruna karşı
 * cüzdan akışları: bahis düşümü, ödeme, defter mutabakatı, blackjack'te
 * ikiye katlamanın tek transaction'da ek bahis düşmesi, yetersiz
 * bakiyede hiçbir şeyin değişmemesi ve eskimiş hamlenin reddi.
 */

import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { ensureDailyState } from "../src/lib/economy.ts";
import { ensureActiveSeed } from "../src/lib/seeds.ts";
import {
  getOpenRound,
  openRound,
  raiseOpenRoundBet,
  settleOpenRound,
  settleRound,
  updateOpenRoundAtStep,
  WalletError,
} from "../src/lib/wallet.ts";
import {
  bjAct,
  bjSettle,
  bjStart,
  bjTotal,
  classicClassOf,
  evalBazaar,
  resolveBazaarSlot,
  resolveBlackjack,
  resolveClassicSlot,
  resolveRoulette,
  type BazaarSpin,
  type BjState,
} from "../src/lib/games/engine.ts";
import { generateServerSeed, rngFor } from "../src/lib/games/rng.ts";
import { describeBj, type BjSecret } from "../src/lib/blackjack.ts";
import { seedBadges } from "../src/lib/badges.ts";
import { rouletteParams } from "../src/lib/validation.ts";
import { BAZAAR_FS_CAP, CLASSIC_TABLE, COIN, DAILY_GRANT } from "../src/lib/games/config.ts";
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

const seed = generateServerSeed();
const rng = (n: number) => rngFor(seed, "yeni-oyunlar", n);
/** Kart: rank(0=2 … 8=10, 12=A)·4 + renk. */
const C = (rank: number, suit = 0) => rank * 4 + suit;
const A = 12, K = 11, TEN = 8, SIX = 4, SEVEN = 5, FIVE = 3, NINE = 7, TWO = 0;

/* ================================================================ */
console.log("\nRulet — kurallar");
{
  const r0 = resolveRoulette(rng(1), [{ kind: "red", amount: 100 }]);
  const pocket = r0.detail.pocket as number;
  check("cep 0..37 aralığında", pocket >= 0 && pocket <= 37, String(pocket));

  // Belirli cepler için doğrudan kural: 00'da dış bahisler kaybeder.
  let found00 = false;
  for (let n = 0; n < 5000 && !found00; n++) {
    const out = resolveRoulette(rng(n), [
      { kind: "straight", n: 37, amount: 100 },
      { kind: "red", amount: 100 },
      { kind: "even", amount: 100 },
    ]);
    if (out.detail.pocket === 37) {
      found00 = true;
      check("00: yalnız 00 tek sayı bahsi kazanır (36×)", out.payout === 3600, String(out.payout));
      check("00: çift/kırmızı kaybeder", (out.detail.winners as number[]).join() === "0");
    }
  }
  check("5000 çevirmede 00 geldi", found00);

  const parsed = rouletteParams.safeParse({
    idempotencyKey: "abcdefgh",
    bets: [{ kind: "straight", n: 5, amount: 10 * COIN }, { kind: "dozen", n: 1, amount: 40 * COIN }],
  });
  check("şema: toplam `bet` olarak eklenir", parsed.success && parsed.data.bet === 50 * COIN);
  check("şema: aynı alana iki bahis reddedilir", !rouletteParams.safeParse({
    idempotencyKey: "abcdefgh",
    bets: [{ kind: "red", amount: 10 * COIN }, { kind: "red", amount: 10 * COIN }],
  }).success);
  check("şema: toplam 500 coin'i aşamaz", !rouletteParams.safeParse({
    idempotencyKey: "abcdefgh",
    bets: [{ kind: "red", amount: 300 * COIN }, { kind: "black", amount: 300 * COIN }],
  }).success);
  check("şema: alan başına en az 10 coin", !rouletteParams.safeParse({
    idempotencyKey: "abcdefgh", bets: [{ kind: "red", amount: 5 * COIN }],
  }).success);
  check("şema: 38. cep yok", !rouletteParams.safeParse({
    idempotencyKey: "abcdefgh", bets: [{ kind: "straight", n: 38, amount: 10 * COIN }],
  }).success);
}

/* ================================================================ */
console.log("\nKlasik 777 — görüntü sonuçla tutarlı");
{
  let bad = 0;
  const seen = new Set<string>();
  for (let n = 0; n < 5000; n++) {
    const o = resolveClassicSlot(rng(n), 100);
    const d = o.detail as { cls: string; line: string[]; reels: string[][] };
    if (classicClassOf(d.line as never) !== d.cls) bad++;
    if (d.reels.map((r) => r[1]).join() !== d.line.join()) bad++;
    const row = CLASSIC_TABLE.find((t) => t.cls === d.cls)!;
    if (o.payout !== row.mult) bad++;
    seen.add(d.cls);
  }
  check("5000 çevirmenin hepsinde çizgi = ödenen sınıf", bad === 0, `${bad} tutarsızlık`);
  check("en az 6 farklı sonuç sınıfı görüldü", seen.size >= 6, [...seen].join(","));
}

/* ================================================================ */
console.log("\nKapalıçarşı — ödeme ayrıntıyla tutarlı");
{
  let bad = 0;
  let triggered = 0;
  for (let n = 0; n < 4000; n++) {
    const o = resolveBazaarSlot(rng(n), 10_000);
    const d = o.detail as { base: BazaarSpin; free: BazaarSpin[]; capped: boolean };
    const re = evalBazaar(d.base.grid);
    if (re.base !== d.base.win) bad++;
    for (const f of d.free) if (evalBazaar(f.grid).base * 2 !== f.win) bad++;
    const total = d.base.win + d.free.reduce((a, f) => a + f.win, 0);
    if (!d.capped && o.payout !== Math.floor((10_000 * total) / 100)) bad++;
    if (d.free.length > 0) {
      triggered++;
      if (d.base.scatters < 3) bad++;
      if (d.free.length > BAZAAR_FS_CAP) bad++;
    }
    if (d.base.lines.some((l) => l.pay < 150)) bad++;
  }
  check("4000 çevirmenin hepsinde ödeme = çizgiler + anahtar + bedava dönüş", bad === 0, `${bad} tutarsızlık`);
  check("bedava dönüş tetiklendi (≈1/154)", triggered > 5, `${triggered} kez`);
}

/* ================================================================ */
console.log("\nBlackjack — kurallar");
{
  const hand = (player: number[], dealer: number[], shoe: number[] = []): BjState => ({
    shoe, pos: 0, player, dealer, doubled: false, actions: [], phase: "player",
  });

  check("A+6 yumuşak 17", bjTotal([C(A), C(SIX)]).total === 17 && bjTotal([C(A), C(SIX)]).soft);
  check("A+6+K sert 17", bjTotal([C(A), C(SIX), C(K)]).total === 17 && !bjTotal([C(A), C(SIX), C(K)]).soft);
  check("A+A+9 = 21", bjTotal([C(A), C(A), C(NINE)]).total === 21);

  // Krupiye yumuşak 17'de çeker (H17): A+6 → 2 çekip 19 olur.
  const h17 = bjAct(hand([C(TEN), C(SEVEN)], [C(A), C(SIX)], [C(TWO)]), "stand");
  check("krupiye yumuşak 17'de çeker", h17.dealer.length === 3 && bjTotal(h17.dealer).total === 19);
  const s17 = bjAct(hand([C(TEN), C(SEVEN)], [C(TEN), C(SEVEN)], [C(TWO)]), "stand");
  check("krupiye sert 17'de durur", s17.dealer.length === 2);

  const bust = bjAct(hand([C(TEN), C(SIX)], [C(TEN), C(SIX)], [C(K), C(FIVE)]), "hit");
  check("oyuncu batınca krupiye kart çekmez", bust.phase === "done" && bust.dealer.length === 2);
  check("batan el kaybeder", bjSettle(bust, 1000).payout === 0);

  const dbl = bjAct(hand([C(FIVE), C(SIX)], [C(TEN), C(SEVEN)], [C(TEN)]), "double");
  const ds = bjSettle(dbl, 1000);
  check("ikiye katlama: tek kart, 21 kazanır, 4× öder", dbl.player.length === 3 && ds.stake === 2000 && ds.payout === 4000,
    JSON.stringify(ds));
  let threw = false;
  try {
    bjAct(bjAct(hand([C(TWO), C(TWO)], [C(TEN), C(SEVEN)], [C(TWO), C(TWO)]), "hit"), "double");
  } catch {
    threw = true;
  }
  check("üçüncü kartta ikiye katlama reddedilir", threw);

  // Doğal blackjack: 6:5 → 100 coin'e 220 geri.
  let natural: ReturnType<typeof bjSettle> | null = null;
  let dealerBJ: BjState | null = null;
  for (let n = 0; n < 20000 && (!natural || !dealerBJ); n++) {
    const s = bjStart(rng(n));
    const r = bjSettle(s, 100 * COIN);
    if (r.result === "blackjack" && !natural) natural = r;
    if (r.result === "dealer_blackjack" && !dealerBJ) dealerBJ = s;
  }
  check("blackjack 6:5 öder (100 → 220)", natural?.payout === 220 * COIN, JSON.stringify(natural));
  check("krupiye blackjack'inde el hemen biter (peek)", dealerBJ?.phase === "done" && dealerBJ.actions.length === 0);

  // Kapalı kart el bitene kadar görünmez.
  let hidden = true;
  for (let n = 0; n < 200; n++) {
    const s = bjStart(rng(n));
    if (s.phase !== "player") continue;
    const view = describeBj({ ...s, bet: 100 });
    if (view.dealer[1] !== null || view.dealer.length !== 2 || "shoe" in view) hidden = false;
    if (view.dealerTotal !== bjTotal([s.dealer[0]!]).total) hidden = false;
  }
  check("el sürerken kapalı kart ve deste istemciye gitmez", hidden);
}

/* ================================================================ */
console.log("\nCüzdan akışları (Postgres)");
const { db, close } = await makeTestDb();
await db.transaction(async (tx) => seedBadges(tx as never));
await db.insert(schema.users).values({ id: "u1", email: "onur@106dijital.com", name: "Onur" });
await ensureDailyState(db, "u1");
await ensureActiveSeed(db, "u1");

const balanceOf = async () =>
  (await db.select({ b: schema.users.balance }).from(schema.users).where(eq(schema.users.id, "u1")))[0]!.b;
const ledgerOk = async () => {
  const [{ s }] = await db
    .select({ s: sql<string>`coalesce(sum(${schema.ledgerEntries.amount}), 0)` })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.userId, "u1"));
  return Number(s) === (await balanceOf());
};

{
  const bets = [{ kind: "red" as const, amount: 30 * COIN }, { kind: "straight" as const, n: 7, amount: 20 * COIN }];
  const before = await balanceOf();
  const r = await settleRound(db, {
    userId: "u1", game: "ROULETTE", bet: 50 * COIN, params: { bets }, idempotencyKey: "rl-1",
    resolve: (g) => resolveRoulette(g, bets),
  });
  const badge = r.newBadges.reduce((a, b) => a + b.reward, 0);
  check("rulet: bakiye = önce − toplam bahis + ödeme", r.balance === before - 50 * COIN + r.payout + badge);
  const again = await settleRound(db, {
    userId: "u1", game: "ROULETTE", bet: 50 * COIN, params: { bets }, idempotencyKey: "rl-1",
    resolve: (g) => resolveRoulette(g, bets),
  });
  check("rulet: aynı anahtar ikinci tur açmaz", again.roundId === r.roundId);

  const s1 = await settleRound(db, {
    userId: "u1", game: "SLOT_CLASSIC", bet: 20 * COIN, params: {}, idempotencyKey: "cs-1",
    resolve: (g) => resolveClassicSlot(g, 20 * COIN),
  });
  const s2 = await settleRound(db, {
    userId: "u1", game: "SLOT_BAZAAR", bet: 20 * COIN, params: {}, idempotencyKey: "bz-1",
    resolve: (g) => resolveBazaarSlot(g, 20 * COIN),
  });
  check("slotlar oynanıyor ve kayıt düşüyor", !!s1.roundId && !!s2.roundId);
  check("defter = bakiye (rulet + slotlar)", await ledgerOk());
}

/** Blackjack'i uçların yaptığı gibi oynatan küçük yardımcılar. */
async function bjOpen(key: string, bet: number) {
  return openRound(db, {
    userId: "u1", game: "BLACKJACK", bet, params: {}, idempotencyKey: key, ttlMs: 600_000,
    build: (g) => {
      const secret: BjSecret = { ...bjStart(g), bet };
      return { secret, publicState: describeBj(secret) };
    },
  });
}
async function bjFinish(roundId: string, secret: BjSecret) {
  const r = bjSettle(secret, secret.bet);
  return settleOpenRound(db, {
    userId: "u1", roundId, game: "BLACKJACK", payout: r.payout,
    mult: r.stake > 0 ? r.payout / r.stake : 0, publicState: describeBj(secret),
  });
}

{
  // Oynanabilir (doğal blackjack'siz) bir el bulana kadar aç.
  let handle = await bjOpen("bj-0", 40 * COIN);
  let k = 1;
  while ((handle.publicState as { phase: string }).phase === "done") {
    const open = await getOpenRound(db, "u1", handle.roundId);
    await bjFinish(open.id, open.secret as unknown as BjSecret);
    handle = await bjOpen(`bj-${k++}`, 40 * COIN);
  }
  const open = await getOpenRound(db, "u1", handle.roundId);
  const secret = open.secret as unknown as BjSecret;

  // Eskimiş hamle: adım 1 bekleniyor gibi yazmaya çalış → reddedilmeli.
  const stale = await updateOpenRoundAtStep(db, {
    userId: "u1", roundId: open.id, step: 1, secret: { ...secret }, publicState: {},
  });
  check("eskimiş hamle (yanlış adım) yazılmaz", stale === false);

  // İkiye katla: ek bahis tek transaction'da.
  const before = await balanceOf();
  const next: BjSecret = { ...bjAct(secret, "double"), bet: secret.bet };
  const { balance } = await raiseOpenRoundBet(db, {
    userId: "u1", roundId: open.id, extra: secret.bet, expectedBet: secret.bet, step: 0,
    secret: next, publicState: describeBj(next),
  });
  check("katlama: bakiye ek bahis kadar düştü", balance === before - secret.bet);
  const [row] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, open.id));
  check("katlama: turun bahsi iki katına çıktı", row!.bet === secret.bet * 2);

  let doubleTwice = false;
  try {
    await raiseOpenRoundBet(db, {
      userId: "u1", roundId: open.id, extra: secret.bet, expectedBet: secret.bet, step: 0,
      secret: next, publicState: {},
    });
  } catch (e) {
    doubleTwice = e instanceof WalletError;
  }
  check("aynı el ikinci kez katlanamaz", doubleTwice && (await balanceOf()) === balance);

  const settled = await bjFinish(open.id, next);
  const r = bjSettle(next, secret.bet);
  check("katlanan el doğru ödendi", settled.payout === r.payout && settled.bet === secret.bet * 2,
    `${settled.payout} / ${r.payout}`);

  // Kayıttan yeniden oynatma: aynı tohum + aynı hamleler → aynı ödeme.
  const [pair] = await db.select().from(schema.seedPairs).where(eq(schema.seedPairs.id, row!.seedPairId));
  const replay = resolveBlackjack(rngFor(pair!.serverSeed, pair!.clientSeed, row!.nonce), secret.bet, next.actions);
  check("el tohumdan yeniden oynatılınca aynı sonuç", replay.payout === settled.payout);
  check("defter = bakiye (blackjack + katlama)", await ledgerOk());
}

{
  // Yetersiz bakiyede katlama: hiçbir şey değişmemeli.
  await db.update(schema.users).set({ balance: 15 * COIN }).where(eq(schema.users.id, "u1"));
  // Bakiyeyi elle 15 coin'e çektik; defter mutabık kalsın diye farkı tek kalemde yaz.
  const [{ s }] = await db
    .select({ s: sql<string>`coalesce(sum(${schema.ledgerEntries.amount}), 0)` })
    .from(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, "u1"));
  await db.insert(schema.ledgerEntries).values({
    userId: "u1", type: "ADMIN_ADJUST", amount: 15 * COIN - Number(s), balanceAfter: 15 * COIN, note: "test",
  });

  let handle = await bjOpen("bj-poor-0", 10 * COIN);
  let k = 1;
  while ((handle.publicState as { phase: string }).phase === "done") {
    const o = await getOpenRound(db, "u1", handle.roundId);
    await bjFinish(o.id, o.secret as unknown as BjSecret);
    if ((await balanceOf()) < 10 * COIN) break;
    handle = await bjOpen(`bj-poor-${k++}`, 10 * COIN);
  }
  const open = await getOpenRound(db, "u1", handle.roundId).catch(() => null);
  if (open && (await balanceOf()) < 10 * COIN) {
    const secret = open.secret as unknown as BjSecret;
    const next: BjSecret = { ...bjAct(secret, "double"), bet: secret.bet };
    const before = await balanceOf();
    let code = "";
    try {
      await raiseOpenRoundBet(db, {
        userId: "u1", roundId: open.id, extra: secret.bet, expectedBet: secret.bet, step: 0,
        secret: next, publicState: {},
      });
    } catch (e) {
      code = e instanceof WalletError ? e.code : "başka";
    }
    const [row] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, open.id));
    check("yetersiz bakiyede katlama reddedilir", code === "INSUFFICIENT_FUNDS", code);
    check("reddedilince bakiye ve el değişmez",
      (await balanceOf()) === before && row!.bet === secret.bet &&
      (row!.secret as { actions: unknown[] }).actions.length === 0);
    await bjFinish(open.id, { ...bjAct(secret, "stand"), bet: secret.bet });
  } else {
    check("yetersiz bakiye senaryosu kurulamadı (şans) — atlandı", true);
  }
  check("defter = bakiye (sonda)", await ledgerOk());
}

await close();
console.log(`\n${passed} geçti, ${failed} başarısız`);
process.exit(failed === 0 ? 0 : 1);
