/**
 * Gün sınırı — her şey Europe/Istanbul takvimine göre.
 *
 * Sunucu UTC'de çalışsa bile "bugün" kavramı Türkiye saatiyle belirlenir;
 * günlük sıfırlama, seri ve sıralama bu güne dayanır.
 */

const TZ = "Europe/Istanbul";

// en-CA biçimi YYYY-MM-DD verir.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-09-20" — verilen anın Türkiye takvim günü. */
export function trtDay(at: Date = new Date()): string {
  return dayFormatter.format(at);
}

/** Bir önceki takvim günü — seri hesabı için. */
export function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** İki gün arasındaki fark (gün sayısı). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Bir sonraki gece yarısı (TRT) — UTC an olarak. Cron sağlığı için. */
export function nextMidnightTrt(at: Date = new Date()): Date {
  const today = trtDay(at);
  const [y, m, d] = today.split("-").map(Number);
  // TRT = UTC+3, yaz saati uygulaması yok (2016'dan beri sabit).
  return new Date(Date.UTC(y!, m! - 1, d! + 1, -3, 0, 0));
}
