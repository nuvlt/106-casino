/**
 * POST /api/games/crash/cashout
 *
 * Turu kapatır — kazanarak ya da kaybederek. İstemci çöküşü gördüğünde de
 * bu ucu çağırır; hangi durumda olduğuna SUNUCU karar verir.
 *
 * ÇARPAN İSTEMCİDEN ALINMAZ. Sunucu, turun başlangıç zaman damgası ile
 * isteğin geldiği anın farkından çarpanı kendisi hesaplar.
 *
 * Tolerans YOKTUR. Şartnamenin ilk halinde "ağ gecikmesi için 150 ms
 * tolerans" vardı; bu sömürülebilir bir açıktı — oyuncu çöküşü ekranda
 * gördükten sonra istek atıp, çöküşten hemen önceki çarpanı talep
 * edebilirdi. Gecikmeden etkilenmek istemeyen oyuncu, tur başında
 * otomatik çekim hedefi belirler: o hesap zamandan tamamen bağımsızdır.
 */

import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { getOpenRound, settleOpenRound } from "@/lib/wallet";
import { crashMultAt } from "@/lib/games/engine";
import { roundIdParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = gameRoute(
  roundIdParam,
  async ({ user, body }) => {
    const round = await getOpenRound(db, user.id, body.roundId);

    const crashPoint = Number(round.secret.crashPoint ?? 100);
    const autoCashout = round.secret.autoCashout as number | null;

    let cashedOutAt: number | null = null;

    if (autoCashout != null) {
      // Hedef tur başında bağlandı: sonuç zamandan bağımsız.
      cashedOutAt = autoCashout <= crashPoint ? autoCashout : null;
    } else {
      // Manuel çekim: sunucunun isteği aldığı an esastır.
      const elapsedSec = (Date.now() - round.createdAt.getTime()) / 1000;
      const multNow = crashMultAt(elapsedSec);
      cashedOutAt = multNow <= crashPoint ? multNow : null;
    }

    const won = cashedOutAt !== null;
    const payout = won ? Math.floor((round.bet * cashedOutAt!) / 100) : 0;
    const mult = won ? cashedOutAt! / 100 : 0;

    return settleOpenRound(db, {
      userId: user.id,
      roundId: round.id,
      game: "CRASH",
      payout,
      mult,
      publicState: {
        crashPoint: crashPoint / 100,
        cashedOutAt: won ? cashedOutAt! / 100 : null,
        auto: autoCashout != null,
      },
    });
  },
  // Çekim yeni para harcamaz; günlük hak/tohum kurulumuna da gerek yok.
  { rateLimited: false, ensureWallet: false },
);
