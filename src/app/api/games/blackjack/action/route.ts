/**
 * POST /api/games/blackjack/action — kart çek / dur / ikiye katla.
 *
 * `step` istemcinin gördüğü hamle sayısıdır; sunucudaki elle uyuşmazsa
 * hamle reddedilir (aynı "kart çek" iki kez işlenmesin). İkiye katlamada
 * ek bahis ve yeni durum tek transaction'da yazılır.
 */

import { db } from "@/db";
import { ApiError } from "@/lib/api";
import { gameRoute } from "@/lib/game-routes";
import { getOpenRound, raiseOpenRoundBet, updateOpenRoundAtStep } from "@/lib/wallet";
import { bjAct, type BjState } from "@/lib/games/engine";
import { describeBj, type BjSecret } from "@/lib/blackjack";
import { finishBlackjack } from "@/lib/blackjack-server";
import { blackjackActionParams } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = gameRoute(
  blackjackActionParams,
  async ({ user, body }) => {
    const round = await getOpenRound(db, user.id, body.roundId);
    const secret = round.secret as unknown as BjSecret;

    // El önceki istekte bitmiş ama kapanışı yarım kalmışsa: şimdi kapat.
    if (secret.phase === "done") return finishBlackjack(user.id, round.id, secret);

    if (body.step !== secret.actions.length) {
      throw new ApiError(409, "Bu el güncellendi, ekran yenileniyor", "STALE_STEP");
    }

    let next: BjState;
    try {
      next = bjAct(secret, body.action);
    } catch {
      throw new ApiError(409, "Bu hamle şu an yapılamaz", "INVALID_ACTION");
    }
    const nextSecret: BjSecret = { ...next, bet: secret.bet };
    const state = describeBj(nextSecret);

    let balance: number | undefined;
    if (body.action === "double") {
      ({ balance } = await raiseOpenRoundBet(db, {
        userId: user.id,
        roundId: round.id,
        extra: secret.bet,
        expectedBet: secret.bet,
        step: body.step,
        secret: nextSecret,
        publicState: state,
      }));
    } else {
      const ok = await updateOpenRoundAtStep(db, {
        userId: user.id,
        roundId: round.id,
        step: body.step,
        secret: nextSecret,
        publicState: state,
      });
      if (!ok) throw new ApiError(409, "Bu el güncellendi, ekran yenileniyor", "STALE_STEP");
    }

    if (nextSecret.phase === "done") return finishBlackjack(user.id, round.id, nextSecret);
    return { roundId: round.id, state, balance };
  },
  { rateLimited: true, ensureWallet: false },
);
