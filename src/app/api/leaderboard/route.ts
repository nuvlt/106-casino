/**
 * GET /api/leaderboard?scope=season|today|multiplier|wagered
 *
 * Ana tablo ZİRVE BAKİYE ile sıralanır: sezon boyunca ulaşılan en yüksek
 * bakiye. Anlık bakiyeyle sıralamak %95 RTP altında risk almayı
 * cezalandırırdı — 8.400'e çıkıp hepsini kaybeden oyuncu tabloda 8.400
 * ile durur, bu da asıl eğlenceli olanı ödüllendirir.
 */

import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyStats, playerStats, users } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { trtDay } from "@/lib/day";

export const dynamic = "force-dynamic";

const SCOPES = ["season", "today", "multiplier", "wagered"] as const;
type Scope = (typeof SCOPES)[number];

const LABELS: Record<Scope, { title: string; unit: "coin" | "mult" }> = {
  season: { title: "Zirve Bakiye", unit: "coin" },
  today: { title: "Günün Kralı", unit: "coin" },
  multiplier: { title: "En Büyük Çarpan", unit: "mult" },
  wagered: { title: "En Çok Oynayan", unit: "coin" },
};

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const raw = req.nextUrl.searchParams.get("scope") ?? "season";
    const scope: Scope = (SCOPES as readonly string[]).includes(raw) ? (raw as Scope) : "season";

    const rows =
      scope === "today"
        ? await db
            .select({
              userId: users.id,
              name: users.name,
              value: dailyStats.peakBalance,
              rounds: dailyStats.roundsPlayed,
            })
            .from(dailyStats)
            .innerJoin(users, eq(dailyStats.userId, users.id))
            .where(eq(dailyStats.day, trtDay()))
            .orderBy(desc(dailyStats.peakBalance))
            .limit(25)
        : await db
            .select({
              userId: users.id,
              name: users.name,
              value:
                scope === "multiplier"
                  ? playerStats.biggestMultX4
                  : scope === "wagered"
                    ? playerStats.totalWagered
                    : playerStats.peakBalance,
              rounds: playerStats.roundsPlayed,
            })
            .from(playerStats)
            .innerJoin(users, eq(playerStats.userId, users.id))
            .orderBy(
              desc(
                scope === "multiplier"
                  ? playerStats.biggestMultX4
                  : scope === "wagered"
                    ? playerStats.totalWagered
                    : playerStats.peakBalance,
              ),
            )
            .limit(25);

    const entries = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: r.name,
      value: r.value,
      rounds: r.rounds,
      isMe: r.userId === me.id,
    }));

    return NextResponse.json({
      scope,
      ...LABELS[scope],
      entries,
      myRank: entries.find((e) => e.isMe)?.rank ?? null,
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/leaderboard hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
