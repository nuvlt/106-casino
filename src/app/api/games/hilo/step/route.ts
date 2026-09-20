/**
 * POST /api/games/hilo/step — tek tahmin.
 *
 * Kaybedilirse tur aynı istekte kapanır (ödeme 0). Kazanılırsa birikmiş
 * çarpan güncellenir ve tur açık kalır; oyuncu dilediğinde çeker.
 */

import { db } from "@/db";
import { fail } from "@/lib/api";
import { gameRoute } from "@/lib/game-routes";
import { getOpenRound, settleOpenRound, updateOpenRound } from "@/lib/wallet";
import { hlStep } from "@/lib/games/engine";
import { describe, type HiloSecret } from "@/lib/hilo";
import { hiloStepParams } from "@/lib/validation";
import { HL_MAX_STEPS } from "@/lib/games/config";

export const dynamic = "force-dynamic";

export const POST = gameRoute(
  hiloStepParams,
  async ({ user, body }) => {
    const round = await getOpenRound(db, user.id, body.roundId);
    const secret = round.secret as unknown as HiloSecret;

    const before = describe(secret);
    const p = body.guess === "higher" ? before.odds.higher : before.odds.lower;

    // Olasılığı sıfır olan taraf seçilemez (istemci o düğmeyi zaten kapatır).
    if (p <= 0) {
      return { error: "Bu tahmin imkânsız", code: "IMPOSSIBLE_GUESS" };
    }
    if (secret.position >= HL_MAX_STEPS) {
      return { error: "Adım sınırına ulaşıldı, çekim yapın", code: "MAX_STEPS" };
    }

    const result = hlStep({ deck: secret.deck, position: secret.position, mult: secret.mult }, body.guess);

    if (!result.won) {
      // Kaybetti — tur burada kapanır.
      const settled = await settleOpenRound(db, {
        userId: user.id,
        roundId: round.id,
        game: "HIGHERLOWER",
        payout: 0,
        mult: 0,
        publicState: {
          ...describe({ ...secret, position: secret.position + 1 }),
          lost: true,
          guess: body.guess,
        },
      });
      return { ...settled, won: false, state: settled.result };
    }

    const next: HiloSecret = {
      deck: secret.deck,
      position: result.state.position,
      mult: result.state.mult,
    };
    const publicState = describe(next);

    await updateOpenRound(db, round.id, { secret: next, publicState });

    return {
      won: true,
      roundId: round.id,
      bet: round.bet,
      state: publicState,
      /** Şu an çekilirse ödenecek tutar (centicoin). */
      cashoutValue: Math.floor(round.bet * next.mult),
    };
  },
  { rateLimited: true, ensureWallet: false },
);
