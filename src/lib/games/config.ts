/**
 * 106 Casino — oyun sabitleri
 *
 * PARA BİRİMİ
 * -----------
 * Bakiye ve bahisler veritabanında TAM SAYI "centicoin" olarak tutulur.
 * 1 coin = 100 centicoin. Günlük hak 1.000 coin = 100_000 centicoin.
 * Böylece ondalık yuvarlama hatası birikmez (para hiçbir zaman float değildir).
 *
 * ÇARPANLAR
 * ---------
 * Tüm çarpanlar da tam sayı "yüzde birlik" (hundredths): 150 = 1.50x.
 * Ödeme:  payout = floor(bet * multiplier / 100)
 *
 * RTP
 * ---
 * Sekiz oyunun tamamı tam olarak %95. Kaynak kod bunu iddia etmiyor,
 * scripts/simulate.ts hem teorik hem Monte Carlo ile ölçüp doğruluyor.
 */

export const COIN = 100; // 1 coin = 100 centicoin
export const RTP_BPS = 9500; // %95, on binde birlik
export const RTP_HUNDREDTHS = 95;

export const DAILY_GRANT = 1_000 * COIN;
export const MIN_BET = 10 * COIN;
export const MAX_BET = 500 * COIN;

/** Üst üste giriş günü başına ekstra hak (gün 1..7, sonrası 7'de sabit). */
export const STREAK_BONUS: readonly number[] = [
  0, // gün 1 — sadece günlük hak
  100 * COIN, // gün 2
  200 * COIN, // gün 3
  350 * COIN, // gün 4
  500 * COIN, // gün 5
  750 * COIN, // gün 6
  1_500 * COIN, // gün 7 ve sonrası
];

/* ------------------------------------------------------------------ */
/* LUCKY WHEEL                                                         */
/* ------------------------------------------------------------------ */
/** Ağırlıklar 10.000 üzerinden. Σ(w·m) = 9500 → RTP tam %95. */
export const WHEEL_SEGMENTS: readonly { mult: number; weight: number; label: string }[] = [
  { mult: 0, weight: 3880, label: "Boş" },
  { mult: 50, weight: 2600, label: "0.5x" },
  { mult: 100, weight: 1800, label: "1x" },
  { mult: 200, weight: 1200, label: "2x" },
  { mult: 500, weight: 400, label: "5x" },
  { mult: 1000, weight: 100, label: "10x" },
  { mult: 5000, weight: 20, label: "50x" },
];

/* ------------------------------------------------------------------ */
/* CRASH                                                               */
/* ------------------------------------------------------------------ */
export const CRASH_MAX_MULT = 1_000_000; // 10.000,00x tavan
/** m(t) = e^(λt); λ = ln2/5 → 5 saniyede 2x, ~16.6 saniyede 10x. */
export const CRASH_LAMBDA = Math.LN2 / 5;

/* ------------------------------------------------------------------ */
/* DICE                                                                */
/* ------------------------------------------------------------------ */
/** 0.00–99.99 arası 10.000 eşit olasılıklı sonuç. */
export const DICE_OUTCOMES = 10_000;
export const DICE_MIN_WIN_OUTCOMES = 100; // en agresif bahis: %1 şans → 95.00x
export const DICE_MAX_WIN_OUTCOMES = 9_500; // en güvenli bahis: %95 şans → 1.00x

/* ------------------------------------------------------------------ */
/* PLINKO                                                              */
/* ------------------------------------------------------------------ */
/** scripts/calibrate-plinko.ts çıktısı. Her tablo simetrik ve tam %95. */
/**
 * Aynı hamlede atılabilecek en çok top. Her top ayrı bir turdur, yani
 * toplam bahis = bahis × top sayısı. Üst sınır bakiyeye göre de
 * daralır; bu yalnızca mutlak tavan.
 */
export const PLINKO_MAX_BALLS = 10;

/** Arayüzdeki top sayısı seçenekleri. */
export const PLINKO_BALL_CHOICES = [1, 3, 5, 10] as const;

