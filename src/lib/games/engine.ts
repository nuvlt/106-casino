/**
 * 106 Casino — oyun motoru (SUNUCU TARAFI)
 *
 * Buradaki hiçbir fonksiyon tarayıcıda çalışmaz. İstemci yalnızca
 * sunucunun ürettiği sonucu animasyonla oynatır.
 *
 * Her oyun `resolve(...)` ile tek bir tur çözer ve şunu döner:
 *   payout  — centicoin cinsinden ÖDENECEK tutar (bahis dahil brüt)
 *   mult    — gösterim için ondalık çarpan
 *   detail  — animasyon ve doğrulama için tur ayrıntısı
 *
 * Ödeme her zaman tam sayı aritmetiğiyle: floor(bet * num / den).
 * Böylece 0.0001 coin bile kaybolmaz/oluşmaz.
 */

import { Rng } from "./rng";
import {
  CRASH_LAMBDA,
  CRASH_MAX_MULT,
  DICE_OUTCOMES,
  GUESS_RANGE,
  HL_DECK_SIZE,
  MYSTERY_BOX_COUNT,
  MYSTERY_TIERS,
  PLINKO_TABLES,
  RTP_BPS,
  SCRATCH_PRIZES,
  WHEEL_SEGMENTS,
} from "./config";

export type GameKey =
  | "wheel"
  | "crash"
  | "dice"
  | "plinko"
  | "scratch"
  | "guess"
  | "mystery"
  | "higherlower";

