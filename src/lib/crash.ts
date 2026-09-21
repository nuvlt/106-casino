/**
 * Crash turunun sunucu tarafı yaşam döngüsü.
 *
 * NEDEN BİR "DURUM" UCU VAR
 * -------------------------
 * Çöküş noktası istemciye verilemez — verilse oyuncu her turda tam
 * zamanında çekip hep kazanırdı. Ama istemci onu bilmediği için, kendi
 * başına bırakıldığında çarpanı sonsuza kadar büyütmeye devam eder:
 * oyuncu ekranda 4x görürken tur aslında 1.02x'te patlamış olabilir.
 * Hesap doğru olur ama GÖSTERİM yalan olur.
 *
 * Çözüm: istemci uçuş boyunca "turum hâlâ yaşıyor mu?" diye sorar.
 * Bu cevap geleceği sızdırmaz, yalnızca içinde bulunulan anı bildirir.
 * Tur bittiği anda gerçek çöküş noktası açılır ve animasyon oraya oturur.
 *
 * Aynı fonksiyon, sekmesi kapanmış oyuncuların yarım kalan turlarını da
 * sonuçlandırır: çöküşü geçmiş turlar kayıp, otomatik çekim hedefine
 * ulaşmış turlar KAZANÇ olarak kapanır.
 */

import { and, eq } from "drizzle-orm";
import { rounds, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { settleOpenRound, type RoundResult } from "@/lib/wallet";
import { crashMultAt } from "@/lib/games/engine";

interface CrashSecret {
  crashPoint: number;
  autoCashout: number | null;
}

/** Turun sonucu artık kesinleşti mi? Kesinleştiyse nasıl bitti? */
function decide(
  secret: CrashSecret,
  createdAt: Date,
  now: number,
): { decided: boolean; cashedOutAt: number | null } {
  const crashPoint = Number(secret.crashPoint ?? 100);
  const auto = secret.autoCashout ?? null;
  const multNow = crashMultAt((now - createdAt.getTime()) / 1000);

  if (auto != null) {
    // Karar anı: hedefe ya da çöküşe hangisi önce gelirse.
    const decisionPoint = Math.min(auto, crashPoint);
    if (multNow >= decisionPoint) {
      return { decided: true, cashedOutAt: auto <= crashPoint ? auto : null };
    }
    return { decided: false, cashedOutAt: null };
  }

  // Manuel oyuncu çekmeden çöküşü geçtiyse tur kaybedilmiştir.
  return { decided: multNow > crashPoint, cashedOutAt: null };
}

/** Kapanmış bir turu, sonucu kesinleşmiş sayarak defterler. */
async function settleDecided(
  db: Db,
  userId: string,
  round: { id: string; bet: number },
  secret: CrashSecret,
  cashedOutAt: number | null,
): Promise<RoundResult> {
  const crashPoint = Number(secret.crashPoint ?? 100);
  const won = cashedOutAt !== null;

  return settleOpenRound(db, {
    userId,
    roundId: round.id,
    game: "CRASH",
    payout: won ? Math.floor((round.bet * cashedOutAt) / 100) : 0,
    mult: won ? cashedOutAt / 100 : 0,
    publicState: {
      crashPoint: crashPoint / 100,
      cashedOutAt: won ? cashedOutAt / 100 : null,
      auto: secret.autoCashout != null,
    },
  });
}

export interface CrashState {
  alive: boolean;
  serverNow: string;
  /** Tur bittiyse dolu gelir. */
  ended?: {
    roundId: string;
    crashPoint: number;
    cashedOutAt: number | null;
    payout: number;
    mult: number;
    balance: number;
    newBadges: { id: string; title: string; icon: string; reward: number }[];
  };
}

/**
 * Tek bir turun anlık durumu. Tur bu çağrı sırasında bitmişse
 * burada defterlenir ve sonucu döner.
 */
export async function pollCrashRound(
  db: Db,
  userId: string,
  roundId: string,
): Promise<CrashState> {
  const now = Date.now();
  const serverNow = new Date(now).toISOString();

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.userId, userId)))
    .limit(1);

  if (!round) return { alive: false, serverNow };

  // Tur zaten kapanmışsa saklanan sonucu bildir.
  if (round.state !== "OPEN") {
    const result = (round.result ?? {}) as { crashPoint?: number; cashedOutAt?: number | null };
    const [user] = await db
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      alive: false,
      serverNow,
      ended: {
        roundId: round.id,
        crashPoint: result.crashPoint ?? 1,
        cashedOutAt: result.cashedOutAt ?? null,
        payout: round.payout,
        mult: round.multX4 / 10_000,
        balance: user?.balance ?? 0,
        newBadges: [],
      },
    };
  }

  const secret = (round.secret ?? {}) as CrashSecret;
  const { decided, cashedOutAt } = decide(secret, round.createdAt, now);

  if (!decided) return { alive: true, serverNow };

  const settled = await settleDecided(db, userId, round, secret, cashedOutAt);
  return {
    alive: false,
    serverNow,
    ended: {
      roundId: settled.roundId,
      crashPoint: Number(secret.crashPoint ?? 100) / 100,
      cashedOutAt: cashedOutAt === null ? null : cashedOutAt / 100,
      payout: settled.payout,
      mult: settled.mult,
      balance: settled.balance,
      newBadges: settled.newBadges,
    },
  };
}

/**
 * Oyuncunun açık kalmış TÜM Crash turlarından sonucu kesinleşmiş
 * olanları kapatır. Her bahis denemesinde ve /api/me'de çağrılır:
 * yoksa sekmesini kapatan oyuncu kendi eski turu yüzünden kilitli kalır
 * ve hedefine ulaşmış otomatik çekimi ödenmeden beklerdi.
 */
export async function resolveDecidedCrashRounds(db: Db, userId: string): Promise<number> {
  const open = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.state, "OPEN"), eq(rounds.game, "CRASH")));

  const now = Date.now();
  let closed = 0;

  for (const r of open) {
    const secret = (r.secret ?? {}) as CrashSecret;
    const { decided, cashedOutAt } = decide(secret, r.createdAt, now);
    if (!decided) continue;
    await settleDecided(db, userId, r, secret, cashedOutAt);
    closed++;
  }

  return closed;
}
