/**
 * Yarım kalmış Crash turlarının temizlenmesi.
 *
 * Oyuncu uçuş sırasında sekmeyi kapatırsa tur OPEN kalır. İki sorun doğar:
 *   1. "Aynı anda tek tur" kuralı yüzünden oyuncu hiçbir oyunu oynayamaz.
 *   2. Otomatik çekim hedefine ulaşmış bir tur ödenmeden bekler — bu haksızlık.
 *
 * Bu fonksiyon, sonucu ARTIK KESİNLEŞMİŞ turları kapatır: çöküşü geçmiş
 * olanları kayıp, hedefine ulaşmış otomatik çekimleri ise KAZANÇ olarak.
 * Henüz kararı belli olmayan (uçuşu süren) turlara dokunmaz.
 */

import { and, eq } from "drizzle-orm";
import { rounds } from "@/db/schema";
import type { Db } from "@/db/types";
import { settleOpenRound } from "@/lib/wallet";
import { crashMultAt } from "@/lib/games/engine";

interface CrashSecret {
  crashPoint: number;
  autoCashout: number | null;
}

export async function resolveDecidedCrashRounds(db: Db, userId: string): Promise<number> {
  const open = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.state, "OPEN"), eq(rounds.game, "CRASH")));

  let closed = 0;

  for (const r of open) {
    const secret = (r.secret ?? {}) as CrashSecret;
    const crashPoint = Number(secret.crashPoint ?? 100);
    const auto = secret.autoCashout ?? null;

    const elapsed = (Date.now() - r.createdAt.getTime()) / 1000;
    const multNow = crashMultAt(elapsed);

    let cashedOutAt: number | null = null;
    let decided = false;

    if (auto != null) {
      // Karar anı: hedefe ya da çöküşe hangisi önce gelirse.
      const decisionPoint = Math.min(auto, crashPoint);
      if (multNow >= decisionPoint) {
        decided = true;
        cashedOutAt = auto <= crashPoint ? auto : null;
      }
    } else if (multNow > crashPoint) {
      // Manuel oyuncu çekmeden çöküşü geçtiyse tur kaybedilmiştir.
      decided = true;
    }

    if (!decided) continue;

    const won = cashedOutAt !== null;
    await settleOpenRound(db, {
      userId,
      roundId: r.id,
      game: "CRASH",
      payout: won ? Math.floor((r.bet * cashedOutAt!) / 100) : 0,
      mult: won ? cashedOutAt! / 100 : 0,
      publicState: {
        crashPoint: crashPoint / 100,
        cashedOutAt: won ? cashedOutAt! / 100 : null,
        auto: auto != null,
        autoSettled: true,
      },
    });
    closed++;
  }

  return closed;
}
