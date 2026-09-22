/**
 * Cüzdan — bahsin güvenlik çekirdeği.
 *
 * KURALLAR
 * --------
 * 1. Bakiye düşümü KOŞULLU tek bir UPDATE ile yapılır. Eşzamanlı iki istek
 *    aynı parayı iki kez harcayamaz; veritabanı satır kilidi bunu garanti eder.
 * 2. Her bahis bir idempotency anahtarı taşır. Ağ tekrarı veya çift tık
 *    ikinci turu açmaz, ilkinin sonucunu döndürür.
 * 3. Tur sonucu SUNUCUDA üretilir; istemciden gelen çarpan asla kullanılmaz.
 * 4. Ledger append-only. Her satırda balanceAfter var — bakiye ile ledger
 *    toplamının mutabakatı backoffice'ten denetlenebilir.
 * 5. Çok adımlı oyunlarda (Crash, Higher/Lower) turun gizli durumu
 *    `round.secret` alanında durur ve hiçbir API yanıtına konmaz.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import {
  dailyStats,
  feedEvents,
  ledgerEntries,
  playerStats,
  rounds,
  seedPairs,
  users,
  type gameEnum,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { Rng } from "@/lib/games/rng-core";
import { rngFor } from "@/lib/games/rng";
import type { Outcome } from "@/lib/games/engine";
import { MAX_BET, MIN_BET } from "@/lib/games/config";
import { trtDay } from "@/lib/day";
import { advanceMissions } from "@/lib/mission-progress";
import { awardBadges, badgeRewardTotal, type BadgeDef } from "@/lib/badges";
import { together } from "@/lib/together";

export type Game = (typeof gameEnum.enumValues)[number];

/** jsonb sütunlarına yazılabilen her şey — arayüz tipleri de kabul edilir. */
export type JsonObject = object;

/** Akışa düşmek için eşik: 5x üstü çarpan veya 500 coin üstü kazanç. */
const FEED_MULT_THRESHOLD = 5 * 10_000;
const FEED_PAYOUT_THRESHOLD = 500 * 100;

export class WalletError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INSUFFICIENT_FUNDS"
      | "SUSPENDED"
      | "INVALID_BET"
      | "ROUND_OPEN"
      | "ROUND_CLOSED"
      | "NOT_FOUND"
      | "DUPLICATE_KEY",
  ) {
    super(message);
  }
}

export interface Fairness {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface RoundResult {
  roundId: string;
  bet: number;
  payout: number;
  mult: number;
  balance: number;
  result: JsonObject;
  newBadges: { id: string; title: string; icon: string; reward: number }[];
  fairness: Fairness;
}

export function validateBet(bet: number): void {
  if (!Number.isInteger(bet)) throw new WalletError("Bahis tam sayı olmalı", "INVALID_BET");
  if (bet < MIN_BET || bet > MAX_BET) {
    throw new WalletError(
      `Bahis ${MIN_BET / 100}–${MAX_BET / 100} coin aralığında olmalı`,
      "INVALID_BET",
    );
  }
}

/**
 * Koşullu bakiye düşümü. 0 satır dönerse para yetmiyor ya da hesap askıda.
 * Bu tek ifade, çift harcamaya karşı asıl korumadır.
 */
async function debit(tx: Tx, userId: string, amount: number): Promise<number> {
  const rows = await tx
    .update(users)
    .set({ balance: sql`${users.balance} - ${amount}` })
    .where(
      and(
        eq(users.id, userId),
        sql`${users.balance} >= ${amount}`,
        sql`${users.suspendedAt} is null`,
      ),
    )
    .returning({ balance: users.balance });

  if (rows.length === 0) {
    const [user] = await tx
      .select({ suspendedAt: users.suspendedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new WalletError("Kullanıcı bulunamadı", "NOT_FOUND");
    if (user.suspendedAt) throw new WalletError("Hesap askıya alınmış", "SUSPENDED");
    throw new WalletError("Yetersiz bakiye", "INSUFFICIENT_FUNDS");
  }
  return rows[0]!.balance;
}

/** Nonce'u atomik artırır ve BU turda kullanılacak değeri döndürür. */
async function consumeNonce(tx: Tx, userId: string) {
  const rows = await tx
    .update(seedPairs)
    .set({ nonce: sql`${seedPairs.nonce} + 1` })
    .where(and(eq(seedPairs.userId, userId), eq(seedPairs.active, true)))
    .returning({
      id: seedPairs.id,
      serverSeed: seedPairs.serverSeed,
      serverSeedHash: seedPairs.serverSeedHash,
      clientSeed: seedPairs.clientSeed,
      nonce: seedPairs.nonce,
    });

  const row = rows[0];
  if (!row) throw new WalletError("Aktif tohum çifti yok", "NOT_FOUND");
  return { ...row, nonce: row.nonce - 1 };
}

/** Aynı anda birden fazla açık tur olamaz — ikinci Crash başlatılamaz. */
async function assertNoOpenRound(tx: Tx, userId: string): Promise<void> {
  const [open] = await tx
    .select({ id: rounds.id, game: rounds.game })
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.state, "OPEN")))
    .limit(1);
  if (open) {
    throw new WalletError(
      "Devam eden bir turun var — önce onu bitir",
      "ROUND_OPEN",
    );
  }
}

