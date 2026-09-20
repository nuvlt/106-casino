/**
 * POST /api/games/hilo/cashout — birikmiş çarpanı öder ve turu kapatır.
 */

import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { getOpenRound, settleOpenRound } from "@/lib/wallet";
import { describe, type HiloSecret } from "@/lib/hilo";
import { roundIdParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = gameRoute(
  roundIdParam,
  async ({ user, body }) => {
    const round = await getOpenRound(db, user.id, body.roundId);
    const secret = round.secret as unknown as HiloSecret;

    // Hiç adım atılmadıysa çekilecek bir şey yok — bahis geri gelmez,
    // çünkü ilk adımın ev avantajı zaten bahse gömülü.
    const payout = Math.floor(round.bet * secret.mult);

    return settleOpenRound(db, {
      userId: user.id,
      roundId: round.id,
      game: "HIGHERLOWER",
      payout: secret.position > 0 ? payout : 0,
      mult: secret.position > 0 ? secret.mult : 0,
      publicState: { ...describe(secret), cashedOut: true },
    });
  },
  { rateLimited: false, ensureWallet: false },
);
