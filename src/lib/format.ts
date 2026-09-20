/** Görüntüleme yardımcıları — para her yerde centicoin, ekranda coin. */

import { COIN } from "@/lib/games/config";

const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

/** 123456 centicoin → "1.234,56" */
export const coins = (centicoin: number): string => nf.format(centicoin / COIN);

/** Tam sayıya yuvarlanmış coin — tablolar için. */
export const coinsShort = (centicoin: number): string => nf0.format(Math.round(centicoin / COIN));

/** 2.5 → "2.50x" */
export const mult = (m: number): string => `${nf.format(Math.round(m * 100) / 100)}x`;

/** ×10000 ölçeğindeki çarpanı okunur hale getirir. */
export const multX4 = (v: number): string => mult(v / 10_000);

/** "3 dk önce" */
export function timeAgo(iso: string | Date): string {
  const then = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "az önce";
  if (secs < 3600) return `${Math.round(secs / 60)} dk önce`;
  if (secs < 86400) return `${Math.round(secs / 3600)} sa önce`;
  return `${Math.round(secs / 86400)} gün önce`;
}

/** "Mehmet Yılmaz" → "Mehmet Y." — sıralamada soyadı kısaltılır. */
export function shortName(name: string | null | undefined): string {
  if (!name) return "İsimsiz";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(" ")} ${parts.at(-1)![0]!.toUpperCase()}.`;
}

export const initials = (name: string | null | undefined): string => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts.length > 1 ? parts.at(-1)![0]!.toUpperCase() : "");
};
