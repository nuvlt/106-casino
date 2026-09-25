/**
 * POST /api/games/blackjack/start — bahis düşülür, 6 deste karılır, ilk
 * dört kart dağıtılır. Doğal blackjack (oyuncuda ya da krupiyede) varsa el
 * aynı istekte kapanır.
 */

import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { getOpenRound, openRound } from "@/lib/wallet";
import { bjStart } from "@/lib/games/engine";
import { describeBj, type BjPublic, type BjSecret } from "@/lib/blackjack";
import { finishBlackjack } from "@/lib/blackjack-server";
import { BJ_ROUND_TTL_MS } from "@/lib/games/config";
import { blackjackStartParams } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = gameRoute(blackjackStartParams, async ({ user, body }) => {
  const handle = await openRound(db, {
    userId: user.id,
    game: "BLACKJACK",
    bet: body.bet,
    params: {},
    idempotencyKey: body.idempotencyKey,
    ttlMs: BJ_ROUND_TTL_MS,
    build: (rng) => {
      const secret: BjSecret = { ...bjStart(rng), bet: body.bet };
      return { secret, publicState: describeBj(secret) };
    },
  });

  const state = handle.publicState as unknown as BjPublic;
  if (state.phase === "done") {
    // Doğal blackjack: el açılır açılmaz biter. Aynı anahtarla tekrar
    // gelinmişse el zaten kapanmış olabilir — o zaman olduğu gibi dön.
    const open = await getOpenRound(db, user.id, handle.roundId).catch(() => null);
    if (open) return finishBlackjack(user.id, open.id, open.secret as unknown as BjSecret);
  }

  return { roundId: handle.roundId, state, balance: handle.balance, fairness: handle.fairness };
});
