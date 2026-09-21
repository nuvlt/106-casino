/**
 * 106 Casino — Provably Fair RNG
 * ------------------------------------------------------------------
 * Stake/bustabit tarzı, denetlenebilir rastgelelik.
 *
 *   serverSeed : sunucuda üretilen 32 byte rastgele değer. Kullanıcıya
 *                ÖNCE sadece sha256 hash'i gösterilir (taahhüt / commit).
 *   clientSeed : kullanıcının kendi belirlediği metin (istediği an değiştirir).
 *   nonce      : o seed çifti ile oynanan tur sayacı (0,1,2,...).
 *
 * Tur sonucu = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`)
 *
 * Kullanıcı seed'i döndürdüğünde (rotate) eski serverSeed açığa çıkar;
 * geçmiş tüm turlarını kendisi yeniden hesaplayıp doğrulayabilir.
 * Sunucu, sonucu bildikten sonra seed'i değiştiremez çünkü hash'i
 * bahisten ÖNCE yayınlanmıştır.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { Rng } from "@/lib/games/rng-core";

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed, "utf8").digest("hex");
}

export function generateClientSeed(): string {
  return randomBytes(8).toString("hex");
}

/** HMAC bloklarını byte byte akıtan üreteç. 32 byte bitince cursor artar. */
function* byteStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Generator<number, never, unknown> {
  let cursor = 0;
  for (;;) {
    const block = createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}:${cursor}`, "utf8")
      .digest();
    for (let i = 0; i < block.length; i++) yield block[i]!;
    cursor++;
  }
}

/**
 * Bir turu seed'lerden yeniden üretmek için tek giriş noktası.
 * Doğrulama sayfası da, oyun motoru da bunu kullanır — böylece
 * "sunucu başka, doğrulayıcı başka hesaplıyor" ihtimali kalmaz.
 */
export function rngFor(serverSeed: string, clientSeed: string, nonce: number): Rng {
  const stream = byteStream(serverSeed, clientSeed, nonce);
  return new Rng(() => stream.next().value);
}

export { Rng } from "@/lib/games/rng-core";
