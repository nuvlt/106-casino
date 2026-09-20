/**
 * Oyun uçları için ortak iskelet: oturum → hız sınırı → doğrulama →
 * günlük hak → tohum → çözüm. Her uç aynı korumalardan geçsin diye
 * tek yerde toplandı.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ApiError, fail, requireUser, type SessionUser } from "@/lib/api";
import { betRateLimit } from "@/lib/ratelimit";
import { ensureDailyState } from "@/lib/economy";
import { ensureActiveSeed } from "@/lib/seeds";
import { resolveDecidedCrashRounds } from "@/lib/crash";
import { WalletError } from "@/lib/wallet";
import { firstError } from "@/lib/validation";

const HTTP_FOR_WALLET: Record<string, number> = {
  INSUFFICIENT_FUNDS: 402,
  SUSPENDED: 403,
  INVALID_BET: 400,
  ROUND_OPEN: 409,
  ROUND_CLOSED: 409,
  NOT_FOUND: 404,
};

export interface GameContext<T> {
  user: SessionUser;
  body: T;
}

/**
 * Bahis uçlarını saran ortak akış.
 * `rateLimited: false` yalnızca para harcamayan uçlar için (çekim gibi).
 */
export function gameRoute<S extends z.ZodTypeAny>(
  schema: S,
  run: (ctx: GameContext<z.infer<S>>) => Promise<unknown>,
  opts: { rateLimited?: boolean; ensureWallet?: boolean } = {},
) {
  const { rateLimited = true, ensureWallet = true } = opts;

  return async (req: NextRequest) => {
    try {
      const user = await requireUser();

      if (rateLimited) {
        const limit = await betRateLimit(user.id);
        if (!limit.ok) {
          return NextResponse.json(
            { error: "Çok hızlısın, biraz yavaşla", code: "RATE_LIMITED" },
            { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
          );
        }
      }

      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return fail(400, "Geçersiz istek gövdesi", "BAD_REQUEST");
      }

      const parsed = schema.safeParse(raw);
      if (!parsed.success) return fail(400, firstError(parsed.error), "VALIDATION");

      if (ensureWallet) {
        // Sabah ilk oyununda günlük hak burada verilir.
        await ensureDailyState(db, user.id);
        await ensureActiveSeed(db, user.id);
        // Sekme kapanınca yarım kalmış Crash turları burada sonuçlanır;
        // aksi halde oyuncu kendi eski turu yüzünden kilitli kalırdı.
        await resolveDecidedCrashRounds(db, user.id);
      }

      return NextResponse.json(await run({ user, body: parsed.data }));
    } catch (e) {
      if (e instanceof WalletError) {
        return fail(HTTP_FOR_WALLET[e.code] ?? 400, e.message, e.code);
      }
      if (e instanceof ApiError) return fail(e.status, e.message, e.code);
      console.error("Oyun ucu hatası:", e);
      return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
    }
  };
}
