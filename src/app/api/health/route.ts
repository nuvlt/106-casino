/**
 * GET /api/health — sistem sağlığı ve gecikme ölçümü.
 *
 * Sunucu fonksiyonunun hangi bölgede çalıştığını ve veritabanı ile
 * Redis'e bir gidiş-dönüşün kaç milisaniye sürdüğünü gösterir. Bir tur
 * sunucuda yaklaşık 10 veritabanı gidiş-dönüşü yapar; buradaki sayı
 * 10–20 ms'nin üzerindeyse fonksiyon ile veritabanı farklı bölgelerde
 * demektir (bkz. vercel.json "regions" ve Railway servis bölgesi).
 *
 * Yalnızca giriş yapmış kullanıcılara açık; sır içermez.
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ApiError, fail, requireUser } from "@/lib/api";
import { redisPingMs } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Bu örneğin ne zamandır ayakta olduğu — soğuk başlangıcı ayırt etmek için. */
const bootedAt = Date.now();

async function dbPingMs(): Promise<number> {
  const t = performance.now();
  await db.execute(sql`select 1`);
  return performance.now() - t;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const round = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

export async function GET() {
  try {
    await requireUser();

    // İlk ölçüm bağlantı kurulumunu içerebilir; sıcak değer için üç kez
    // ölçüp ortancasını alıyoruz.
    const dbSamples: number[] = [];
    for (let i = 0; i < 3; i++) dbSamples.push(await dbPingMs());
    const redisSamples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const ms = await redisPingMs();
      if (ms != null) redisSamples.push(ms);
    }

    return NextResponse.json({
      region: process.env.VERCEL_REGION ?? "yerel",
      instanceAgeSec: Math.round((Date.now() - bootedAt) / 1000),
      dbMs: round(median(dbSamples)),
      redisMs: redisSamples.length ? round(median(redisSamples)) : null,
    });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("/api/health hatası:", e);
    return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
  }
}
