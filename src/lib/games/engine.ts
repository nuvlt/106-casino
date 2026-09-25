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
  BAZAAR_FREE_SPINS,
  BAZAAR_FS_CAP,
  BAZAAR_FS_MULT,
  BAZAAR_LINES,
  BAZAAR_MAX_WIN_X,
  BAZAAR_PAYS,
  BAZAAR_SCATTER_PAYS,
  BAZAAR_SYMBOLS,
  BAZAAR_WEIGHTS,
  BJ_DECKS,
  BJ_PAY_DEN,
  BJ_PAY_NUM,
  BJ_SHOE_DRAW,
  CLASSIC_FRUITS,
  CLASSIC_SYMBOLS,
  CLASSIC_TABLE,
  ROULETTE_DOUBLE_ZERO,
  ROULETTE_PAYOUT,
  ROULETTE_POCKETS,
  ROULETTE_RED,
  type BazaarSymbol,
  type ClassicClass,
  type ClassicSymbol,
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
  | "higherlower"
  | "roulette"
  | "slot"
  | "bazaar"
  | "blackjack";

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

/* ================================================================== */
/* RULET (Amerikan)                                                   */
/* ================================================================== */

export type RouletteBetKind = keyof typeof ROULETTE_PAYOUT;

export interface RouletteBet {
  kind: RouletteBetKind;
  /** straight: 0..37 (37 = "00"); dozen/column: 1..3; diğerlerinde yok. */
  n?: number;
  /** centicoin */
  amount: number;
}

export const roulettePocketLabel = (p: number) => (p === ROULETTE_DOUBLE_ZERO ? "00" : String(p));

export function rouletteColor(p: number): "green" | "red" | "black" {
  if (p === 0 || p === ROULETTE_DOUBLE_ZERO) return "green";
  return ROULETTE_RED.has(p) ? "red" : "black";
}

/** Bu bahis bu cepte kazanır mı? 0 ve 00 yalnızca kendi tek sayı bahsini kazandırır. */
export function rouletteWins(bet: RouletteBet, pocket: number): boolean {
  if (bet.kind === "straight") return bet.n === pocket;
  if (pocket === 0 || pocket === ROULETTE_DOUBLE_ZERO) return false;
  switch (bet.kind) {
    case "red":
      return ROULETTE_RED.has(pocket);
    case "black":
      return !ROULETTE_RED.has(pocket);
    case "odd":
      return pocket % 2 === 1;
    case "even":
      return pocket % 2 === 0;
    case "low":
      return pocket <= 18;
    case "high":
      return pocket >= 19;
    case "dozen":
      return Math.ceil(pocket / 12) === bet.n;
    case "column":
      // 1. sütun 1,4,7…34 (mod 3 = 1); 2. sütun 2,5…35; 3. sütun 3,6…36.
      return ((pocket - 1) % 3) + 1 === bet.n;
  }
}

export function resolveRoulette(rng: Rng, bets: readonly RouletteBet[]): Outcome {
  const pocket = rng.int(ROULETTE_POCKETS);
  let stake = 0;
  let payout = 0;
  const winners: number[] = [];
  bets.forEach((b, i) => {
    stake += b.amount;
    if (rouletteWins(b, pocket)) {
      payout += b.amount * ROULETTE_PAYOUT[b.kind];
      winners.push(i);
    }
  });
  return {
    payout,
    mult: stake > 0 ? payout / stake : 0,
    detail: {
      pocket,
      label: roulettePocketLabel(pocket),
      color: rouletteColor(pocket),
      bets,
      winners,
    },
  };
}

/* ================================================================== */
/* KLASİK 777 SLOT                                                    */
/* ================================================================== */

/** Ödeme çizgisinin sınıfı — ödeme tablosunda yazan kuralın aynısı. */
export function classicClassOf(line: readonly ClassicSymbol[]): ClassicClass {
  const [a, b, c] = line;
  if (a === b && b === c) {
    switch (a) {
      case "7": return "seven3";
      case "BAR": return "bar3";
      case "🔔": return "bell3";
      case "🍉": return "melon3";
      case "🍋": return "lemon3";
      case "🍒": return "cherry3";
    }
  }
  if (line.every((s) => CLASSIC_FRUITS.includes(s))) return "mixed";
  if (line.filter((s) => s === "🍒").length === 2) return "cherry2";
  return "lose";
}

