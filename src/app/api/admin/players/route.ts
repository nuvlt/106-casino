/**
 * GET /api/admin/players — oyuncu listesi (salt okunur).
 *
 * Filtre açılır menüsünü doldurmak ve kimin ne kadar oynadığını görmek
 * için. Hiçbir kişisel veri eklenmiyor: ad ve şirket e-postası zaten
 * Google hesabından geliyor.
 */

import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { playerStats, users } from "@/db/schema";
import { ApiError, fail, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const list = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        balance: users.balance,
        suspendedAt: users.suspendedAt,
        createdAt: users.createdAt,
        rounds: sql<number>`coalesce(${playerStats.roundsPlayed}, 0)::int`,
        wagered: sql<number>`coalesce(${playerStats.totalWagered}, 0)::bigint`,
        peak: sql<number>`coalesce(${playerStats.peakBalance}, 0)::int`,
      })
      .from(users)
      .leftJoin(playerStats, eq(playerStats.userId, users.id))
      .orderBy(desc(sql`coalesce(${playerStats.roundsPlayed}, 0)`))
      .limit(100);

    return NextResponse.json({
      players: list.map((p) => ({ ...p, wagered: Number(p.wagered ?? 0) })),
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/admin/players hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
