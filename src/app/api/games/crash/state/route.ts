/**
 * POST /api/games/crash/state — "turum hâlâ yaşıyor mu?"
 *
 * İstemci uçuş boyunca bunu sorar. Cevap geleceği SIZDIRMAZ: yalnızca
 * içinde bulunulan anı bildirir. Tur bu çağrı sırasında bitmişse burada
 * defterlenir ve gerçek çöküş noktası açılır.
 *
 * Bu uç olmadan istemci çarpanı sonsuza kadar büyütmeye devam eder ve
 * oyuncuya çoktan patlamış bir turu yükseliyormuş gibi gösterirdi.
 */

import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { pollCrashRound } from "@/lib/crash";
import { roundIdParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = gameRoute(
  roundIdParam,
  async ({ user, body }) => pollCrashRound(db, user.id, body.roundId),
  // Para harcamaz; sık çağrıldığı için bahis hız sınırına takılmamalı.
  { rateLimited: false, ensureWallet: false },
);
