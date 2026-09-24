/**
 * GET /api/invite — oyuncunun kişisel davet kodu ve davet karnesi.
 *
 * Link istemcide kurulur (window.location.origin + /davet/<kod>) ki
 * alan adı değişse de (106-casino → 106casino) doğru adres paylaşılsın.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { ApiError, fail, requireUser } from "@/lib/api";
import { inviteSummary } from "@/lib/referral";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await inviteSummary(db, user.id));
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    // Tablolar henüz kurulmadıysa buraya düşer — arayüz kartı gizler.
    console.error("/api/invite hatası:", e);
    return fail(503, "Davet sistemi şu an kullanılamıyor", "UNAVAILABLE");
  }
}