export const PLINKO_TABLES: Record<string, readonly number[]> = {
  low_8: [598, 285, 125, 67, 58, 67, 125, 285, 598],
  medium_8: [1881, 577, 122, 27, 21, 27, 122, 577, 1881],
  high_8: [4098, 691, 58, 10, 10, 10, 58, 691, 4098],
  low_12: [714, 444, 263, 151, 94, 74, 71, 74, 94, 151, 263, 444, 714],
  medium_12: [3316, 1560, 635, 216, 70, 39, 38, 39, 70, 216, 635, 1560, 3316],
  high_12: [12792, 4140, 1043, 181, 22, 10, 10, 10, 22, 181, 1043, 4140, 12792],
  low_16: [790, 551, 374, 250, 166, 114, 89, 79, 78, 79, 89, 114, 166, 250, 374, 551, 790],
  medium_16: [4527, 2601, 1388, 672, 296, 124, 65, 52, 51, 52, 65, 124, 296, 672, 1388, 2601, 4527],
  high_16: [27108, 11857, 4570, 1487, 385, 78, 22, 17, 16, 17, 22, 78, 385, 1487, 4570, 11857, 27108],
};

/* ------------------------------------------------------------------ */
/* SCRATCH CARD                                                        */
/* ------------------------------------------------------------------ */
/** 3x3 kazı-kazan. Aynı semboldan üç tane → ödül. Σ(w·m) = 9500. */
export const SCRATCH_PRIZES: readonly { mult: number; weight: number; symbol: string }[] = [
  { mult: 0, weight: 5062, symbol: "—" },
  { mult: 50, weight: 2500, symbol: "🍋" },
  { mult: 100, weight: 1200, symbol: "🍒" },
  { mult: 200, weight: 600, symbol: "🔔" },
  { mult: 500, weight: 400, symbol: "⭐" },
  { mult: 1000, weight: 180, symbol: "💎" },
  { mult: 2500, weight: 50, symbol: "👑" },
  { mult: 10000, weight: 8, symbol: "🏆" },
];

/* ------------------------------------------------------------------ */
/* NUMBER GUESS                                                        */
/* ------------------------------------------------------------------ */
export const GUESS_RANGE = 10; // 1..10
export const GUESS_MAX_PICKS = 9;

/* ------------------------------------------------------------------ */
/* MYSTERY BOXES                                                       */
/* ------------------------------------------------------------------ */
/** Üç kasa seviyesi — aynı RTP, farklı volatilite. Σ(w·m) = 9500. */
export const MYSTERY_TIERS: Record<
  "bronze" | "silver" | "gold",
  readonly { mult: number; weight: number }[]
> = {
  bronze: [
    { mult: 0, weight: 2250 },
    { mult: 50, weight: 2000 },
    { mult: 100, weight: 2500 },
    { mult: 150, weight: 1800 },
    { mult: 200, weight: 1050 },
    { mult: 300, weight: 400 },
  ],
  silver: [
    { mult: 0, weight: 5910 },
    { mult: 50, weight: 2500 },
    { mult: 200, weight: 1000 },
    { mult: 500, weight: 400 },
    { mult: 1500, weight: 150 },
    { mult: 5000, weight: 40 },
  ],
  gold: [
    { mult: 0, weight: 8475 },
    { mult: 100, weight: 1000 },
    { mult: 500, weight: 400 },
    { mult: 2000, weight: 100 },
    { mult: 10000, weight: 20 },
    { mult: 50000, weight: 5 },
  ],
};

export const MYSTERY_BOX_COUNT = 9; // ekranda 9 kutu gösterilir, biri seçilir

/* ------------------------------------------------------------------ */
/* HIGHER / LOWER                                                      */
/* ------------------------------------------------------------------ */
/**
 * 52 kartlık karılmış deste — beraberlik yok.
 * Ev avantajı SADECE ilk adımda uygulanır (×0.95); sonraki adımlar
 * matematiksel olarak adil (1/p) ödenir. Böylece oyuncu ister 1 ister
 * 20 adım gitsin, turun RTP'si her zaman tam %95 kalır.
 */
export const HL_DECK_SIZE = 52;
export const HL_MAX_STEPS = 25;