/**
 * Her bahsin ilk üç adımı: açık tur yok mu, bakiye düş, nonce ilerlet.
 *
 * Üçü aynı transaction'da, bu sırayla çalışır; ancak yanıtları tek tek
 * beklenmeden art arda gönderilir (Postgres "pipelining"). Veritabanı
 * uzaktayken her bekleme bir gidiş-dönüş demek — üç yerine bir.
 * Herhangi biri hata verirse transaction geri alınır: düşüm de nonce
 * artışı da kalıcı olmaz, yani sıralı hâliyle birebir aynı sonuç.
 */
async function openBet(tx: Tx, userId: string, bet: number) {
  // SIRA ÖNEMLİ: önce bakiye düşümü gönderilir. O UPDATE kullanıcı
  // satırını transaction sonuna kadar kilitler; aynı kullanıcının
  // eşzamanlı ikinci bahsi burada bekler ve "açık tur var mı" sorusunu
  // ancak ilki bittikten sonra, onun açtığı turu görerek sorar. Böylece
  // iki sekmeden aynı anda iki açık tur başlatılamaz.
  const debited = debit(tx, userId, bet);
  const noOpen = assertNoOpenRound(tx, userId);
  const nonce = consumeNonce(tx, userId);

  // together: biri hata verse de diğerleri transaction içinde biter
  // (bkz. lib/together.ts). Hata önceliği dizideki sıraya göre:
  // "açık tur var" mesajı "yetersiz bakiye"den önce gelir.
  const [, afterDebit, seed] = await together([noOpen, debited, nonce]);
  return { afterDebit, seed };
}

/**
 * İstek anahtarı tüm kullanıcılar arasında tekildir. Başka birinin
 * anahtarıyla gelen istek o kişinin turunu (sonuç, tohum bilgisi)
 * görmemeli; çakışma olarak reddedilir.
 */
function assertOwnKey(ownerId: string, userId: string): void {
  if (ownerId !== userId) {
    throw new WalletError("Bu istek anahtarı kullanılamaz, sayfayı yenileyin", "DUPLICATE_KEY");
  }
}

/** Idempotency: aynı anahtarla oynanmış tur varsa onu döndür. */
async function findByKey(db: Db, userId: string, key: string): Promise<RoundResult | null> {
  const [dup] = await db.select().from(rounds).where(eq(rounds.idempotencyKey, key)).limit(1);
  if (!dup) return null;
  assertOwnKey(dup.userId, userId);

  const [user] = await db
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [seed] = await db
    .select({ serverSeedHash: seedPairs.serverSeedHash, clientSeed: seedPairs.clientSeed })
    .from(seedPairs)
    .where(eq(seedPairs.id, dup.seedPairId))
    .limit(1);

  return {
    roundId: dup.id,
    bet: dup.bet,
    payout: dup.payout,
    mult: dup.multX4 / 10_000,
    balance: user?.balance ?? 0,
    result: (dup.result ?? {}) as Record<string, unknown>,
    newBadges: [],
    fairness: {
      serverSeedHash: seed?.serverSeedHash ?? "",
      clientSeed: seed?.clientSeed ?? "",
      nonce: dup.nonce,
    },
  };
}

