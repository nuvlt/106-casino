/**
 * Oturum koruması. Giriş sayfası, auth uçları ve cron dışındaki her yol
 * kimlik doğrulaması ister.
 */

import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE, isInviteCode } from "@/lib/referral-code";

// "/api/dev" yalnızca geliştirme kipinde var olur; ucun kendi içinde
// NODE_ENV, DEV_LOGIN ve localhost kontrolü var — üretimde 404 döner.
// "/davet" davet açılış sayfası: giriş yapmamış kişiye gösterilir.
const PUBLIC_PATHS = ["/giris", "/davet", "/api/auth", "/api/cron", "/api/dev"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Davet linki: kodu çereze yaz. Google girişi arada birkaç yönlendirme
  // yapıyor; kod URL'de kalsaydı yolda kaybolurdu. Çerez, girişten sonraki
  // ilk /api/me isteğinde okunup silinir (bkz. lib/referral.ts).
  if (pathname.startsWith("/davet/")) {
    const code = pathname.slice("/davet/".length).split("/")[0]?.toLowerCase();
    const res = NextResponse.next();
    if (isInviteCode(code)) {
      res.cookies.set(INVITE_COOKIE, code, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: INVITE_COOKIE_MAX_AGE,
      });
    }
    return res;
  }

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
