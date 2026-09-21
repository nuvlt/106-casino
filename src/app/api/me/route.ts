/**
 * GET /api/me — bakiye, seri, görevler, rozetler, tohum bilgisi.
 *
 * Bu uç aynı zamanda günlük hakkı garanti eder: kullanıcı sabah ilk kez
 * uygulamayı açtığında bakiyesi burada sıfırlanır. Cron'a bağımlı değiliz.
 */

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { missions, playerStats, rounds, userBadges, userMissions } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { ensureDailyState, streakBonusFor } from "@/lib/economy";
import { ensureActiveSeed } from "@/lib/seeds";
import { resolveDecidedCrashRounds } from "@/lib/crash";
import { COIN } from "@/lib/games/config";
import { BADGES } from "@/lib/badges";
import { trtDay } from "@/lib/day";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const daily = await ensureDailyState(db, user.id);
    const seed = await ensureActiveSeed(db, user.id);
    // Yarım kalmış turlar burada sonuçlanır (bkz. lib/crash.ts).
    await resolveDecidedCrashRounds(db, user.id);
    const day = trtDay();

    const [openRound] = await db
      .select({ id: rounds.id, game: rounds.game, bet: rounds.bet })
      .from(rounds)
      .where(and(eq(rounds.userId, user.id), eq(rounds.state, "OPEN")))
      .limit(1);

    const [stat] = await db
      .select()
      .from(playerStats)
      .where(eq(playerStats.userId, user.id))
      .limit(1);

    const todaysMissions = await db
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
      .where(and(eq(userMissions.userId, user.id), eq(missions.day, day)));

    // Rozet metinleri KOD'dan okunur (BADGES), veritabanından değil.
    // Tablodaki satır yalnızca "bu rozet kazanıldı" kaydıdır. Başlığı
    // adı geçtiği yerde tek kaynaktan almak, bir rozeti yeniden
    // adlandırdığımızda üretim veritabanını yeniden tohumlama
    // zorunluluğunu ortadan kaldırıyor.
    const earnedRows = await db
      .select({ badgeId: userBadges.badgeId, earnedAt: userBadges.earnedAt })
      .from(userBadges)
      .where(eq(userBadges.userId, user.id))
      .orderBy(desc(userBadges.earnedAt));

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

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      wallet: {
        balance: daily.balance,
        balanceCoins: daily.balance / COIN,
        day: daily.day,
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
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/me hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