/**
 * Tur kapandıktan sonraki ortak iş: ödeme, istatistik, görev, rozet, akış.
 * Tek adımlı ve çok adımlı oyunların ikisi de buradan geçer.
 */
async function finalizeRound(
  tx: Tx,
  o: {
    userId: string;
    roundId: string;
    game: Game;
    day: string;
    bet: number;
    payout: number;
    multX4: number;
    balanceAfterDebit: number;
    balanceBeforeBet: number;
    now: Date;
  },
): Promise<{ balance: number; newBadges: BadgeDef[] }> {
  let balance = o.balanceAfterDebit;

  if (o.payout > 0) {
    const [credited] = await tx
      .update(users)
      .set({ balance: sql`${users.balance} + ${o.payout}` })
      .where(eq(users.id, o.userId))
      .returning({ balance: users.balance });
    balance = credited!.balance;
  }

  const won = o.payout > 0;

  // Buradan sonraki üç yazım da yalnızca yukarıda bilinen değerlere
  // dayanıyor; art arda gönderilip birlikte beklenir (bkz. openBet).
  const payoutEntry =
    o.payout > 0
      ? tx
          .insert(ledgerEntries)
          .values({
            userId: o.userId,
            type: "PAYOUT",
            amount: o.payout,
            balanceAfter: balance,
            roundId: o.roundId,
          })
          .execute()
      : null;

  const statWrite = tx
    .insert(playerStats)
    .values({
      userId: o.userId,
      peakBalance: balance,
      peakBalanceAt: o.now,
      biggestWin: o.payout,
      biggestWinRoundId: won ? o.roundId : null,
      biggestMultX4: o.multX4,
      biggestMultRoundId: won ? o.roundId : null,
      roundsPlayed: 1,
      totalWagered: o.bet,
      totalWon: o.payout,
      gamesTouched: [o.game],
      currentWinStreak: won ? 1 : 0,
      bestWinStreak: won ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: playerStats.userId,
      set: {
        peakBalance: sql`greatest(${playerStats.peakBalance}, ${balance})`,
        peakBalanceAt: sql`case when ${balance} > ${playerStats.peakBalance}
          then ${o.now.toISOString()} else ${playerStats.peakBalanceAt} end`,
        biggestWin: sql`greatest(${playerStats.biggestWin}, ${o.payout})`,
        biggestWinRoundId: sql`case when ${o.payout} > ${playerStats.biggestWin}
          then ${o.roundId} else ${playerStats.biggestWinRoundId} end`,
        biggestMultX4: sql`greatest(${playerStats.biggestMultX4}, ${o.multX4})`,
        biggestMultRoundId: sql`case when ${o.multX4} > ${playerStats.biggestMultX4}
          then ${o.roundId} else ${playerStats.biggestMultRoundId} end`,
        roundsPlayed: sql`${playerStats.roundsPlayed} + 1`,
        totalWagered: sql`${playerStats.totalWagered} + ${o.bet}`,
        totalWon: sql`${playerStats.totalWon} + ${o.payout}`,
        gamesTouched: sql`case when ${playerStats.gamesTouched} @> ${JSON.stringify([o.game])}::jsonb
          then ${playerStats.gamesTouched}
          else ${playerStats.gamesTouched} || ${JSON.stringify([o.game])}::jsonb end`,
        currentWinStreak: won ? sql`${playerStats.currentWinStreak} + 1` : sql`0`,
        bestWinStreak: won
          ? sql`greatest(${playerStats.bestWinStreak}, ${playerStats.currentWinStreak} + 1)`
          : sql`${playerStats.bestWinStreak}`,
        updatedAt: o.now,
      },
    })
    .returning()
    .execute();

  const dailyWrite = tx
    .insert(dailyStats)
    .values({
      userId: o.userId,
      day: o.day,
      peakBalance: balance,
      minBalance: balance,
      netResult: o.payout - o.bet,
      roundsPlayed: 1,
      biggestMultX4: o.multX4,
      winsToday: won ? 1 : 0,
      wageredToday: o.bet,
    })
    .onConflictDoUpdate({
      target: [dailyStats.userId, dailyStats.day],
      set: {
        peakBalance: sql`greatest(${dailyStats.peakBalance}, ${balance})`,
        minBalance: sql`least(${dailyStats.minBalance}, ${balance})`,
        netResult: sql`${dailyStats.netResult} + ${o.payout - o.bet}`,
        roundsPlayed: sql`${dailyStats.roundsPlayed} + 1`,
        biggestMultX4: sql`greatest(${dailyStats.biggestMultX4}, ${o.multX4})`,
        winsToday: sql`${dailyStats.winsToday} + ${won ? 1 : 0}`,
        wageredToday: sql`${dailyStats.wageredToday} + ${o.bet}`,
      },
    })
    .returning()
    .execute();

  const [, [stat], [daily]] = await together([payoutEntry, statWrite, dailyWrite]);

  // Görevler ve rozetler farklı tablolara yazar; ikisi aynı anda.
  const [, newBadges] = await together([
    advanceMissions(tx, {
      userId: o.userId,
      day: o.day,
      won,
      bet: o.bet,
      multX4: o.multX4,
      currentWinStreak: stat?.currentWinStreak ?? 0,
    }),
    awardBadges(tx, o.userId, {
      roundsPlayed: stat?.roundsPlayed ?? 1,
      gamesTouched: (stat?.gamesTouched as string[]) ?? [],
      multX4: o.multX4,
      currentStreak: stat?.currentStreak ?? 0,
      balanceBeforeBet: o.balanceBeforeBet,
      balanceAfter: balance,
      minBalanceToday: daily?.minBalance ?? balance,
      won,
      bet: o.bet,
    }),
  ]);

  // Akış kaydı rozet ödülünden bağımsız; ödül varsa onunla birlikte gider.
  const feedEntry =
    o.multX4 >= FEED_MULT_THRESHOLD || o.payout >= FEED_PAYOUT_THRESHOLD
      ? tx
          .insert(feedEvents)
          .values({
            userId: o.userId,
            game: o.game,
            payout: o.payout,
            multX4: o.multX4,
            roundId: o.roundId,
          })
          .execute()
      : null;

  const reward = badgeRewardTotal(newBadges);
  if (reward > 0) {
    const [credited] = await tx
      .update(users)
      .set({ balance: sql`${users.balance} + ${reward}` })
      .where(eq(users.id, o.userId))
      .returning({ balance: users.balance });
    balance = credited!.balance;

    await tx.insert(ledgerEntries).values({
      userId: o.userId,
      type: "BADGE_REWARD",
      amount: reward,
      balanceAfter: balance,
      roundId: o.roundId,
      note: newBadges.map((b) => b.title).join(", "),
    });
  }

  await feedEntry;

  return { balance, newBadges };
}

