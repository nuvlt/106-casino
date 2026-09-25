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
import { ensureDailyClaim } from "@/lib/economy";
import { ensureActiveSeed } from "@/lib/seeds";
import { resolveDecidedCrashRounds } from "@/lib/crash";
import { WalletError } from "@/lib/wallet";
import { MissionError } from "@/lib/mission-claim";
import { firstError } from "@/lib/validation";

const HTTP_FOR_MISSION: Record<string, number> = {
  NOT_FOUND: 404,
  ALREADY_CLAIMED: 409,
  NOT_COMPLETED: 409,
};

const HTTP_FOR_WALLET: Record<string, number> = {
  INSUFFICIENT_FUNDS: 402,
  SUSPENDED: 403,
  INVALID_BET: 400,
  ROUND_OPEN: 409,
  ROUND_CLOSED: 409,
  NOT_FOUND: 404,
  DUPLICATE_KEY: 409,
};

/** Hata zincirinde (drizzle "Failed query" → postgres hatası) Postgres kodu. */
function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Yeni bir oyun, veritabanındaki oyun türü listesine (enum) henüz
 * eklenmemişse Postgres 22P02 döner. Migration uygulanmadan kod yayına
 * çıktığında olur; mevcut oyunlar etkilenmez, yeni oyun anlaşılır bir
 * mesajla reddedilir (500 yerine).
 */
export const isGameNotReady = (e: unknown) => pgCode(e) === "22P02";

export const gameNotReady = () =>
  fail(503, "Bu oyun henüz hazırlanıyor, birazdan tekrar dene", "GAME_NOT_READY");

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

      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return fail(400, "Geçersiz istek gövdesi", "BAD_REQUEST");
      }

      const parsed = schema.safeParse(raw);
      if (!parsed.success) return fail(400, firstError(parsed.error), "VALIDATION");

      // Hız sınırı (Redis) ve günlük hak kontrolü (Postgres) birbirinden
      // bağımsız; sırayla beklemek yerine aynı anda sorulur. Sınıra
      // takılan istekte günlük hak yine verilmiş olur — zararsız, zaten
      // bir sonraki istekte verilecekti.
      const [limit] = await Promise.all([
        rateLimited ? betRateLimit(user.id) : null,
        // Sabah ilk oyununda günlük hak burada verilir. Crash çözümünden
        // ÖNCE bitmeli: günlük sıfırlama bakiyeyi yeniden yazar, dünden
        // kalan Crash ödemesi ondan sonra eklenmeli.
        ensureWallet ? ensureDailyClaim(db, user.id) : null,
      ]);

      if (limit && !limit.ok) {
        return NextResponse.json(
          { error: "Çok hızlısın, biraz yavaşla", code: "RATE_LIMITED" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
        );
      }

      if (ensureWallet) {
        // Bu ikisi de birbirinden bağımsız — aynı anda.
        // Sekme kapanınca yarım kalmış Crash turları burada sonuçlanır;
        // aksi halde oyuncu kendi eski turu yüzünden kilitli kalırdı.
        await Promise.all([
          ensureActiveSeed(db, user.id),
          resolveDecidedCrashRounds(db, user.id),
        ]);
      }

      return NextResponse.json(await run({ user, body: parsed.data }));
    } catch (e) {
      if (e instanceof MissionError) {
        return fail(HTTP_FOR_MISSION[e.code] ?? 400, e.message, e.code);
      }
      if (e instanceof WalletError) {
        return fail(HTTP_FOR_WALLET[e.code] ?? 400, e.message, e.code);
      }
      if (e instanceof ApiError) return fail(e.status, e.message, e.code);
      if (isGameNotReady(e)) {
        console.error("Oyun türü veritabanında yok — migration uygulanmamış olabilir:", e);
        return gameNotReady();
      }
      console.error("Oyun ucu hatası:", e);
      return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
    }
  };
}
