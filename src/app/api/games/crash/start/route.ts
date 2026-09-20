/**
 * POST /api/games/crash/start
 *
 * Çöküş noktası burada, tur açılırken üretilir ve `secret` alanına yazılır.
 * İstemciye ASLA gönderilmez — yalnızca turun başlangıç zamanı döner,
 * istemci eğriyi ona göre çizer.
 *
 * Otomatik çekim hedefi verilirse o da gizli duruma yazılır; sonuç
 * tamamen zamandan bağımsız hesaplanır (ağ gecikmesi sonucu etkilemez).
 */

import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { openRound } from "@/lib/wallet";
import { crashPoint } from "@/lib/games/engine";
import { crashStartParams } from "@/lib/validation";
import { CRASH_LAMBDA } from "@/lib/games/config";

export const dynamic = "force-dynamic";

/** Tur en fazla bu kadar sürebilir — 1.000x'e ulaşma süresinin biraz üstü. */
const ROUND_TTL_MS = 120_000;

export const POST = gameRoute(crashStartParams, async ({ user, body }) => {
  const handle = await openRound(db, {
    userId: user.id,
    game: "CRASH",
    bet: body.bet,
    params: { autoCashout: body.autoCashout ?? null },
    idempotencyKey: body.idempotencyKey,
    ttlMs: ROUND_TTL_MS,
    build: (rng) => ({
      // Gizli: çöküş noktası ve (varsa) önceden bağlanmış çekim hedefi.
      secret: { crashPoint: crashPoint(rng), autoCashout: body.autoCashout ?? null },
      // Açık: yalnızca eğrinin parametresi.
      publicState: { lambda: CRASH_LAMBDA },
    }),
  });

  return {
    roundId: handle.roundId,
    bet: handle.bet,
    balance: handle.balance,
    startedAt: handle.startedAt.toISOString(),
    serverNow: new Date().toISOString(),
    lambda: CRASH_LAMBDA,
    autoCashout: body.autoCashout ?? null,
    fairness: handle.fairness,
  };
});
