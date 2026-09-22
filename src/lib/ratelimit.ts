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
    // Next.js paketleyicisi ioredis'i CommonJS olarak sarar: adlandırılmış
    // `Redis` dışa aktarımı orada tanımsız gelir, sınıf `default` altındadır.
    // Önceki hâl yalnızca `{ Redis }` alıyordu; istemci hiç kurulamıyor ve
    // hız sınırı sessizce örnek başına bellekte kalıyordu.
    const mod = (await import("ioredis")) as unknown as {
      Redis?: typeof import("ioredis").Redis;
      default?: typeof import("ioredis").Redis;
    };
    const Redis = mod.Redis ?? mod.default;
    if (!Redis) throw new Error("ioredis dışa aktarımı bulunamadı");
    globalForRl.__106_redis = new Redis(env.redisUrl, {
      // Oyun asla Redis'i beklemesin: bağlantı henüz hazır değilse (soğuk
      // başlangıç) ya da koptuysa komut kuyruğa alınmaz, anında hata verir
      // ve istek bellek yedeğiyle devam eder. Bağlantı arka planda kurulur.
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      commandTimeout: 800,
      maxRetriesPerRequest: 1,
    });
    // Bağlantı hatası sürecin çökmesine yol açmasın; komutlar zaten
    // aşağıda yakalanıp bellek yedeğine düşüyor.
    globalForRl.__106_redis.on("error", () => {});
  } catch (e) {
    console.error("Redis istemcisi yüklenemedi, hız sınırı bellekte tutulacak:", e);
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
    try {
      // INCR ve PEXPIRE tek gidiş-dönüşte (önceden iki ayrı istekti).
      const res = await redis.multi().incr(bucket).pexpire(bucket, windowMs).exec();
      const count = Number(res?.[0]?.[1] ?? 0);
      return {
        ok: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterMs: windowMs - (Date.now() % windowMs),
      };
    } catch (e) {
      // Redis'e ulaşılamıyorsa bahsi bekletmek yerine bu örneğin bellek
      // sayacıyla devam edilir. Hız sınırı bir kötüye kullanım freni;
      // parayı koruyan asıl kilit veritabanındaki koşullu düşümdür.
      if (redis.status === "ready") {
        console.warn("Hız sınırı: Redis komutu başarısız, bellek yedeği kullanılıyor", e);
      }
    }
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

/**
 * Redis gidiş-dönüş süresi (ms) — /api/health için. Redis tanımlı değilse
 * ya da ulaşılamıyorsa null.
 */
export async function redisPingMs(): Promise<number | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    // Soğuk başlangıçta bağlantının kurulmasını kısa bir süre bekle.
    if (redis.status !== "ready") {
      await Promise.race([
        new Promise((resolve) => redis.once("ready", resolve)),
        new Promise((resolve) => setTimeout(resolve, 1_500)),
      ]);
    }
    const t = performance.now();
    await redis.ping();
    return performance.now() - t;
  } catch {
    return null;
  }
}
