/**
 * RNG çekirdeği — platformdan bağımsız.
 *
 * Bu dosya bilerek node:crypto İÇERMEZ: doğrulama sayfası oyuncunun
 * tarayıcısında aynı sınıfı çalıştırabilsin diye. Bayt kaynağı
 * dışarıdan enjekte edilir (sunucuda node HMAC, tarayıcıda Web Crypto).
 *
 * "Sunucu başka hesaplıyor, doğrulayıcı başka" ihtimalini ortadan
 * kaldıran şey tam olarak bu: tek bir Rng sınıfı, tek bir motor.
 */

/**
 * Turun deterministik sayı kaynağı.
 * Aynı (serverSeed, clientSeed, nonce) üçlüsü her zaman aynı diziyi verir.
 */
export class Rng {
  /**
   * Bayt kaynağı dışarıdan verilir. Sunucuda bu kaynak node:crypto
   * HMAC akışıdır; tarayıcıda Web Crypto ile önceden hesaplanmış
   * bloklardır. Sınıfın kendisi ikisini de bilmez — böylece oyuncunun
   * tarayıcısında dönen kod ile sunucuda dönen kod BİREBİR aynı olur.
   */
  constructor(private readonly nextByte: () => number) {}

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

