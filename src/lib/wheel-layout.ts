/**
 * Çarkın görsel yerleşimi.
 *
 * Dilimler ÖLÇEKLİDİR: her dilimin açısı gerçek kazanma olasılığıyla
 * birebir orantılı. Aynı ödül çarkın farklı yerlerine serpiştirilmiştir
 * (tek bir dev "boş" bloğu yerine), böylece gerçek bir çark gibi görünür
 * ama hiçbir yerde olasılık abartılmaz.
 *
 * 50x dilimi bu yüzden kıl kadar incedir (binde 2) — bu bir çizim hatası
 * değil, dürüstlüğün görsel karşılığı.
 */

import { WHEEL_SEGMENTS } from "@/lib/games/config";

/** Dilim sırası: tier indeksleri, çark çevresinde dolaşarak. */
const ORDER = [0, 1, 2, 0, 3, 1, 2, 0, 4, 1, 2, 0, 3, 1, 5, 0, 2, 1, 3, 0, 4, 1, 2, 6];

export const TIER_STYLE: { fill: string; text: string }[] = [
  { fill: "#22324d", text: "#8ea3c4" }, // 0x
  { fill: "#0f5132", text: "#c8f5dc" }, // 0.5x
  { fill: "#1b7a43", text: "#ffffff" }, // 1x
  { fill: "#2d7dd2", text: "#ffffff" }, // 2x
  { fill: "#7c3aed", text: "#ffffff" }, // 5x
  { fill: "#d62828", text: "#ffffff" }, // 10x
  { fill: "#f5b921", text: "#3a2500" }, // 50x
];

export interface Sector {
  tier: number;
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
  let cursor = 0;
  return ORDER.map((tier) => {
    const seg = WHEEL_SEGMENTS[tier]!;
    const angle = (seg.weight / counts[tier]! / totalWeight) * 360;
    const sector: Sector = { tier, start: cursor, angle, label: seg.label };
    cursor += angle;
    return sector;
  });
})();

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
