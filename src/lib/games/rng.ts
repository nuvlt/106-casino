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
 * Turun deterministik sayı kaynağı.
 * Aynı (serverSeed, clientSeed, nonce) üçlüsü her zaman aynı diziyi verir.
 */
export class Rng {
  private readonly stream: Generator<number, never, unknown>;

  constructor(serverSeed: string, clientSeed: string, nonce: number) {
    this.stream = byteStream(serverSeed, clientSeed, nonce);
  }

  private nextByte(): number {
    return this.stream.next().value;
  }

  /** [0,1) aralığında, 32 bit çözünürlüklü ondalık. */
  float(): number {
    let value = 0;
    let divider = 256;
    for (let i = 0; i < 4; i++) {
      value += this.nextByte() / divider;
      divider *= 256;
    }
    return value;
  }

  /** [0,1) aralığında, 52 bit çözünürlüklü ondalık (Crash için). */
  float52(): number {
    let value = 0;
    let divider = 256;
    for (let i = 0; i < 7; i++) {
      value += this.nextByte() / divider;
      divider *= 256;
    }
    return value;
  }

  /** [0, max) tam sayı. Modulo sapmasını elemek için reddetme örneklemesi. */
  int(max: number): number {
    if (max <= 0) throw new Error("max > 0 olmalı");
    if (max === 1) return 0;
    const bytesNeeded = Math.ceil(Math.log2(max) / 8);
    const range = 256 ** bytesNeeded;
    const limit = range - (range % max); // bu sınırın üstü reddedilir
    for (;;) {
      let value = 0;
      for (let i = 0; i < bytesNeeded; i++) value = value * 256 + this.nextByte();
      if (value < limit) return value % max;
    }
  }

  /** Ağırlıklı tablodan indeks seçer. weights tam sayı olmalı. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    const roll = this.int(total);
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i]!;
      if (roll < acc) return i;
    }
    return weights.length - 1; // erişilemez
  }

  /** Fisher-Yates — Higher/Lower destesi için. Diziyi yerinde karıştırır. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }
}

/**
 * Bir turu seed'lerden yeniden üretmek için tek giriş noktası.
 * Doğrulama sayfası da, oyun motoru da bunu kullanır — böylece
 * "sunucu başka, doğrulayıcı başka hesaplıyor" ihtimali kalmaz.
 */
export function rngFor(serverSeed: string, clientSeed: string, nonce: number): Rng {
  return new Rng(serverSeed, clientSeed, nonce);
}