export interface Outcome {
  payout: number; // centicoin, brüt
  mult: number; // gösterim çarpanı (ondalık)
  detail: Record<string, unknown>;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/* ================================================================== */
/* LUCKY WHEEL                                                        */
/* ================================================================== */

export function resolveWheel(rng: Rng, bet: number): Outcome {
  const idx = rng.weightedIndex(WHEEL_SEGMENTS.map((s) => s.weight));
  const seg = WHEEL_SEGMENTS[idx]!;
  // Aynı ödülü taşıyan dilimlerden hangisine düştüğü sadece animasyon için.
  const spinOffset = rng.float();
  return {
    payout: floorDiv(bet * seg.mult, 100),
    mult: seg.mult / 100,
    detail: { segment: idx, label: seg.label, spinOffset },
  };
}

/* ================================================================== */
/* CRASH                                                              */
/* ================================================================== */

/**
 * Çöküş noktası. P(C ≥ m) = 0.95 / m olacak şekilde üretilir;
 * dolayısıyla hangi çarpanda çekilirse çekilsin beklenen değer
 * m · 0.95/m = 0.95 — yani her strateji için RTP tam %95.
 */
export function crashPoint(rng: Rng): number {
  const u = rng.float52();
  if (u < 0.05) return 100; // 1.00x — anında patlama (%5)
  const v = (u - 0.05) / 0.95; // [0,1) düzgün
  const raw = Math.floor(100 / (1 - v));
  return Math.min(Math.max(raw, 100), CRASH_MAX_MULT);
}

/** Çarpanın t saniyedeki değeri (yüzde birlik). Sunucu saati esas alınır. */
export function crashMultAt(elapsedSeconds: number): number {
  return Math.floor(100 * Math.exp(CRASH_LAMBDA * elapsedSeconds));
}

/** Çarpandan zamana — istemcinin "şu anda buradaydım" iddiasını denetler. */
export function crashTimeFor(multHundredths: number): number {
  return Math.log(multHundredths / 100) / CRASH_LAMBDA;
}

export function resolveCrash(rng: Rng, bet: number, cashoutAt: number | null): Outcome {
  const point = crashPoint(rng);
  const won = cashoutAt !== null && cashoutAt <= point;
  return {
    payout: won ? floorDiv(bet * cashoutAt, 100) : 0,
    mult: won ? cashoutAt / 100 : 0,
    detail: { crashPoint: point / 100, cashedOutAt: won ? cashoutAt / 100 : null },
  };
}

/* ================================================================== */
/* DICE                                                               */
/* ================================================================== */

/**
 * 0.00–99.99 arası zar. Oyuncu kazanan sonuç sayısını (W) seçer;
 * ödeme = bahis · 9500 / W  →  EV = (W/10000)·(9500/W) = 0.95. Tam.
 */
export function resolveDice(
  rng: Rng,
  bet: number,
  winOutcomes: number,
  mode: "under" | "over",
): Outcome {
  const roll = rng.int(DICE_OUTCOMES);
  const won = mode === "under" ? roll < winOutcomes : roll >= DICE_OUTCOMES - winOutcomes;
  return {
    payout: won ? floorDiv(bet * RTP_BPS, winOutcomes) : 0,
    mult: won ? RTP_BPS / winOutcomes : 0,
    detail: {
      roll: roll / 100,
      threshold: mode === "under" ? winOutcomes / 100 : (DICE_OUTCOMES - winOutcomes) / 100,
      mode,
      winChance: winOutcomes / 100,
    },
  };
}

/* ================================================================== */
/* PLINKO                                                             */
/* ================================================================== */

export function resolvePlinko(
  rng: Rng,
  bet: number,
  risk: "low" | "medium" | "high",
  rows: 8 | 12 | 16,
): Outcome {
  const table = PLINKO_TABLES[`${risk}_${rows}`];
  if (!table) throw new Error(`bilinmeyen plinko tablosu: ${risk}_${rows}`);

  const path: number[] = [];
  let bucket = 0;
  for (let i = 0; i < rows; i++) {
    const right = rng.int(2);
    path.push(right);
    bucket += right;
  }
  const mult = table[bucket]!;
  return {
    payout: floorDiv(bet * mult, 100),
    mult: mult / 100,
    detail: { path, bucket, risk, rows },
  };
}

/* ================================================================== */
/* SCRATCH CARD                                                       */
/* ================================================================== */

export function resolveScratch(rng: Rng, bet: number): Outcome {
  const idx = rng.weightedIndex(SCRATCH_PRIZES.map((p) => p.weight));
  const prize = SCRATCH_PRIZES[idx]!;
  return {
    payout: floorDiv(bet * prize.mult, 100),
    mult: prize.mult / 100,
    detail: { prizeIndex: idx, symbol: prize.symbol, grid: buildScratchGrid(rng, idx) },
  };
}

/**
 * 3x3 kart yüzeyi. Kazanan semboldan tam 3 tane, diğerlerinden en fazla 2.
 * Sonuç ZATEN belirlenmiştir — bu fonksiyon sadece ona uygun bir görüntü kurar.
 */
function buildScratchGrid(rng: Rng, prizeIndex: number): string[] {
  const symbols = SCRATCH_PRIZES.map((p) => p.symbol);
  const winning = symbols[prizeIndex]!;
  const others = symbols.filter((_, i) => i !== prizeIndex && i !== 0);

  const cells: string[] = [];
  if (prizeIndex !== 0) {
    for (let i = 0; i < 3; i++) cells.push(winning);
  }
  // Kalan hücreleri, hiçbiri 3'e ulaşmayacak şekilde doldur.
  const counts = new Map<string, number>();
  while (cells.length < 9) {
    const candidate = others[rng.int(others.length)]!;
    const c = counts.get(candidate) ?? 0;
    if (c >= 2) continue;
    counts.set(candidate, c + 1);
    cells.push(candidate);
  }
  return rng.shuffle(cells);
}

/* ================================================================== */
/* NUMBER GUESS                                                       */
/* ================================================================== */

/** 1..10 arası bir sayı. k tane tahmin → ödeme bahis·9500/(1000·k). */
export function resolveGuess(rng: Rng, bet: number, picks: number[]): Outcome {
  const drawn = rng.int(GUESS_RANGE) + 1;
  const won = picks.includes(drawn);
  const k = picks.length;
  return {
    payout: won ? floorDiv(bet * RTP_BPS, 1000 * k) : 0,
    mult: won ? RTP_BPS / (1000 * k) : 0,
    detail: { drawn, picks },
  };
}

/* ================================================================== */
/* MYSTERY BOXES                                                      */
/* ================================================================== */

/**
 * 9 kutunun her biri bağımsız olarak aynı tablodan doldurulur; oyuncu
 * birini seçer, tur sonunda hepsi açılır ("ne kaçırdım?" etkisi).
 * Hangi kutuyu seçtiği beklenen değeri değiştirmez.
 */
export function resolveMystery(
  rng: Rng,
  bet: number,
  tier: "bronze" | "silver" | "gold",
  pick: number,
): Outcome {
  const table = MYSTERY_TIERS[tier];
  const weights = table.map((t) => t.weight);
  const boxes: number[] = [];
  for (let i = 0; i < MYSTERY_BOX_COUNT; i++) boxes.push(table[rng.weightedIndex(weights)]!.mult);
  const mult = boxes[pick]!;
  return {
    payout: floorDiv(bet * mult, 100),
    mult: mult / 100,
    detail: { tier, pick, boxes: boxes.map((m) => m / 100) },
  };
}

/* ================================================================== */
/* HIGHER / LOWER                                                     */
/* ================================================================== */

export interface HlState {
  deck: number[]; // karılmış 52 kart, 0..51 (rank*4 + suit)
  position: number; // kaçıncı kart açık
  mult: number; // birikmiş çarpan (ondalık)
}

export const hlRank = (card: number) => Math.floor(card / 4); // 0..12 → 2..A
export const hlSuit = (card: number) => card % 4;

export function hlNewRound(rng: Rng, size: number = HL_DECK_SIZE): HlState {
  const deck = rng.shuffle(Array.from({ length: size }, (_, i) => i));
  return { deck, position: 0, mult: 1 };
}

/**
 * Bir sonraki kartın "higher" ve "lower" olma olasılıkları.
 * Beraberlik yok: eşit rank'te renk/suit sırası karar verir, yani
 * 52 kartın tamamı kesin olarak sıralanabilir.
 */
export function hlOdds(state: HlState): { higher: number; lower: number } {
  const current = state.deck[state.position]!;
  const remaining = state.deck.slice(state.position + 1);
  if (remaining.length === 0) return { higher: 0, lower: 0 }; // deste bitti
  const higher = remaining.filter((c) => c > current).length;
  return { higher: higher / remaining.length, lower: (remaining.length - higher) / remaining.length };
}

/**
 * Tek adım. Ev avantajı YALNIZCA ilk adımda (×0.95); sonraki adımlar
 * tam adil (1/p). Bu sayede oyuncu kaç adım giderse gitsin tur RTP'si %95.
 */
export function hlStep(
  state: HlState,
  guess: "higher" | "lower",
): { state: HlState; won: boolean; card: number; stepMult: number } {
  const odds = hlOdds(state);
  const p = guess === "higher" ? odds.higher : odds.lower;
  if (p === 0) throw new Error("olanaksız tahmin — bu seçenek kapalı olmalı");

  const current = state.deck[state.position]!;
  const next = state.deck[state.position + 1]!;
  const won = guess === "higher" ? next > current : next < current;

  const edge = state.position === 0 ? RTP_BPS / 10_000 : 1;
  const stepMult = (1 / p) * edge;

  return {
    state: { deck: state.deck, position: state.position + 1, mult: state.mult * stepMult },
    won,
    card: next,
    stepMult,
  };
}

export function hlCashout(state: HlState, bet: number): Outcome {
  return {
    payout: Math.floor(bet * state.mult),
    mult: state.mult,
    detail: { steps: state.position, cards: state.deck.slice(0, state.position + 1) },
  };
}
