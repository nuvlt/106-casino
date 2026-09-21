/**
 * GET /api/fairness/rounds?seedPairId=... — bir tohum çiftinin turları.
 *
 * Yalnızca isteği yapanın turları döner (sorgu userId ile kısıtlı).
 * `secret` sütunu ASLA dönmez: Crash'in çöküş noktası ve Hilo destesi
 * orada durur, onları açmak turu önceden görmek demek olurdu.
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds, seedPairs } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const seedPairId = req.nextUrl.searchParams.get("seedPairId");
    if (!seedPairId) return fail(400, "seedPairId gerekli", "VALIDATION");

    // Tohum çifti gerçekten bu kullanıcının mı?
    const [pair] = await db
      .select({ id: seedPairs.id, active: seedPairs.active })
      .from(seedPairs)
      .where(and(eq(seedPairs.id, seedPairId), eq(seedPairs.userId, user.id)))
      .limit(1);

    if (!pair) return fail(404, "Tohum çifti bulunamadı", "NOT_FOUND");

    const list = await db
      .select({
        id: rounds.id,
        game: rounds.game,
        nonce: rounds.nonce,
        bet: rounds.bet,
        payout: rounds.payout,
        multX4: rounds.multX4,
        params: rounds.params,
        result: rounds.result,
        state: rounds.state,
        createdAt: rounds.createdAt,
      })
      .from(rounds)
      .where(and(eq(rounds.seedPairId, seedPairId), eq(rounds.userId, user.id)))
      .orderBy(asc(rounds.nonce))
      .limit(500);

    return NextResponse.json({ rounds: list, active: pair.active });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/fairness/rounds hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
