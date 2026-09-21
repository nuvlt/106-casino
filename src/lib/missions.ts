/**
 * Günlük görev tanımları.
 *
 * Her gün bu havuzdan 3 tanesi seçilir (gün dizesinden türetilen
 * deterministik bir sırayla — aynı gün herkese aynı görevler düşer).
 */

import { COIN } from "@/lib/games/config";
import type { missionKindEnum } from "@/db/schema";

type MissionKind = (typeof missionKindEnum.enumValues)[number];

export interface MissionTemplate {
  kind: MissionKind;
  target: number;
  reward: number;
  title: string;
  subtitle: string;
}

export const MISSION_POOL: readonly MissionTemplate[] = [
  {
    kind: "PLAY_N_GAMES",
    target: 3,
    reward: 150 * COIN,
    title: "Üç Oyun",
    subtitle: "Bugün 3 farklı oyun oyna",
  },
  {
    kind: "PLAY_N_ROUNDS",
    target: 25,
    reward: 200 * COIN,
    title: "Isınma Turu",
    subtitle: "Bugün 25 tur oyna",
  },
  {
    kind: "WIN_N_ROUNDS",
    target: 10,
    reward: 200 * COIN,
    title: "On Galibiyet",
    subtitle: "Bugün 10 tur kazan",
  },
  {
    kind: "WIN_STREAK",
    target: 5,
    reward: 300 * COIN,
    title: "Üst Üste Beş",
    subtitle: "Üst üste 5 tur kazan",
  },
  {
    kind: "HIT_MULTIPLIER",
    target: 10 * 10_000, // 10.00x (×10000 ölçeğinde)
    reward: 400 * COIN,
    title: "On Kat",
    subtitle: "Herhangi bir oyunda 10x yakala",
  },
  {
    kind: "HIT_MULTIPLIER",
    target: 50 * 10_000,
    reward: 750 * COIN,
    title: "Elli Kat",
    subtitle: "Herhangi bir oyunda 50x yakala",
  },
  {
    kind: "WAGER_TOTAL",
    target: 2_000 * COIN,
    reward: 250 * COIN,
    title: "Toplam Çevrim",
    subtitle: "Gün içinde toplam 2.000 coin çevir",
  },
  {
    kind: "PLAY_N_ROUNDS",
    target: 50,
    reward: 350 * COIN,
    title: "Maraton",
    subtitle: "Bugün 50 tur oyna",
  },
];

export const MISSIONS_PER_DAY = 3;

/** Gün dizesinden deterministik tohum — aynı gün herkese aynı görevler. */
function dayHash(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** O güne ait görev şablonları — sabit, tekrar hesaplanabilir. */
export function missionsForDay(day: string): MissionTemplate[] {
  const pool = [...MISSION_POOL];
  const picked: MissionTemplate[] = [];
  let seed = dayHash(day);

  for (let i = 0; i < MISSIONS_PER_DAY && pool.length > 0; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return picked;
}