/** Her sınıfa düşen bütün 3'lü dizilimler (6³ = 216), bir kez hesaplanır. */
const CLASSIC_BUCKETS: Record<ClassicClass, ClassicSymbol[][]> = (() => {
  const out = Object.fromEntries(CLASSIC_TABLE.map((t) => [t.cls, [] as ClassicSymbol[][]])) as Record<
    ClassicClass,
    ClassicSymbol[][]
  >;
  for (const a of CLASSIC_SYMBOLS)
    for (const b of CLASSIC_SYMBOLS)
      for (const c of CLASSIC_SYMBOLS) out[classicClassOf([a, b, c])].push([a, b, c]);
  return out;
})();

export function resolveClassicSlot(rng: Rng, bet: number): Outcome {
  const idx = rng.weightedIndex(CLASSIC_TABLE.map((t) => t.weight));
  const row = CLASSIC_TABLE[idx]!;
  const bucket = CLASSIC_BUCKETS[row.cls];
  const line = bucket[rng.int(bucket.length)]!;
  // Çizginin üstü ve altı yalnızca görüntü; ödemeyi etkilemez.
  const pick = () => CLASSIC_SYMBOLS[rng.int(CLASSIC_SYMBOLS.length)]!;
  const reels = line.map((mid) => [pick(), mid, pick()]);
  return {
    payout: floorDiv(bet * row.mult, 100),
    mult: row.mult / 100,
    detail: { cls: row.cls, label: row.label, line, reels },
  };
}

/* ================================================================== */
/* KAPALIÇARŞI (video slot)                                           */
/* ================================================================== */

export interface BazaarLineWin {
  line: number;
  sym: BazaarSymbol;
  count: number;
  /** toplam bahsin katı, yüzde birlik */
  pay: number;
}

export interface BazaarSpin {
  /** grid[reel][row] */
  grid: BazaarSymbol[][];
  lines: BazaarLineWin[];
  scatters: number;
  scatterPay: number;
  /** bu dönüşün toplam kazancı, bahsin katı × 100 (bedava dönüş çarpanı dahil) */
  win: number;
  retrigger?: boolean;
}

const BAZAAR_W = BAZAAR_WEIGHTS.map((w) => BAZAAR_SYMBOLS.map((s) => w[s]));

function bazaarGrid(rng: Rng): BazaarSymbol[][] {
  return BAZAAR_W.map((weights) =>
    [0, 1, 2].map(() => BAZAAR_SYMBOLS[rng.weightedIndex(weights)]!),
  );
}

/** Izgarayı değerlendirir: soldan sağa çizgiler + her yerde sayılan anahtarlar. */
export function evalBazaar(grid: BazaarSymbol[][]): Omit<BazaarSpin, "grid" | "win"> & { base: number } {
  const lines: BazaarLineWin[] = [];
  BAZAAR_LINES.forEach((rows, li) => {
    const first = grid[0]![rows[0]!]!;
    if (first === "W" || first === "S") return; // 1. makarada joker yok; anahtar çizgi açmaz
    let count = 1;
    while (count < 5) {
      const cell = grid[count]![rows[count]!]!;
      if (cell !== first && cell !== "W") break;
      count++;
    }
    if (count >= 3) lines.push({ line: li, sym: first, count, pay: BAZAAR_PAYS[first][count - 3]! });
  });
  const scatters = grid.flat().filter((s) => s === "S").length;
  const scatterPay = scatters >= 3 ? BAZAAR_SCATTER_PAYS[Math.min(scatters, 5) - 3]! : 0;
  const base = lines.reduce((a, l) => a + l.pay, 0) + scatterPay;
  return { lines, scatters, scatterPay, base };
}

