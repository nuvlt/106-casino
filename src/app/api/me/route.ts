/**
 * GET /api/me — bakiye, seri, görevler, rozetler, tohum bilgisi.
 *
 * Bu uç aynı zamanda günlük hakkı garanti eder: kullanıcı sabah ilk kez
 * uygulamayı açtığında bakiyesi burada sıfırlanır. Cron'a bağımlı değiliz.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { missions, playerStats, rounds, userBadges, userMissions, users } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { ensureDailyClaim, streakBonusFor } from "@/lib/economy";
import { ensureActiveSeed } from "@/lib/seeds";
import { resolveDecidedCrashRounds } from "@/lib/crash";
import { COIN } from "@/lib/games/config";
import { BADGES } from "@/lib/badges";
import {
  INVITE_COOKIE,
  linkReferral,
  settleReferralRewards,
  type ReferralNews,
} from "@/lib/referral";

export const dynamic = "force-dynamic";

/**
 * Davet: çerezdeki kodla ilişki kur, bekleyen bonusları öde.
 *
 * Asla fırlatmaz — davet tabloları henüz kurulmamış olsa bile (migration
 * uygulanmadan kod yayına çıktıysa) /api/me eskisi gibi çalışır, yalnızca
 * davet özelliği devre dışı kalır. `consumed` yalnız kesin bir sonuçta
 * true olur; geçici bir hatada çerez silinmez, sonraki istekte tekrar denenir.
 */
async function processReferrals(
  userId: string,
  code: string | undefined,
): Promise<{ news: ReferralNews[]; consumed: boolean }> {
  let consumed = false;
  try {
    if (code) {
      await linkReferral(db, userId, code);
      consumed = true;
    }
    return { news: await settleReferralRewards(db, userId), consumed };
  } catch (e) {
    console.error("Davet işlenemedi:", e);
    return { news: [], consumed };
  }
}

export async function GET() {
  try {
    const user = await requireUser();

    // Günlük hak ÖNCE: sıfırlama bakiyeyi yeniden yazar. Tohum ve yarım
    // Crash turları ondan sonra, birbirinden bağımsız olduğu için aynı anda.
    const daily = await ensureDailyClaim(db, user.id);
    // Davet bonusu da günlük haktan SONRA: sabah sıfırlaması onu silmesin.
    const inviteCode = (await cookies()).get(INVITE_COOKIE)?.value;
    const [seed, , referral] = await Promise.all([
      ensureActiveSeed(db, user.id),
      // Yarım kalmış turlar burada sonuçlanır (bkz. lib/crash.ts).
      resolveDecidedCrashRounds(db, user.id),
      processReferrals(user.id, inviteCode),
    ]);
    const day = daily.day;

    // Geri kalan her şey salt okuma ve birbirinden bağımsız: tek seferde.
    // Bakiye en sonda okunur ki az önce kapanan Crash turunun ödemesi dahil olsun.
    const [[wallet], [openRound], [stat], todaysMissions, earnedRows] = await Promise.all([
      db.select({ balance: users.balance }).from(users).where(eq(users.id, user.id)).limit(1),
      db
        .select({ id: rounds.id, game: rounds.game, bet: rounds.bet })
        .from(rounds)
        .where(and(eq(rounds.userId, user.id), eq(rounds.state, "OPEN")))
        .limit(1),
      db.select().from(playerStats).where(eq(playerStats.userId, user.id)).limit(1),
      db
        .select({
          id: missions.id,
          kind: missions.kind,
          title: missions.title,
          subtitle: missions.subtitle,
          target: missions.target,
          reward: missions.reward,
          progress: userMissions.progress,
          completedAt: userMissions.completedAt,
          claimedAt: userMissions.claimedAt,
        })
        .from(userMissions)
        .innerJoin(missions, eq(userMissions.missionId, missions.id))
        .where(and(eq(userMissions.userId, user.id), eq(missions.day, day))),
      // Rozet metinleri KOD'dan okunur (BADGES), veritabanından değil.
      // Tablodaki satır yalnızca "bu rozet kazanıldı" kaydıdır. Başlığı
      // adı geçtiği yerde tek kaynaktan almak, bir rozeti yeniden
      // adlandırdığımızda üretim veritabanını yeniden tohumlama
      // zorunluluğunu ortadan kaldırıyor.
      db
        .select({ badgeId: userBadges.badgeId, earnedAt: userBadges.earnedAt })
        .from(userBadges)
        .where(eq(userBadges.userId, user.id))
        .orderBy(desc(userBadges.earnedAt)),
    ]);
    const balance = wallet?.balance ?? 0;

    const byId = new Map(BADGES.map((b) => [b.id, b]));
    const earned = earnedRows.flatMap((r) => {
      const def = byId.get(r.badgeId);
      // Koddan kaldırılmış bir rozet varsa sessizce atlanır.
      return def
        ? [{
            id: def.id,
            title: def.title,
            description: def.description,
            icon: def.icon,
            tier: def.tier,
            earnedAt: r.earnedAt,
          }]
        : [];
    });

    const res = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      wallet: {
        balance,
        balanceCoins: balance / COIN,
        day,
      },
      streak: {
        day: daily.streakDay,
        grantedToday: daily.granted,
        nextBonus: streakBonusFor(daily.streakDay + 1),
        longest: stat?.longestStreak ?? 0,
      },
      stats: {
        peakBalance: stat?.peakBalance ?? 0,
        biggestWin: stat?.biggestWin ?? 0,
        biggestMult: (stat?.biggestMultX4 ?? 0) / 10_000,
        roundsPlayed: stat?.roundsPlayed ?? 0,
        totalWagered: stat?.totalWagered ?? 0,
        currentWinStreak: stat?.currentWinStreak ?? 0,
      },
      openRound: openRound ?? null,
      missions: todaysMissions,
      badges: earned,
      // serverSeed YOK — yalnızca hash. Tohum döndürülünce açılır.
      fairness: {
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
      },
      // Bu istekte ödenen davet bonusları — arayüz bir kez bildirim gösterir.
      referralNews: referral.news,
    });
    if (referral.consumed) res.cookies.delete(INVITE_COOKIE);
    return res;
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/me hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