const publicBadges = (list: BadgeDef[]) =>
  list.map((b) => ({ id: b.id, title: b.title, icon: b.icon, reward: b.reward }));

/**
 * Tek adımlı oyunların tamamı (Wheel, Dice, Plinko, Scratch, Guess, Mystery)
 * bu fonksiyondan geçer: düş → çöz → öde → defterle → istatistik.
 * Hepsi tek transaction içinde; herhangi bir adım düşerse hiçbiri yazılmaz.
 */
export async function settleRound(
  db: Db,
  opts: {
    userId: string;
    game: Game;
    bet: number;
    params: JsonObject;
    idempotencyKey: string;
    resolve: (rng: Rng) => Outcome;
  },
): Promise<RoundResult> {
  validateBet(opts.bet);

  const dup = await findByKey(db, opts.userId, opts.idempotencyKey);
  if (dup) return dup;

  return db.transaction(async (tx) => {
    const { afterDebit, seed } = await openBet(tx, opts.userId, opts.bet);

    // Sonuç burada, sunucuda üretilir.
    const rng = rngFor(seed.serverSeed, seed.clientSeed, seed.nonce);
    const outcome = opts.resolve(rng);

    const multX4 = Math.round(outcome.mult * 10_000);
    const day = trtDay();
    const now = new Date();

    const [round] = await tx
      .insert(rounds)
      .values({
        userId: opts.userId,
        game: opts.game,
        state: "SETTLED",
        bet: opts.bet,
        payout: outcome.payout,
        multX4,
        seedPairId: seed.id,
        nonce: seed.nonce,
        params: opts.params,
        result: outcome.detail,
        idempotencyKey: opts.idempotencyKey,
        settledAt: now,
        day,
      })
      .returning({ id: rounds.id });

    const roundId = round!.id;

    // BET kaydı ile tur kapanışı birbirine bağlı değil; kayıt önce
    // gönderilir (defterde sıra korunur), yanıtı kapanışla birlikte beklenir.
    const betEntry = tx
      .insert(ledgerEntries)
      .values({
        userId: opts.userId,
        type: "BET",
        amount: -opts.bet,
        balanceAfter: afterDebit,
        roundId,
      })
      .execute();

    const [, { balance, newBadges }] = await together([betEntry, finalizeRound(tx, {
      userId: opts.userId,
      roundId,
      game: opts.game,
      day,
      bet: opts.bet,
      payout: outcome.payout,
      multX4,
      balanceAfterDebit: afterDebit,
      balanceBeforeBet: afterDebit + opts.bet,
      now,
    })]);

    return {
      roundId,
      bet: opts.bet,
      payout: outcome.payout,
      mult: outcome.mult,
      balance,
      result: outcome.detail,
      newBadges: publicBadges(newBadges),
      fairness: {
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
      },
    };
  });
}

