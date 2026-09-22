/**
 * GET /api/history — oyuncunun kendi tur geçmişi.
 *
 *   ?game=WHEEL        yalnızca o oyun (isteğe bağlı)
 *   ?cursor=<iso>_<id> bir önceki sayfanın son satırından devam
 *
 * Her sorgu `rounds.userId = oturumdaki kullanıcı` ile sınırlı; başka
 * birinin turu hiçbir parametreyle görülemez. `secret` sütunu (açık
 * turların gizli durumu) hiçbir zaman seçilmez; açık turların sonucu da
 * gönderilmez.
 *
 * İlk sayfada (cursor yokken) özet de döner: bugünkü ve toplam tur
 * sayısı, yatırılan ve geri gelen tutar.
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { dailyStats, gameEnum, playerStats, rounds } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { trtDay } from "@/lib/day";

export const dynamic = "force-dynamic";

const PAGE = 30;
const GAMES = gameEnum.enumValues;
type Game = (typeof GAMES)[number];

/**
 * İmleç: "<created_at, mikrosaniye hassasiyetle>_<id>".
 * JS Date yalnızca milisaniye taşır; aynı transaction'da açılan turlar
 * (çoklu top Plinko gibi) mikrosaniyesine kadar aynı zamanı paylaşır.
 * Zaman metin olarak taşınıp veritabanında çözülür ki sayfa sınırında
 * hiçbir tur atlanmasın ya da iki kez gelmesin.
 */
const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)_([0-9a-f-]{36})$/i;

function parseCursor(raw: string | null): { at: string; id: string } | null {
  const m = raw ? CURSOR_RE.exec(raw) : null;
  return m ? { at: m[1]!, id: m[2]! } : null;
}

const createdAtText = sql<string>`to_char(${rounds.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const params = req.nextUrl.searchParams;

    const rawGame = params.get("game");
    const game = rawGame && (GAMES as readonly string[]).includes(rawGame) ? (rawGame as Game) : null;
    const rawCursor = params.get("cursor");
    const cursor = parseCursor(rawCursor);
    if (rawCursor && !cursor) throw new ApiError(400, "Geçersiz sayfa imleci", "BAD_CURSOR");

    const filters: SQL[] = [eq(rounds.userId, user.id)];
    if (game) filters.push(eq(rounds.game, game));
    if (cursor) {
      // (created_at, id) < (imleç) — sıralamayla birebir aynı ölçüt.
      filters.push(sql`(${rounds.createdAt}, ${rounds.id}) < (${cursor.at}::timestamptz, ${cursor.id})`);
    }

    const listQuery = db
      .select({
        id: rounds.id,
        game: rounds.game,
        state: rounds.state,
        bet: rounds.bet,
        payout: rounds.payout,
        multX4: rounds.multX4,
        result: rounds.result,
        nonce: rounds.nonce,
        createdAt: rounds.createdAt,
        cursorAt: createdAtText,
      })
      .from(rounds)
      .where(and(...filters))
      .orderBy(desc(rounds.createdAt), desc(rounds.id))
      .limit(PAGE + 1);

    // Özet yalnızca ilk sayfada; liste ile aynı anda sorulur.
    const summaryQuery = cursor
      ? null
      : Promise.all([
          db
            .select({
              rounds: playerStats.roundsPlayed,
              wagered: playerStats.totalWagered,
              won: playerStats.totalWon,
            })
            .from(playerStats)
            .where(eq(playerStats.userId, user.id))
            .limit(1),
          db
            .select({ rounds: dailyStats.roundsPlayed, wagered: dailyStats.wageredToday })
            .from(dailyStats)
            .where(and(eq(dailyStats.userId, user.id), eq(dailyStats.day, trtDay())))
            .limit(1),
        ]);

    const [rows, summaryRows] = await Promise.all([listQuery, summaryQuery]);

    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    const last = page.at(-1);

    let summary = null;
    if (summaryRows) {
      const [[all], [today]] = summaryRows;
      summary = {
        total: { rounds: all?.rounds ?? 0, wagered: all?.wagered ?? 0, won: all?.won ?? 0 },
        today: { rounds: today?.rounds ?? 0, wagered: today?.wagered ?? 0 },
      };
    }

    return NextResponse.json({
      rounds: page.map((r) => ({
        id: r.id,
        game: r.game,
        state: r.state,
        bet: r.bet,
        payout: r.payout,
        mult: r.multX4 / 10_000,
        // Açık turun ara durumu gösterilmez; biten turun sonucu gizli değildir.
        result: r.state === "OPEN" ? null : r.result,
        nonce: r.nonce,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore && last ? `${last.cursorAt}_${last.id}` : null,
      summary,
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/history hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
