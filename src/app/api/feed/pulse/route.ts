/**
 * GET /api/feed/pulse?after=<ISO> — her sayfada çıkan "büyük kazanç"
 * bildirimi için hafif uç.
 *
 * /api/feed ana sayfadaki kayan şeridi besler (son 20 olay + efsaneler).
 * Bu uç ise yalnızca `after` anından SONRAKİ, eşiği aşan ve BAŞKASINA ait
 * olayları döndürür — kendi kazancını oyuncu zaten ekranında görüyor.
 *
 * `after` verilmezse olay döndürmez, yalnızca imleç verir: sayfayı açan
 * kişiye eski kazançlar "yeni" gibi gösterilmesin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gt, ne, or, gte } from "drizzle-orm";
import { db } from "@/db";
import { feedEvents, users } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { COIN } from "@/lib/games/config";

export const dynamic = "force-dynamic";

/** Bildirim eşiği — kayan şeritten (5x / 500 coin) daha seçici. */
const PULSE_MULT_X4 = 10 * 10_000;
const PULSE_PAYOUT = 1_000 * COIN;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();

    const afterParam = req.nextUrl.searchParams.get("after");
    const after = afterParam ? new Date(afterParam) : null;

    if (!after || Number.isNaN(after.getTime())) {
      // İlk çağrı: imleci en son olaya (yoksa şimdiye) koy.
      const [latest] = await db
        .select({ createdAt: feedEvents.createdAt })
        .from(feedEvents)
        .orderBy(desc(feedEvents.createdAt))
        .limit(1);
      const cursor = latest && latest.createdAt > new Date() ? latest.createdAt : new Date();
      return NextResponse.json({ cursor: cursor.toISOString(), events: [] });
    }

    const events = await db
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
      .where(
        and(
          gt(feedEvents.createdAt, after),
          ne(feedEvents.userId, user.id),
          or(gte(feedEvents.multX4, PULSE_MULT_X4), gte(feedEvents.payout, PULSE_PAYOUT)),
        ),
      )
      .orderBy(desc(feedEvents.createdAt))
      .limit(3);

    // İmleç yalnızca ileri gider; olay yoksa aynen geri döner.
    const newest = events[0]?.createdAt;
    return NextResponse.json({
      cursor: (newest && newest > after ? newest : after).toISOString(),
      events: events.reverse(), // eskiden yeniye — sırayla gösterilsin
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/feed/pulse hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
