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
 */

import { and, eq, sql } from "drizzle-orm";
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
import { Rng } from "@/lib/games/rng";
import type { Outcome } from "@/lib/games/engine";
import { MAX_BET, MIN_BET } from "@/lib/games/config";
import { trtDay } from "@/lib/day";

export type Game = (typeof gameEnum.enumValues)[number];

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
      | "NOT_FOUND",
  ) {
    super(message);
  }
}

export interface RoundResult {
  roundId: string;
  bet: number;
  payout: number;
  mult: number;
  balance: number;
  result: Record<string, unknown>;
  fairness: { serverSeedHash: string; clientSeed: string; nonce: number };
}

/** Bahis tutarını sunucuda doğrula — istemciden gelen değere güvenilmez. */
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

/** Nonce'u atomik olarak artırır ve KULLANILACAK değeri döndürür. */
async function consumeNonce(
  tx: Tx,
  userId: string,
): Promise<{ id: string; serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: number }> {
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
  // UPDATE artırılmış değeri döndürür; bu turda kullanılacak olan bir öncekidir.
  return { ...row, nonce: row.nonce - 1 };
}

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
    params: Record<string, unknown>;
    idempotencyKey: string;
    /** Sonucu üreten saf fonksiyon — RNG dışında girdi almaz. */
    resolve: (rng: Rng) => Outcome;
  },
): Promise<RoundResult> {
  validateBet(opts.bet);

  // Aynı anahtarla daha önce oynandıysa o turu döndür (yeni tur açma).
  const [dup] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.idempotencyKey, opts.idempotencyKey))
    .limit(1);

  if (dup) {
    const [user] = await db
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);
    const [seed] = await db
      .select({
        serverSeedHash: seedPairs.serverSeedHash,
        clientSeed: seedPairs.clientSeed,
      })
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
      fairness: {
        serverSeedHash: seed?.serverSeedHash ?? "",
        clientSeed: seed?.clientSeed ?? "",
        nonce: dup.nonce,
      },
    };
  }

  return db.transaction(async (tx) => {
    const afterDebit = await debit(tx, opts.userId, opts.bet);
    const seed = await consumeNonce(tx, opts.userId);

    // Sonuç burada, sunucuda üretilir.
    const rng = new Rng(seed.serverSeed, seed.clientSeed, seed.nonce);
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

    await tx.insert(ledgerEntries).values({
      userId: opts.userId,
      type: "BET",
      amount: -opts.bet,
      balanceAfter: afterDebit,
      roundId,
    });

    let balance = afterDebit;
    if (outcome.payout > 0) {
      const [credited] = await tx
        .update(users)
        .set({ balance: sql`${users.balance} + ${outcome.payout}` })
        .where(eq(users.id, opts.userId))
        .returning({ balance: users.balance });
      balance = credited!.balance;

      await tx.insert(ledgerEntries).values({
        userId: opts.userId,
        type: "PAYOUT",
        amount: outcome.payout,
        balanceAfter: balance,
        roundId,
      });
    }

    await updateStats(tx, {
      userId: opts.userId,
      day,
      balance,
      bet: opts.bet,
      payout: outcome.payout,
      multX4,
      roundId,
      game: opts.game,
      now,
    });

    if (multX4 >= FEED_MULT_THRESHOLD || outcome.payout >= FEED_PAYOUT_THRESHOLD) {
      await tx.insert(feedEvents).values({
        userId: opts.userId,
        game: opts.game,
        payout: outcome.payout,
        multX4,
        roundId,
      });
    }

    return {
      roundId,
      bet: opts.bet,
      payout: outcome.payout,
      mult: outcome.mult,
      balance,
      result: outcome.detail,
      fairness: {
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
      },
    };
  });
}

/**
 * Sezonluk ve günlük istatistikler.
 *
 * Sıralama ölçütü ZİRVE bakiye: sezon boyunca ulaşılan en yüksek değer.
 * Böylece riske giren oyuncu, parayı sonradan kaybetse bile tabloda kalır —
 * %95 RTP altında "hiç oynamayan kazanır" sorununun çözümü budur.
 */
async function updateStats(
  tx: Tx,
  o: {
    userId: string;
    day: string;
    balance: number;
    bet: number;
    payout: number;
    multX4: number;
    roundId: string;
    game: Game;
    now: Date;
  },
): Promise<void> {
  const won = o.payout > 0;

  await tx
    .insert(playerStats)
    .values({
      userId: o.userId,
      peakBalance: o.balance,
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
        peakBalance: sql`greatest(${playerStats.peakBalance}, ${o.balance})`,
        peakBalanceAt: sql`case when ${o.balance} > ${playerStats.peakBalance}
          then ${o.now} else ${playerStats.peakBalanceAt} end`,
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
    });

  await tx
    .insert(dailyStats)
    .values({
      userId: o.userId,
      day: o.day,
      peakBalance: o.balance,
      netResult: o.payout - o.bet,
      roundsPlayed: 1,
      biggestMultX4: o.multX4,
    })
    .onConflictDoUpdate({
      target: [dailyStats.userId, dailyStats.day],
      set: {
        peakBalance: sql`greatest(${dailyStats.peakBalance}, ${o.balance})`,
        netResult: sql`${dailyStats.netResult} + ${o.payout - o.bet}`,
        roundsPlayed: sql`${dailyStats.roundsPlayed} + 1`,
        biggestMultX4: sql`greatest(${dailyStats.biggestMultX4}, ${o.multX4})`,
      },
    });
}
