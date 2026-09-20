/**
 * GET /api/feed — canlı kazanç akışı.
 *
 * Son olaylar + "en güzel anlar" olarak sabitlenenler. 25 kişilik bir
 * ortamda websocket'e gerek yok; istemci birkaç saniyede bir yeniler.
 */

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { feedEvents, users } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();

    const recent = await db
      .select({
        id: feedEvents.id,
        name: users.name,
        game: feedEvents.game,
        payout: feedEvents.payout,
        multX4: feedEvents.multX4,
        createdAt: feedEvents.createdAt,
      })
      .from(feedEvents)
      .innerJoin(users, eq(feedEvents.userId, users.id))
      .orderBy(desc(feedEvents.createdAt))
      .limit(20);

    const legendary = await db
      .select({
        id: feedEvents.id,
        name: users.name,
        game: feedEvents.game,
        payout: feedEvents.payout,
        multX4: feedEvents.multX4,
        createdAt: feedEvents.createdAt,
      })
      .from(feedEvents)
      .innerJoin(users, eq(feedEvents.userId, users.id))
      .orderBy(desc(feedEvents.multX4))
      .limit(5);

    return NextResponse.json({ recent, legendary });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/feed hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
