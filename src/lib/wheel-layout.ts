/**
 * Çarkın görsel yerleşimi.
 *
 * Dilimler ÖLÇEKLİDİR: her dilimin açısı gerçek kazanma olasılığıyla
 * birebir orantılı. Aynı ödül çarkın farklı yerlerine serpiştirilmiştir
 * (tek bir dev "boş" bloğu yerine), böylece gerçek bir çark gibi görünür
 * ama hiçbir yerde olasılık abartılmaz.
 *
 * 100x dilimi bu yüzden kıl kadar incedir (on binde 5) — bu bir çizim
 * hatası değil, dürüstlüğün görsel karşılığı.
 */

import { WHEEL_SEGMENTS } from "@/lib/games/config";

/**
 * Dilim sırası: tier indeksleri, çark çevresinde dolaşarak. "Boş" dilimleri
 * (8 adet) hep bir kazanç dilimiyle ayrılır; hiçbir yerde iki boş yan yana
 * gelmez. 100x, turun başladığı "Boş" dilimin hemen yanında — klasik
 * "az kalsın" yerleşimi.
 */
const ORDER = [0, 1, 2, 0, 3, 1, 0, 4, 1, 0, 2, 5, 0, 1, 3, 0, 2, 1, 0, 4, 3, 0, 1, 2, 6];

/**
 * Dilim renkleri — klasik casino paleti.
 *
 * Her ödülün iki tonu var: dilimin dış kenarı açık, göbeğe doğru koyu.
 * Bu, düz renkli pastadan çok gerçek bir çarkın cilalı yüzeyine benziyor.
 * "Boş" dilimler iki ayrı koyu tonda dönüşümlü boyanır ki çarkın en geniş
 * bölgesi tek bir blok gibi durmasın.
 */
export interface TierStyle {
  /** Dış kenar (parlak) */
  light: string;
  /** Göbek (koyu) */
  dark: string;
  text: string;
}

export const TIER_STYLE: TierStyle[] = [
  { light: "#2a3550", dark: "#0e1524", text: "#93a6c7" }, // 0x — antrasit
  { light: "#1f8b4c", dark: "#08351f", text: "#eafff2" }, // 1.5x — zümrüt
  { light: "#2f80ed", dark: "#0d3470", text: "#eaf4ff" }, // 2x — safir
  { light: "#9d5cff", dark: "#3b1470", text: "#f6efff" }, // 3x — ametist
  { light: "#e01e37", dark: "#6b0b18", text: "#ffeef0" }, // 5x — yakut
  { light: "#ff8c1a", dark: "#8a3c00", text: "#fff6ea" }, // 20x — turuncu
  { light: "#ffd062", dark: "#a9760a", text: "#3a2500" }, // 100x — altın
];

/** "Boş" dilimlerinin ikinci, biraz daha sıcak tonu (dönüşümlü kullanılır). */
export const EMPTY_ALT: TierStyle = {
  light: "#3a2f3f",
  dark: "#16101a",
  text: "#a795ad",
};

export interface Sector {
  tier: number;
  /** Aynı ödülün kaçıncı kopyası — "Boş" dilimlerini dönüşümlü tonlamak için. */
  copy: number;
  /** Tepedeki okla hizalı 0° noktasından saat yönünde başlangıç açısı. */
  start: number;
  angle: number;
  label: string;
}

const counts = ORDER.reduce<Record<number, number>>((acc, t) => {
  acc[t] = (acc[t] ?? 0) + 1;
  return acc;
}, {});

export const SECTORS: Sector[] = (() => {
  const totalWeight = WHEEL_SEGMENTS.reduce((s, x) => s + x.weight, 0);
  const seen: Record<number, number> = {};
  let cursor = 0;
  return ORDER.map((tier) => {
    const seg = WHEEL_SEGMENTS[tier]!;
    const angle = (seg.weight / counts[tier]! / totalWeight) * 360;
    const copy = (seen[tier] = (seen[tier] ?? -1) + 1);
    const sector: Sector = { tier, copy, start: cursor, angle, label: seg.label };
    cursor += angle;
    return sector;
  });
})();

/** Dilimin çizimde kullanılacak tonu. "Boş" dilimleri dönüşümlü tonlanır. */
export const styleFor = (s: Sector): TierStyle =>
  s.tier === 0 && s.copy % 2 === 1 ? EMPTY_ALT : TIER_STYLE[s.tier]!;

/** Bir tier'ın kaçıncı kopyası olduğunu bulmak için indeks listesi. */
const SECTORS_BY_TIER: Record<number, number[]> = SECTORS.reduce<Record<number, number[]>>(
  (acc, s, i) => {
    (acc[s.tier] ??= []).push(i);
    return acc;
  },
  {},
);

/**
 * Sunucunun verdiği (tier, offset) ikilisini çark üzerinde tek bir
 * noktaya çevirir. offset aynı ödülün hangi kopyasına ve o dilimin
 * neresine düşüldüğünü belirler — tamamen deterministik.
 */
export function landingAngle(tier: number, offset: number): number {
  const list = SECTORS_BY_TIER[tier] ?? [0];
  const scaled = Math.min(0.999999, Math.max(0, offset)) * list.length;
  const which = Math.floor(scaled);
  const within = scaled - which;
  const sector = SECTORS[list[which] ?? list[0]!]!;
  return sector.start + within * sector.angle;
}

/** SVG dilim yolu. Açılar tepeden (saat 12) saat yönünde ölçülür. */
export function sectorPath(start: number, angle: number, r: number, inner = 0): string {
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const a0 = rad(start);
  const a1 = rad(start + angle);
  const large = angle > 180 ? 1 : 0;

  const x0 = r * Math.cos(a0);
  const y0 = r * Math.sin(a0);
  const x1 = r * Math.cos(a1);
  const y1 = r * Math.sin(a1);

  if (inner <= 0) {
    return `M 0 0 L ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`;
  }
  const ix0 = inner * Math.cos(a0);
  const iy0 = inner * Math.sin(a0);
  const ix1 = inner * Math.cos(a1);
  const iy1 = inner * Math.sin(a1);
  return (
    `M ${ix0.toFixed(3)} ${iy0.toFixed(3)} L ${x0.toFixed(3)} ${y0.toFixed(3)} ` +
    `A ${r} ${r} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)} ` +
    `L ${ix1.toFixed(3)} ${iy1.toFixed(3)} A ${inner} ${inner} 0 ${large} 0 ${ix0.toFixed(3)} ${iy0.toFixed(3)} Z`
  );
}

/** Ödül tablosu — ekranda olasılıklarla birlikte gösterilir. */
export const PRIZE_TABLE = WHEEL_SEGMENTS.map((s, i) => ({
  tier: i,
  label: s.label,
  mult: s.mult / 100,
  chance: s.weight / 100, // yüzde
  style: TIER_STYLE[i]!,
}));