export interface OpenRoundHandle {
  roundId: string;
  bet: number;
  balance: number;
  startedAt: Date;
  /** İstemciye gösterilebilir başlangıç durumu (gizli kısım hariç). */
  publicState: JsonObject;
  fairness: Fairness;
}

/**
 * Çok adımlı tur açar (Crash, Higher/Lower): bahis düşülür, gizli durum
 * `secret` alanına yazılır ve tur OPEN kalır. Gizli durum hiçbir yanıtta dönmez.
 */
export async function openRound(
  db: Db,
  opts: {
    userId: string;
    game: Game;
    bet: number;
    params: JsonObject;
    idempotencyKey: string;
    ttlMs: number;
    /** RNG'den gizli durumu ve istemciye gösterilecek kısmı üretir. */
    build: (rng: Rng) => { secret: JsonObject; publicState: JsonObject };
  },
): Promise<OpenRoundHandle> {
  validateBet(opts.bet);

  const [dup] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.idempotencyKey, opts.idempotencyKey))
    .limit(1);

  if (dup) {
    assertOwnKey(dup.userId, opts.userId);
    const [user] = await db
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);
    const [seed] = await db
      .select({ serverSeedHash: seedPairs.serverSeedHash, clientSeed: seedPairs.clientSeed })
      .from(seedPairs)
      .where(eq(seedPairs.id, dup.seedPairId))
      .limit(1);
    return {
      roundId: dup.id,
      bet: dup.bet,
      balance: user?.balance ?? 0,
      startedAt: dup.createdAt,
      publicState: (dup.result ?? {}) as Record<string, unknown>,
      fairness: {
        serverSeedHash: seed?.serverSeedHash ?? "",
        clientSeed: seed?.clientSeed ?? "",
        nonce: dup.nonce,
      },
    };
  }

  return db.transaction(async (tx) => {
    const { afterDebit, seed } = await openBet(tx, opts.userId, opts.bet);

    const rng = rngFor(seed.serverSeed, seed.clientSeed, seed.nonce);
    const { secret, publicState } = opts.build(rng);

    const now = new Date();
    const [round] = await tx
      .insert(rounds)
      .values({
        userId: opts.userId,
        game: opts.game,
        state: "OPEN",
        bet: opts.bet,
        payout: 0,
        multX4: 0,
        seedPairId: seed.id,
        nonce: seed.nonce,
        params: opts.params,
        result: publicState,
        secret,
        idempotencyKey: opts.idempotencyKey,
        expiresAt: new Date(now.getTime() + opts.ttlMs),
        day: trtDay(),
      })
      .returning({ id: rounds.id, createdAt: rounds.createdAt });

    await tx.insert(ledgerEntries).values({
      userId: opts.userId,
      type: "BET",
      amount: -opts.bet,
      balanceAfter: afterDebit,
      roundId: round!.id,
    });

    return {
      roundId: round!.id,
      bet: opts.bet,
      balance: afterDebit,
      startedAt: round!.createdAt,
      publicState,
      fairness: {
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
      },
    };
  });
}

export interface OpenRoundView {
  id: string;
  bet: number;
  createdAt: Date;
  expiresAt: Date | null;
  secret: Record<string, unknown>;
  publicState: Record<string, unknown>;
  params: Record<string, unknown>;
  nonce: number;
}

