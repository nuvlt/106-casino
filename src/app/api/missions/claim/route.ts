/**
 * POST /api/missions/claim — tamamlanmış görevin ödülünü al.
 *
 * İstemci yalnızca hangi görevi aldığını söyler; tutarı sunucu bilir.
 * Satır (kullanıcı, görev) çiftiyle bulunur, yani kimse başkasının
 * görevini isteyemez. Çift ödeme koruması koşullu UPDATE'te.
 */

import { z } from "zod";
import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { claimMission } from "@/lib/mission-claim";

export const dynamic = "force-dynamic";

const params = z.object({ missionId: z.string().min(1) });

export const POST = gameRoute(
  params,
  async ({ user, body }) => claimMission(db, user.id, body.missionId),
  // Bahis değil; bahis hız sınırını tüketmemeli ama günlük hak yine kurulsun.
  { rateLimited: false },
);
