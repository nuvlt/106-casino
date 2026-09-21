/**
 * Görev ödülünü alma.
 *
 * GÜVENLİK, iki katman:
 *
 * 1. Ödül tutarı istemciden GELMEZ — görev tanımından okunur.
 *
 * 2. Satır her zaman (kullanıcı, görev) çiftiyle aranır; istemci bir
 *    satır kimliği göndermez. Böylece "başkasının satırını iste"
 *    saldırısı diye bir şey kalmıyor: sorgu zaten yalnızca isteği
 *    yapanın satırına bakabiliyor.
 *
 * Çift ödemeye karşı koşullu UPDATE: `claimed_at` yalnızca hâlâ NULL
 * ise yazılır. İki istek aynı anda gelirse ikincisi hiçbir satır
 * döndürmez ve reddedilir — cüzdandaki `WHERE balance >= amount`
 * kalıbının aynısı, kontrol ile yazma arasında aralık bırakmaz.
 */

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/types";
import { ledgerEntries, missions, userMissions, users } from "@/db/schema";
/**
 * Alan hatası — API katmanından bağımsız. `wallet.ts`'teki WalletError
 * ile aynı gerekçe: bu dosya oturum/istek katmanını içeri çekmemeli,
 * böylece testler sunucu kurmadan çalışabiliyor.
 */
export class MissionError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "ALREADY_CLAIMED" | "NOT_COMPLETED",
  ) {
    super(message);
  }
}

export interface ClaimResult {
  missionId: string;
  title: string;
  reward: number;
  balance: number;
}

export async function claimMission(
  db: Db,
  userId: string,
  missionId: string,
): Promise<ClaimResult> {
  return db.transaction(async (tx: Tx) => {
    // Tek işlemde hem sahiplik hem tamamlanmışlık hem de "alınmamış"
    // koşulu aranır. Dönen satır yoksa hangi koşulun düştüğünü ayırmak
    // için ikinci bir okuma yapılır — yalnızca hata mesajı için.
    const [claimed] = await tx
      .update(userMissions)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(userMissions.userId, userId),
          eq(userMissions.missionId, missionId),
          isNotNull(userMissions.completedAt),
          isNull(userMissions.claimedAt),
        ),
      )
      .returning({ id: userMissions.id, missionId: userMissions.missionId });

    if (!claimed) {
      const [row] = await tx
        .select({
          completedAt: userMissions.completedAt,
          claimedAt: userMissions.claimedAt,
        })
        .from(userMissions)
        .where(and(eq(userMissions.userId, userId), eq(userMissions.missionId, missionId)))
        .limit(1);

      if (!row) throw new MissionError("Görev bulunamadı", "NOT_FOUND");
      if (row.claimedAt) throw new MissionError("Bu ödülü zaten aldın", "ALREADY_CLAIMED");
      throw new MissionError("Görev henüz tamamlanmadı", "NOT_COMPLETED");
    }

    // Ödül tutarı görev tanımından; istemcinin söylediğinin hiçbir etkisi yok.
    const [def] = await tx
      .select({ title: missions.title, reward: missions.reward })
      .from(missions)
      .where(eq(missions.id, claimed.missionId))
      .limit(1);

    if (!def) throw new MissionError("Görev tanımı bulunamadı", "NOT_FOUND");

    const [credited] = await tx
      .update(users)
      .set({ balance: sql`${users.balance} + ${def.reward}` })
      .where(eq(users.id, userId))
      .returning({ balance: users.balance });

    const balance = credited!.balance;

    await tx.insert(ledgerEntries).values({
      userId,
      type: "MISSION_REWARD",
      amount: def.reward,
      balanceAfter: balance,
      note: def.title,
    });

    return { missionId: claimed.id, title: def.title, reward: def.reward, balance };
  });
}
