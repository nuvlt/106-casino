/**
 * GET /api/fairness/seeds — oyuncunun tohum çiftleri.
 *
 * AKTİF tohumun serverSeed'i BURADA DA DÖNMEZ; yalnızca hash'i. Aksi
 * halde taahhüt anlamını yitirirdi: oyuncu sonucu önceden hesaplayıp
 * ona göre bahis yapabilirdi. Açılan (döndürülmüş) tohumların serverSeed'i
 * ise tam olarak bu yüzden dönüyor — geçmişi doğrulamak için gerekli.
 */

import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, seedPairs } from "@/db/schema";
import { ApiError, fail, requireUser } from "@/lib/api";
import { ensureActiveSeed } from "@/lib/seeds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const active = await ensureActiveSeed(db, user.id);

    const revealed = await db
      .select({
        id: seedPairs.id,
        serverSeed: seedPairs.serverSeed,
        serverSeedHash: seedPairs.serverSeedHash,
        clientSeed: seedPairs.clientSeed,
        nonce: seedPairs.nonce,
        revealedAt: seedPairs.revealedAt,
      })
      .from(seedPairs)
      .where(and(eq(seedPairs.userId, user.id), eq(seedPairs.active, false)))
      .orderBy(desc(seedPairs.revealedAt))
      .limit(20);

    // Tur sayıları ayrı bir gruplu sorguyla; iç içe alt sorgu yerine
    // bu hem okunur hem de sayının doğruluğu gözle kontrol edilebilir.
    const counts = await db
      .select({ seedPairId: rounds.seedPairId, n: sql<number>`count(*)::int` })
      .from(rounds)
      .where(eq(rounds.userId, user.id))
      .groupBy(rounds.seedPairId);

    const countBySeed = new Map(counts.map((c) => [c.seedPairId, c.n]));

    return NextResponse.json({
      active: {
        id: active.id,
        serverSeedHash: active.serverSeedHash,
        clientSeed: active.clientSeed,
        nonce: active.nonce,
      },
      revealed: revealed.map((p) => ({ ...p, roundCount: countBySeed.get(p.id) ?? 0 })),
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/fairness/seeds hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
