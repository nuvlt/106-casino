/**
 * Ekonomi — günlük hak, seri, görev ataması.
 *
 * TEMEL KURAL: coin BİRİKMEZ. Her gün 00:00 TRT'de bakiye 1.000 coin'e
 * SET edilir (eklenmez). Sebebi matematiksel: RTP %95 iken biriktirme
 * serbest olsaydı hiç oynamayan kişi hafta sonunda en zengin olurdu,
 * çok oynayanın bakiyesi ise her çevirimde erirdi — sıralama "en çok kim
 * oynamadı" tablosuna dönerdi. Kullan-ya-da-kaybet bunu tersine çevirir.
 *
 * Bu fonksiyon HER kimliği doğrulanmış istekte çağrılabilir; idempotenttir.
 * Yarış durumunda (user_id, day) tekil indeksi ikinci yazımı reddeder.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  dailyClaims,
  dailyStats,
  ledgerEntries,
  missions as missionsTable,
  playerStats,
  userMissions,
  users,
} from "@/db/schema";
import type { DbOrTx, Db } from "@/db/types";
import { DAILY_GRANT, STREAK_BONUS } from "@/lib/games/config";
import { previousDay, trtDay } from "@/lib/day";
import { missionsForDay } from "@/lib/missions";

export interface DailyState {
  day: string;
  balance: number;
  streakDay: number;
  granted: number;
  /** Bu çağrıda mı verildi, yoksa zaten alınmış mıydı? */
  freshlyGranted: boolean;
}

/** Seri gününe düşen ekstra hak (7. günden sonrası sabit). */
export function streakBonusFor(streakDay: number): number {
  const idx = Math.min(Math.max(streakDay, 1), STREAK_BONUS.length) - 1;
  return STREAK_BONUS[idx] ?? 0;
}

/**
 * Bugünün hakkını garanti eder. Zaten alınmışsa hiçbir şey yazmaz.
 */
export async function ensureDailyState(db: Db, userId: string): Promise<DailyState> {
  const day = trtDay();

  const existing = await db
    .select()
    .from(dailyClaims)
    .where(and(eq(dailyClaims.userId, userId), eq(dailyClaims.day, day)))
    .limit(1);

  if (existing.length > 0) {
    const claim = existing[0]!;
    const [user] = await db
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return {
      day,
      balance: user?.balance ?? 0,
      streakDay: claim.streakDay,
      granted: claim.granted,
      freshlyGranted: false,
    };
  }

  return db.transaction(async (tx) => {
    // Seriyi belirle: dün de giriş yapılmışsa devam, yoksa sıfırdan.
    const [yesterdayClaim] = await tx
      .select({ streakDay: dailyClaims.streakDay })
      .from(dailyClaims)
      .where(and(eq(dailyClaims.userId, userId), eq(dailyClaims.day, previousDay(day))))
      .limit(1);

    const streakDay = yesterdayClaim ? yesterdayClaim.streakDay + 1 : 1;
    const bonus = streakBonusFor(streakDay);
    const granted = DAILY_GRANT + bonus;

    // Tekil indeks yarışı çözer: ikinci istek buraya giremez.
    const inserted = await tx
      .insert(dailyClaims)
      .values({ userId, day, streakDay, granted })
      .onConflictDoNothing()
      .returning({ id: dailyClaims.id });

    if (inserted.length === 0) {
      // Başka bir istek bizden önce davrandı — onun sonucunu döndür.
      const [claim] = await tx
        .select()
        .from(dailyClaims)
        .where(and(eq(dailyClaims.userId, userId), eq(dailyClaims.day, day)))
        .limit(1);
      const [user] = await tx
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return {
        day,
        balance: user?.balance ?? 0,
        streakDay: claim?.streakDay ?? streakDay,
        granted: claim?.granted ?? granted,
        freshlyGranted: false,
      };
    }

    // Bakiyeyi SET et (ekleme değil) — biriktirme yok.
    const [before] = await tx
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const previousBalance = before?.balance ?? 0;

    await tx.update(users).set({ balance: DAILY_GRANT }).where(eq(users.id, userId));

    await tx.insert(ledgerEntries).values({
      userId,
      type: "DAILY_RESET",
      amount: DAILY_GRANT - previousBalance,
      balanceAfter: DAILY_GRANT,
      note: `Günlük hak — ${day}`,
    });

    if (bonus > 0) {
      await tx
        .update(users)
        .set({ balance: sql`${users.balance} + ${bonus}` })
        .where(eq(users.id, userId));
      await tx.insert(ledgerEntries).values({
        userId,
        type: "STREAK_BONUS",
        amount: bonus,
        balanceAfter: granted,
        note: `${streakDay}. gün serisi`,
      });
    }

    // İstatistik: seri ve zirve bakiye.
    await tx
      .insert(playerStats)
      .values({
        userId,
        currentStreak: streakDay,
        longestStreak: streakDay,
        peakBalance: granted,
        peakBalanceAt: new Date(),
      })
      .onConflictDoUpdate({
        target: playerStats.userId,
        set: {
          currentStreak: streakDay,
          longestStreak: sql`greatest(${playerStats.longestStreak}, ${streakDay})`,
          peakBalance: sql`greatest(${playerStats.peakBalance}, ${granted})`,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(dailyStats)
      .values({ userId, day, peakBalance: granted })
      .onConflictDoNothing();

    await assignMissions(tx, userId, day);

    return { day, balance: granted, streakDay, granted, freshlyGranted: true };
  });
}

/**
 * O günün görevlerini oluşturur (yoksa) ve kullanıcıya bağlar.
 * Görev tanımları gün dizesinden deterministik üretildiği için
 * cron çalışmasa bile ilk giren kullanıcı onları yaratır.
 */
export async function assignMissions(tx: DbOrTx, userId: string, day: string): Promise<void> {
  const templates = missionsForDay(day);

  for (const t of templates) {
    const [row] = await tx
      .insert(missionsTable)
      .values({
        day,
        kind: t.kind,
        target: t.target,
        reward: t.reward,
        title: t.title,
        subtitle: t.subtitle,
      })
      .onConflictDoNothing()
      .returning({ id: missionsTable.id });

    let missionId = row?.id;
    if (!missionId) {
      const [existing] = await tx
        .select({ id: missionsTable.id })
        .from(missionsTable)
        .where(
          and(
            eq(missionsTable.day, day),
            eq(missionsTable.kind, t.kind),
            eq(missionsTable.target, t.target),
          ),
        )
        .limit(1);
      missionId = existing?.id;
    }
    if (!missionId) continue;

    await tx.insert(userMissions).values({ userId, missionId }).onConflictDoNothing();
  }
}
