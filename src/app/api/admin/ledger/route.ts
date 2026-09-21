/**
 * GET /api/admin/ledger — hareket listesi (salt okunur).
 *
 * Defter append-only: her satırda işlem tutarı ve o andaki bakiye
 * (`balanceAfter`) yazılı. Bu yüzden burada yapılan tek şey okumak;
 * bakiye düzeltme gibi yazma işlemleri bilerek YOK. Elle düzeltme
 * defterle bakiye arasındaki bağı koparır ve "bakiye nasıl bu hale
 * geldi" sorusunu cevaplanamaz kılar.
 *
 * Filtreler: oyuncu (userId), hareket türü, sayfa.
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries, rounds, users } from "@/db/schema";
import { ApiError, fail, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

const PAGE = 50;

const TYPES = [
  "DAILY_RESET", "STREAK_BONUS", "MISSION_REWARD", "BADGE_REWARD",
  "BET", "PAYOUT", "REFUND", "ADMIN_ADJUST",
] as const;
type LedgerType = (typeof TYPES)[number];

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;

    const filters: SQL[] = [];

    const userId = sp.get("userId");
    if (userId) filters.push(eq(ledgerEntries.userId, userId));

    const type = sp.get("type");
    if (type && (TYPES as readonly string[]).includes(type)) {
      filters.push(eq(ledgerEntries.type, type as LedgerType));
    }

    // Anahtar tabanlı sayfalama: createdAt'ten küçükler. Offset'e göre
    // hem daha hızlı hem de araya yeni kayıt girince sayfa kaymıyor.
    const before = sp.get("before");
    if (before) {
      const d = new Date(before);
      if (!Number.isNaN(d.getTime())) filters.push(lt(ledgerEntries.createdAt, d));
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const list = await db
      .select({
        id: ledgerEntries.id,
        userId: ledgerEntries.userId,
        userName: users.name,
        userEmail: users.email,
        type: ledgerEntries.type,
        amount: ledgerEntries.amount,
        balanceAfter: ledgerEntries.balanceAfter,
        note: ledgerEntries.note,
        createdAt: ledgerEntries.createdAt,
        roundId: ledgerEntries.roundId,
        game: rounds.game,
        multX4: rounds.multX4,
      })
      .from(ledgerEntries)
      .innerJoin(users, eq(ledgerEntries.userId, users.id))
      .leftJoin(rounds, eq(ledgerEntries.roundId, rounds.id))
      .where(where)
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(PAGE + 1);

    const hasMore = list.length > PAGE;
    const page = hasMore ? list.slice(0, PAGE) : list;

    return NextResponse.json({
      entries: page,
      nextBefore: hasMore ? page.at(-1)?.createdAt : null,
      types: TYPES,
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/admin/ledger hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
