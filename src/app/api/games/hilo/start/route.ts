/**
 * POST /api/games/hilo/start — deste karılır, ilk kart açılır.
 * Destenin tamamı `secret` alanında kalır; istemci yalnızca açık kartı görür.
 */

import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { openRound } from "@/lib/wallet";
import { hlNewRound } from "@/lib/games/engine";
import { describe, type HiloSecret } from "@/lib/hilo";
import { hiloStartParams } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ROUND_TTL_MS = 30 * 60_000; // yarım saat içinde bitirilmeli

export const POST = gameRoute(hiloStartParams, async ({ user, body }) => {
  const handle = await openRound(db, {
    userId: user.id,
    game: "HIGHERLOWER",
    bet: body.bet,
    params: {},
    idempotencyKey: body.idempotencyKey,
    ttlMs: ROUND_TTL_MS,
    build: (rng) => {
      const state = hlNewRound(rng);
      const secret: HiloSecret = { deck: state.deck, position: 0, mult: 1 };
      return { secret, publicState: describe(secret) };
    },
  });

  return {
    roundId: handle.roundId,
    bet: handle.bet,
    balance: handle.balance,
    state: handle.publicState,
    fairness: handle.fairness,
  };
});
