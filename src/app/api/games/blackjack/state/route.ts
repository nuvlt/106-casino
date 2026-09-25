/**
 * GET /api/games/blackjack/state — yarım kalan el varsa onu döndürür.
 *
 * Oyuncu el ortasında sayfadan çıkıp dönerse masada kaldığı yerden devam
 * eder (açık tur varken başka oyun oynanamadığı için bu şart). Kapalı kart
 * ve ayakkabı yine gönderilmez.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { gameNotReady, isGameNotReady } from "@/lib/game-routes";
import { describeBj, type BjSecret } from "@/lib/blackjack";
import { finishBlackjack } from "@/lib/blackjack-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [open] = await db
      .select({ id: rounds.id, secret: rounds.secret })
      .from(rounds)
      .where(and(eq(rounds.userId, user.id), eq(rounds.state, "OPEN"), eq(rounds.game, "BLACKJACK")))
      .limit(1);
    if (!open) return NextResponse.json({ roundId: null, state: null });

    const secret = open.secret as unknown as BjSecret;
    if (secret.phase === "done") return NextResponse.json(await finishBlackjack(user.id, open.id, secret));
    return NextResponse.json({ roundId: open.id, state: describeBj(secret) });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    if (isGameNotReady(e)) return gameNotReady();
    console.error("/api/games/blackjack/state hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