/** Açık turu SUNUCU tarafında okur — secret dahil. Asla doğrudan döndürülmez. */
export async function getOpenRound(
  db: Db,
  userId: string,
  roundId: string,
): Promise<OpenRoundView> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.userId, userId)))
    .limit(1);

  if (!round) throw new WalletError("Tur bulunamadı", "NOT_FOUND");
  if (round.state !== "OPEN") throw new WalletError("Tur zaten kapanmış", "ROUND_CLOSED");

  return {
    id: round.id,
    bet: round.bet,
    createdAt: round.createdAt,
    expiresAt: round.expiresAt,
    secret: (round.secret ?? {}) as Record<string, unknown>,
    publicState: (round.result ?? {}) as Record<string, unknown>,
    params: (round.params ?? {}) as Record<string, unknown>,
    nonce: round.nonce,
  };
}

/** Açık turun ara durumunu günceller (Higher/Lower adımı) — tur açık kalır. */
export async function updateOpenRound(
  db: Db,
  roundId: string,
  patch: { secret?: JsonObject; publicState?: JsonObject },
): Promise<void> {
  await db
    .update(rounds)
    .set({
      ...(patch.secret ? { secret: patch.secret } : {}),
      ...(patch.publicState ? { result: patch.publicState } : {}),
    })
    .where(and(eq(rounds.id, roundId), eq(rounds.state, "OPEN")));
}

/**
 * Açık turu kapatır. Ödeme tutarı ve çarpan SUNUCUDA hesaplanmış olmalıdır.
 * Koşullu UPDATE (state = OPEN) aynı turun iki kez ödenmesini engeller.
 */
export async function settleOpenRound(
  db: Db,
  opts: {
    userId: string;
    roundId: string;
    game: Game;
    payout: number;
    mult: number;
    publicState: JsonObject;
  },
): Promise<RoundResult> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const multX4 = Math.round(opts.mult * 10_000);

    // Yalnızca hâlâ açık olan tur kapatılabilir — çift ödemeye karşı koruma.
    const closed = await tx
      .update(rounds)
      .set({
        state: "SETTLED",
        payout: opts.payout,
        multX4,
        result: opts.publicState,
        settledAt: now,
      })
      .where(
        and(
          eq(rounds.id, opts.roundId),
          eq(rounds.userId, opts.userId),
          eq(rounds.state, "OPEN"),
        ),
      )
      .returning();

    const round = closed[0];
    if (!round) throw new WalletError("Tur zaten kapanmış", "ROUND_CLOSED");

    const [user] = await tx
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);

    const { balance, newBadges } = await finalizeRound(tx, {
      userId: opts.userId,
      roundId: round.id,
      game: opts.game,
      day: round.day,
      bet: round.bet,
      payout: opts.payout,
      multX4,
      balanceAfterDebit: user?.balance ?? 0,
      balanceBeforeBet: (user?.balance ?? 0) + round.bet,
      now,
    });

    const [seed] = await tx
      .select({ serverSeedHash: seedPairs.serverSeedHash, clientSeed: seedPairs.clientSeed })
      .from(seedPairs)
      .where(eq(seedPairs.id, round.seedPairId))
      .limit(1);

    return {
      roundId: round.id,
      bet: round.bet,
      payout: opts.payout,
      mult: opts.mult,
      balance,
      result: opts.publicState,
      newBadges: publicBadges(newBadges),
      fairness: {
        serverSeedHash: seed?.serverSeedHash ?? "",
        clientSeed: seed?.clientSeed ?? "",
        nonce: round.nonce,
      },
    };
  });
}

/** Süresi geçmiş açık turları kaybedilmiş sayarak kapatır (cron). */
export async function closeExpiredRounds(db: Db, now = new Date()): Promise<number> {
  const closed = await db
    .update(rounds)
    .set({ state: "SETTLED", settledAt: now, payout: 0, multX4: 0 })
    .where(
      and(
        eq(rounds.state, "OPEN"),
        sql`${rounds.expiresAt} is not null`,
        sql`${rounds.expiresAt} < ${now.toISOString()}`,
      ),
    )
    .returning({ id: rounds.id });
  return closed.length;
}

export { isNull };