export function resolveBazaarSlot(rng: Rng, bet: number): Outcome {
  const first = bazaarGrid(rng);
  const e0 = evalBazaar(first);
  const baseSpin: BazaarSpin = { grid: first, lines: e0.lines, scatters: e0.scatters, scatterPay: e0.scatterPay, win: e0.base };
  let total = e0.base;

  const free: BazaarSpin[] = [];
  if (e0.scatters >= 3) {
    let awarded = BAZAAR_FREE_SPINS;
    let left = BAZAAR_FREE_SPINS;
    while (left > 0) {
      left--;
      const g = bazaarGrid(rng);
      const e = evalBazaar(g);
      const retrigger = e.scatters >= 3 && awarded < BAZAAR_FS_CAP;
      if (retrigger) {
        const add = Math.min(BAZAAR_FREE_SPINS, BAZAAR_FS_CAP - awarded);
        awarded += add;
        left += add;
      }
      const win = e.base * BAZAAR_FS_MULT;
      total += win;
      free.push({ grid: g, lines: e.lines, scatters: e.scatters, scatterPay: e.scatterPay, win, retrigger });
    }
  }

  const capped = total > BAZAAR_MAX_WIN_X * 100;
  if (capped) total = BAZAAR_MAX_WIN_X * 100;
  return {
    payout: floorDiv(bet * total, 100),
    mult: total / 100,
    detail: { base: baseSpin, free, capped },
  };
}

/* ================================================================== */
/* BLACKJACK                                                          */
/* ================================================================== */

/** Kart: 0..51 = rank·4 + renk; rank 0..12 → 2..10, J, Q, K, A (Yüksek/Alçak ile aynı). */
export const bjCardValue = (card: number): number => {
  const rank = Math.floor(card / 4);
  if (rank === 12) return 11; // as
  if (rank >= 8) return 10; // 10, J, Q, K
  return rank + 2;
};

/** Elin en iyi toplamı ve yumuşak (as 11 sayılıyor) olup olmadığı. */
export function bjTotal(cards: readonly number[]): { total: number; soft: boolean } {
  let hard = 0;
  let aces = 0;
  for (const c of cards) {
    const v = bjCardValue(c);
    if (v === 11) {
      aces++;
      hard += 1;
    } else hard += v;
  }
  const soft = aces > 0 && hard + 10 <= 21;
  return { total: soft ? hard + 10 : hard, soft };
}

export const bjIsBlackjack = (cards: readonly number[]) =>
  cards.length === 2 && bjTotal(cards).total === 21;

export type BjAction = "hit" | "stand" | "double";

export type BjResult = "blackjack" | "win" | "push" | "lose" | "bust" | "dealer_blackjack";

export interface BjState {
  /** Karılmış 6 desteden sırayla çekilecek kartlar. İSTEMCİYE GİTMEZ. */
  shoe: number[];
  pos: number;
  player: number[];
  dealer: number[];
  doubled: boolean;
  actions: BjAction[];
  phase: "player" | "done";
}

/**
 * 6 desteden (312 kart) iadesiz BJ_SHOE_DRAW kart çeker. Bir elde en
 * fazla ~40 kart kullanılabilir; 80 her durumda yeter.
 */
function bjShoe(rng: Rng): number[] {
  const counts = new Array<number>(52).fill(BJ_DECKS);
  let left = 52 * BJ_DECKS;
  const out: number[] = [];
  for (let i = 0; i < BJ_SHOE_DRAW; i++) {
    let r = rng.int(left);
    let card = 0;
    while (r >= counts[card]!) {
      r -= counts[card]!;
      card++;
    }
    counts[card]!--;
    left--;
    out.push(card);
  }
  return out;
}

function bjDraw(s: BjState): number {
  const card = s.shoe[s.pos];
  if (card === undefined) throw new Error("ayakkabı bitti — BJ_SHOE_DRAW yetersiz");
  s.pos++;
  return card;
}

/** Krupiye: 17'nin altında çeker, yumuşak 17'de de çeker (H17). */
function bjDealerPlay(s: BjState): void {
  for (;;) {
    const { total, soft } = bjTotal(s.dealer);
    if (total > 17 || (total === 17 && !soft)) return;
    s.dealer.push(bjDraw(s));
  }
}

/** Oyuncu durdu ya da ikiye katladı: el biter, gerekiyorsa krupiye oynar. */
function bjFinish(s: BjState): void {
  s.phase = "done";
  if (bjTotal(s.player).total <= 21) bjDealerPlay(s);
}

