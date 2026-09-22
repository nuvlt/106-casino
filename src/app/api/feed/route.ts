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

    const row = {
      id: feedEvents.id,
      name: users.name,
      game: feedEvents.game,
      payout: feedEvents.payout,
      multX4: feedEvents.multX4,
      createdAt: feedEvents.createdAt,
    };
    const base = () =>
      db.select(row).from(feedEvents).innerJoin(users, eq(feedEvents.userId, users.id));

    // İki liste birbirinden bağımsız — aynı anda.
    const [recent, legendary] = await Promise.all([
      base().orderBy(desc(feedEvents.createdAt)).limit(20),
      base().orderBy(desc(feedEvents.multX4)).limit(5),
    ]);

    return NextResponse.json({ recent, legendary });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/feed hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
