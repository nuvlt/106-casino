/**
 * Oturum koruması. Giriş sayfası, auth uçları ve cron dışındaki her yol
 * kimlik doğrulaması ister.
 */

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/giris", "/api/auth", "/api/cron"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Oturum çerezinin varlığı burada yeterli — asıl doğrulama
  // her route handler'da requireUser() ile veritabanından yapılır.
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/giris";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
