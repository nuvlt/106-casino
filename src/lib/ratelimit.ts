/**
 * Hız sınırı — kullanıcı başına saniyede N istek.
 *
 * Redis varsa oradan (çok örnekli Vercel dağıtımında tek doğru kaynak),
 * yoksa bellek içi yedekle (yerel geliştirme). Bellek yedeği tek örnekte
 * doğru çalışır; üretimde REDIS_URL mutlaka tanımlı olmalıdır.
 */

import { env } from "@/lib/env";

type Redis = import("ioredis").Redis;

const globalForRl = globalThis as unknown as {
  __106_redis?: Redis | null;
  __106_memory?: Map<string, { count: number; resetAt: number }>;
};

async function getRedis(): Promise<Redis | null> {
  if (!env.redisUrl) return null;
  if (globalForRl.__106_redis !== undefined) return globalForRl.__106_redis;
  try {
    const { Redis } = await import("ioredis");
    globalForRl.__106_redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 2 });
  } catch {
    globalForRl.__106_redis = null;
  }
  return globalForRl.__106_redis;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/** Kayan pencere sayacı. limit istek / windowMs pencere. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const redis = await getRedis();

  if (redis) {
    const bucket = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.pexpire(bucket, windowMs);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterMs: windowMs - (Date.now() % windowMs),
    };
  }

  globalForRl.__106_memory ??= new Map();
  const store = globalForRl.__106_memory;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: windowMs };
  }
  entry.count++;
  return {
    ok: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterMs: entry.resetAt - now,
  };
}

/** Bahis uçları için standart sınır: saniyede 5 bahis. */
export const betRateLimit = (userId: string) => rateLimit(`bet:${userId}`, 5, 1_000);
