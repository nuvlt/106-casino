/**
 * GET/POST /api/cron/daily — her gün 00:00 TRT (Vercel Cron, bkz. vercel.json).
 *
 * Kullanıcılar zaten /api/me üzerinden günlük haklarını alıyor; bu iş
 * yalnızca o güne ait görevleri önceden üretir ve süresi geçmiş açık
 * turları kapatır. Yani cron çalışmasa bile oyun durmaz — sadece
 * temizlik gecikir.
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { missions as missionsTable, rounds } from "@/db/schema";
import { missionsForDay } from "@/lib/missions";
import { trtDay } from "@/lib/day";
import { env } from "@/lib/env";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Vercel Cron, Authorization başlığıyla çağırır.
  const auth = req.headers.get("authorization");
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
    return fail(401, "Yetkisiz", "UNAUTHORIZED");
  }

  const day = trtDay();

  // O günün görevlerini önceden oluştur.
  let created = 0;
  for (const t of missionsForDay(day)) {
    const inserted = await db
      .insert(missionsTable)
      .values({
        day,
        kind: t.kind,
        target: t.target,
        reward: t.reward,
        title: t.title,
        subtitle: t.subtitle,
      })
      .onConflictDoNothing()
      .returning({ id: missionsTable.id });
    created += inserted.length;
  }

  // Süresi geçmiş açık turları kaybedilmiş sayarak kapat
  // (sekme kapandı, tarayıcı çöktü — bahis zaten düşülmüştü).
  const closed = await db
    .update(rounds)
    .set({ state: "SETTLED", settledAt: new Date() })
    .where(and(eq(rounds.state, "OPEN"), lt(rounds.expiresAt, new Date())))
    .returning({ id: rounds.id });

  return NextResponse.json({ day, missionsCreated: created, roundsClosed: closed.length });
}

// Vercel Cron işleri GET isteği gönderir (Authorization: Bearer CRON_SECRET).
export const GET = POST;
