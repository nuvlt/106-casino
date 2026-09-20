/**
 * GELİŞTİRME GİRİŞİ — yalnızca yerel makinede.
 *
 * Google OAuth kurmadan uygulamayı denemek için. Üç koşul birden
 * sağlanmazsa uç hiç var olmamış gibi 404 döner:
 *   • NODE_ENV === "development"   (üretim derlemesinde asla açılmaz)
 *   • DEV_LOGIN === "1"            (açıkça açılmalı)
 *   • İstek localhost'tan gelmeli  (dışarıdan erişilemez)
 *
 * Auth.js'in Credentials sağlayıcısı veritabanı oturumlarıyla
 * çalışmadığı için oturum satırı doğrudan burada yazılır — bu da
 * bu ucun neden üretime asla çıkmaması gerektiğinin bir başka sebebi.
 */

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { sessions, users } from "@/db/schema";
import { env, isAdminEmail } from "@/lib/env";

export const dynamic = "force-dynamic";

function devLoginAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_LOGIN !== "1") return false;
  const host = req.headers.get("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export async function GET(req: NextRequest) {
  if (!devLoginAllowed(req)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  await ensureSchema();

  const email = (req.nextUrl.searchParams.get("email") ?? `test@${env.allowedDomain}`).toLowerCase();
  const name = req.nextUrl.searchParams.get("name") ?? "Test Kullanıcı";

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        name,
        emailVerified: new Date(),
        role: isAdminEmail(email) ? "ADMIN" : "PLAYER",
      })
      .returning();
  }

  const sessionToken = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    sessionToken,
    userId: user!.id,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const res = NextResponse.json({
    ok: true,
    user: { id: user!.id, email: user!.email, name: user!.name, role: user!.role },
    uyarı: "Bu uç yalnızca yerel geliştirmede çalışır.",
  });
  res.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
