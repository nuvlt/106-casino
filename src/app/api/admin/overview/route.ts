/**
 * GET /api/admin/overview — backoffice özeti.
 *
 * Yalnızca ADMIN. Salt okunur: bu uç hiçbir şey değiştirmez.
 *
 * Buradaki rakamların amacı "ekonomi beklendiği gibi mi işliyor"
 * sorusunu yanıtlamak. En önemlisi GERÇEKLEŞEN RTP: toplam ödeme /
 * toplam bahis. Teorik %95'ten uzun vadede belirgin şekilde saparsa
 * ya bir oyunun tablosu bozulmuştur ya da bir yerde çift ödeme vardır.
 */

import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries, rounds, users } from "@/db/schema";
import { ApiError, fail, requireAdmin } from "@/lib/api";
import { trtDay } from "@/lib/day";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const day = trtDay();
    const dayStart = new Date(`${day}T00:00:00+03:00`);

    const [totals] = await db
      .select({
        roundCount: sql<number>`count(*)::int`,
        wagered: sql<number>`coalesce(sum(${rounds.bet}), 0)::bigint`,
        paid: sql<number>`coalesce(sum(${rounds.payout}), 0)::bigint`,
      })
      .from(rounds)
      .where(eq(rounds.state, "SETTLED"));

    const [todayTotals] = await db
      .select({
        roundCount: sql<number>`count(*)::int`,
        wagered: sql<number>`coalesce(sum(${rounds.bet}), 0)::bigint`,
        paid: sql<number>`coalesce(sum(${rounds.payout}), 0)::bigint`,
        players: sql<number>`count(distinct ${rounds.userId})::int`,
      })
      .from(rounds)
      .where(and(eq(rounds.state, "SETTLED"), gte(rounds.createdAt, dayStart)));

    // Oyun bazında gerçekleşen RTP — sapan oyunu tek bakışta gösterir.
    const perGame = await db
      .select({
        game: rounds.game,
        roundCount: sql<number>`count(*)::int`,
        wagered: sql<number>`coalesce(sum(${rounds.bet}), 0)::bigint`,
        paid: sql<number>`coalesce(sum(${rounds.payout}), 0)::bigint`,
      })
      .from(rounds)
      .where(eq(rounds.state, "SETTLED"))
      .groupBy(rounds.game)
      .orderBy(desc(sql`count(*)`));

    const [openRounds] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rounds)
      .where(eq(rounds.state, "OPEN"));

    const [playerCount] = await db.select({ n: sql<number>`count(*)::int` }).from(users);

    // Defter türlerine göre dağılım — para nereden girip nereye gidiyor.
    const byType = await db
      .select({
        type: ledgerEntries.type,
        total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint`,
        n: sql<number>`count(*)::int`,
      })
      .from(ledgerEntries)
      .groupBy(ledgerEntries.type);

    /**
     * BÜTÜNLÜK KONTROLÜ: defterdeki bütün hareketlerin toplamı, bütün
     * oyuncuların bakiyeleri toplamına EŞİT olmalı. Defter append-only
     * ve her para hareketi oraya da yazıldığı için bu bir değişmezdir.
     *
     * Tutmuyorsa ya bir ödeme deftere yazılmadan yapılmıştır ya da bir
     * tur iki kez ödenmiştir. Bir backoffice'in yakalaması gereken en
     * önemli şey budur; burada tek bakışta görünüyor.
     */
    const [ledgerSum] = await db
      .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint` })
      .from(ledgerEntries);

    const [balanceSum] = await db
      .select({ total: sql<number>`coalesce(sum(${users.balance}), 0)::bigint` })
      .from(users);

    const num = (v: unknown) => Number(v ?? 0);

    return NextResponse.json({
      day,
      players: playerCount?.n ?? 0,
      openRounds: openRounds?.n ?? 0,
      allTime: {
        rounds: totals?.roundCount ?? 0,
        wagered: num(totals?.wagered),
        paid: num(totals?.paid),
      },
      today: {
        rounds: todayTotals?.roundCount ?? 0,
        wagered: num(todayTotals?.wagered),
        paid: num(todayTotals?.paid),
        players: todayTotals?.players ?? 0,
      },
      perGame: perGame.map((g) => ({
        game: g.game,
        rounds: g.roundCount,
        wagered: num(g.wagered),
        paid: num(g.paid),
      })),
      byType: byType.map((t) => ({ type: t.type, total: num(t.total), n: t.n })),
      integrity: {
        ledgerTotal: num(ledgerSum?.total),
        balanceTotal: num(balanceSum?.total),
        ok: num(ledgerSum?.total) === num(balanceSum?.total),
      },
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/admin/overview hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
