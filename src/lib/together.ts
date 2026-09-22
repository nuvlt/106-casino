/**
 * Transaction içinde birden fazla işi aynı anda başlatıp HEPSİNİN
 * bitmesini bekler; sonra ilk hatayı (dizideki sıraya göre) fırlatır.
 *
 * NEDEN Promise.all DEĞİL: Promise.all ilk hatada hemen döner. O anda
 * transaction geri alınır (ROLLBACK gönderilir), ama yarım kalan kardeş
 * iş bir sonraki sorgusunu ROLLBACK'ten SONRA gönderebilir — postgres.js
 * bu sorguyu transaction bittiği hâlde aynı bağlantıdan, otomatik
 * onaylı (autocommit) olarak çalıştırır. Yani geri alınmış bir turun
 * görev ilerlemesi gibi bir yazım kalıcı olabilir. Burada her dal
 * transaction hâlâ açıkken biter; hata ondan sonra fırlatılır ve geri
 * alma hepsini kapsar.
 *
 * Hata önceliği de belirli olur: dizide önce gelen dalın hatası kazanır
 * (ör. "açık tur var" hatası "yetersiz bakiye"den önce gelir).
 */
export async function together<T extends readonly unknown[] | []>(
  values: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const settled = await Promise.allSettled(values);
  for (const r of settled) {
    if (r.status === "rejected") throw r.reason;
  }
  return settled.map((r) => (r as PromiseFulfilledResult<unknown>).value) as {
    -readonly [K in keyof T]: Awaited<T[K]>;
  };
}