/** İlk dağıtım: oyuncu, krupiye, oyuncu, krupiye. Doğal blackjack'ler hemen biter. */
export function bjStart(rng: Rng): BjState {
  const s: BjState = { shoe: bjShoe(rng), pos: 0, player: [], dealer: [], doubled: false, actions: [], phase: "player" };
  s.player.push(bjDraw(s));
  s.dealer.push(bjDraw(s));
  s.player.push(bjDraw(s));
  s.dealer.push(bjDraw(s));
  // Krupiye as ya da onluk gösteriyorsa blackjack'e bakar (peek).
  if (bjIsBlackjack(s.player) || bjIsBlackjack(s.dealer)) s.phase = "done";
  return s;
}

export const bjCanDouble = (s: BjState) => s.phase === "player" && s.player.length === 2 && !s.doubled;

/** Tek oyuncu hamlesi. Geçersiz hamlede fırlatır; durum kopyalanır, yerinde değişmez. */
export function bjAct(prev: BjState, action: BjAction): BjState {
  if (prev.phase !== "player") throw new Error("el bitti");
  const s: BjState = { ...prev, player: [...prev.player], dealer: [...prev.dealer], actions: [...prev.actions, action] };
  switch (action) {
    case "hit": {
      s.player.push(bjDraw(s));
      const t = bjTotal(s.player).total;
      if (t > 21) s.phase = "done"; // battı — krupiye kart açmaz
      else if (t === 21) bjFinish(s); // 21'de otomatik dur
      return s;
    }
    case "double": {
      if (!bjCanDouble(prev)) throw new Error("ikiye katlama yalnız ilk iki kartta");
      s.doubled = true;
      s.player.push(bjDraw(s));
      bjFinish(s);
      return s;
    }
    case "stand":
      bjFinish(s);
      return s;
  }
}

/** Biten elin sonucu ve ödemesi. `bet` = ilk bahis; katlandıysa toplam 2·bet. */
export function bjSettle(s: BjState, bet: number): { result: BjResult; payout: number; stake: number } {
  const stake = s.doubled ? bet * 2 : bet;
  const p = bjTotal(s.player).total;
  const d = bjTotal(s.dealer).total;
  const pBJ = bjIsBlackjack(s.player) && s.actions.length === 0;
  const dBJ = bjIsBlackjack(s.dealer);
  if (pBJ && dBJ) return { result: "push", payout: bet, stake };
  if (pBJ) return { result: "blackjack", payout: bet + floorDiv(bet * BJ_PAY_NUM, BJ_PAY_DEN), stake };
  if (dBJ) return { result: "dealer_blackjack", payout: 0, stake };
  if (p > 21) return { result: "bust", payout: 0, stake };
  if (d > 21 || p > d) return { result: "win", payout: stake * 2, stake };
  if (p === d) return { result: "push", payout: stake, stake };
  return { result: "lose", payout: 0, stake };
}

/**
 * Eli baştan sona yeniden oynatır: aynı tohum + aynı hamleler → aynı sonuç.
 * Doğrulama sayfası ve simülasyon bunu kullanır; hamleler bittiğinde el
 * hâlâ açıksa oyuncu durmuş sayılır (sunucudaki süre aşımıyla aynı değil —
 * süresi geçen el kaybedilir; doğrulama yalnız kapanmış elleri çözer).
 */
export function resolveBlackjack(rng: Rng, bet: number, actions: readonly BjAction[]): Outcome {
  let s = bjStart(rng);
  for (const a of actions) {
    if (s.phase !== "player") break;
    s = bjAct(s, a);
  }
  if (s.phase === "player") s = bjAct(s, "stand");
  const r = bjSettle(s, bet);
  return {
    payout: r.payout,
    mult: r.stake > 0 ? r.payout / r.stake : 0,
    detail: {
      player: s.player,
      dealer: s.dealer,
      actions: s.actions,
      doubled: s.doubled,
      result: r.result,
      playerTotal: bjTotal(s.player).total,
      dealerTotal: bjTotal(s.dealer).total,
    },
  };
}
