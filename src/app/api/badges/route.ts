/**
 * GET /api/badges — bütün rozetler, kazanılma durumuyla.
 *
 * Kilitli rozetler de dönüyor: hedefi görmek onu kovalamayı sağlıyor.
 * Ödül tutarı da açık, çünkü rozetler kazanıldığı anda ödüyor.
 */

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { userBadges } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { BADGES } from "@/lib/badges";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireUser();

    const mine = await db
      .select({ badgeId: userBadges.badgeId, earnedAt: userBadges.earnedAt })
      .from(userBadges)
      .where(eq(userBadges.userId, me.id))
      .orderBy(desc(userBadges.earnedAt));

    const earnedAt = new Map(mine.map((r) => [r.badgeId, r.earnedAt]));

    const badges = BADGES.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      icon: b.icon,
      tier: b.tier,
      reward: b.reward,
      earnedAt: earnedAt.get(b.id)?.toISOString() ?? null,
    }));

    return NextResponse.json({
      badges,
      earned: mine.length,
      total: BADGES.length,
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/badges hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
