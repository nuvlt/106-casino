/**
 * Görev ilerlemesi — her tur kapandığında, turun transaction'ı içinde.
 *
 * Çoğu görev artımlı güncellenir (tur sayısı, çevrim). Yalnızca
 * "farklı oyun oyna" görevinde o günün turlarına bakmak gerekir.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { missions, rounds, userMissions } from "@/db/schema";
import type { Tx } from "@/db/types";

export interface RoundFacts {
  userId: string;
  day: string;
  won: boolean;
  bet: number;
  multX4: number;
  currentWinStreak: number;
}

/**
 * O güne ait, henüz tamamlanmamış görevlerin ilerlemesini günceller ve
 * hedefe ulaşanları tamamlandı olarak işaretler.
 */
export async function advanceMissions(tx: Tx, facts: RoundFacts): Promise<void> {
  const open = await tx
    .select({
      userMissionId: userMissions.id,
      progress: userMissions.progress,
      kind: missions.kind,
      target: missions.target,
    })
    .from(userMissions)
    .innerJoin(missions, eq(userMissions.missionId, missions.id))
    .where(
      and(
        eq(userMissions.userId, facts.userId),
        eq(missions.day, facts.day),
        isNull(userMissions.completedAt),
      ),
    );

  if (open.length === 0) return;

  // "Farklı oyun" görevi varsa o günün turlarından say.
  let distinctGames = 0;
  if (open.some((m) => m.kind === "PLAY_N_GAMES")) {
    const [row] = await tx
      .select({ n: sql<number>`count(distinct ${rounds.game})::int` })
      .from(rounds)
      .where(and(eq(rounds.userId, facts.userId), eq(rounds.day, facts.day)));
    distinctGames = row?.n ?? 0;
  }

  for (const m of open) {
    let progress = m.progress;

    switch (m.kind) {
      case "PLAY_N_ROUNDS":
        progress += 1;
        break;
      case "WIN_N_ROUNDS":
        if (facts.won) progress += 1;
        break;
      case "WAGER_TOTAL":
        progress += facts.bet;
        break;
      case "HIT_MULTIPLIER":
        progress = Math.max(progress, facts.multX4);
        break;
      case "WIN_STREAK":
        progress = Math.max(progress, facts.currentWinStreak);
        break;
      case "PLAY_N_GAMES":
        progress = Math.max(progress, distinctGames);
        break;
    }

    if (progress === m.progress) continue;

    await tx
      .update(userMissions)
      .set({
        progress,
        completedAt: progress >= m.target ? new Date() : null,
      })
      .where(eq(userMissions.id, m.userMissionId));
  }
}
