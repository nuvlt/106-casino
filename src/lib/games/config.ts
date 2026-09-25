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

/**
 * DAVET — linkle yeni katılan her oyuncu için iki tarafa da bir kerelik
 * bonus. Davet edenin bonusu ilk REFERRAL_MAX_REWARDED davetle sınırlı:
 * sonrakiler yine sayılır ama bonus vermez (sıralamayı davet sayısıyla
 * şişirmek mümkün olmasın). Bonus bakiyeye eklenir, zirveyi doğrudan
 * değiştirmez — kazanca çevirmek için oynamak gerekir.
 */
export const REFERRAL_BONUS = 250 * COIN;
export const REFERRAL_MAX_REWARDED = 10;

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
/**
 * Ağırlıklar 10.000 üzerinden. Σ(w·m) = 9500 → RTP tam %95.
 *
 * 0.5x ve 1x dilimleri bilerek YOK: oyuncu bunları kazanç değil kayıp
 * olarak algılıyordu (eski tabloda çevirmelerin %83'ü 1x veya altıydı).
 * Aynı RTP bütçesi gerçek kazançlara aktarıldı — çevirmelerin %37'si
 * kârla biter (eskiden %17), tavan 50x'ten 100x'e çıktı.
 */
export const WHEEL_SEGMENTS: readonly { mult: number; weight: number; label: string }[] = [
  { mult: 0, weight: 6295, label: "Boş" },
  { mult: 150, weight: 1600, label: "1.5x" },
  { mult: 200, weight: 1150, label: "2x" },
  { mult: 300, weight: 600, label: "3x" },
  { mult: 500, weight: 300, label: "5x" },
  { mult: 2000, weight: 50, label: "20x" },
  { mult: 10000, weight: 5, label: "100x" },
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
/**
 * 3x3 kazı-kazan. Aynı semboldan üç tane → ödül. Σ(w·m) = 9500.
 * Teselli ödülü (0.5x/1x) yok; kartların %29'u kârla biter (eskiden %12).
 */
export const SCRATCH_PRIZES: readonly { mult: number; weight: number; symbol: string }[] = [
  { mult: 0, weight: 7105, symbol: "—" },
  { mult: 150, weight: 1100, symbol: "🍋" },
  { mult: 200, weight: 825, symbol: "🍒" },
  { mult: 300, weight: 500, symbol: "🔔" },
  { mult: 500, weight: 300, symbol: "⭐" },
  { mult: 1000, weight: 120, symbol: "💎" },
  { mult: 2500, weight: 40, symbol: "👑" },
  { mult: 10000, weight: 10, symbol: "🏆" },
];

/* ------------------------------------------------------------------ */
/* NUMBER GUESS                                                        */
/* ------------------------------------------------------------------ */
export const GUESS_RANGE = 10; // 1..10
export const GUESS_MAX_PICKS = 9;

/* ------------------------------------------------------------------ */
/* MYSTERY BOXES                                                       */
/* ------------------------------------------------------------------ */
/**
 * Üç kasa seviyesi — aynı RTP, farklı volatilite. Σ(w·m) = 9500.
 * Kutuların içinde 0.5x/1x yok: açılan her kutu ya boş ya gerçek kazanç.
 *   Bronz: yarı yarıya kazanç, küçük çarpanlar (tavan 5x)
 *   Gümüş: üçte bir kazanç (tavan 50x)
 *   Altın: nadir ama büyük (tavan 500x)
 */
export const MYSTERY_TIERS: Record<
  "bronze" | "silver" | "gold",
  readonly { mult: number; weight: number }[]
> = {
  bronze: [
    { mult: 0, weight: 5050 },
    { mult: 150, weight: 3000 },
    { mult: 200, weight: 1250 },
    { mult: 300, weight: 500 },
    { mult: 500, weight: 200 },
  ],
  silver: [
    { mult: 0, weight: 6530 },
    { mult: 150, weight: 1500 },
    { mult: 200, weight: 1000 },
    { mult: 300, weight: 500 },
    { mult: 500, weight: 350 },
    { mult: 1000, weight: 100 },
    { mult: 5000, weight: 20 },
  ],
  gold: [
    { mult: 0, weight: 8600 },
    { mult: 200, weight: 1000 },
    { mult: 500, weight: 300 },
    { mult: 2000, weight: 75 },
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
/**
 * Yüksek/Alçak birikmiş çarpan tavanı — Crash'in tavanıyla aynı (10.000x).
 * Tavan olmadan uzun ve şanslı bir zincir, tutarları saklayan 32-bit
 * sütunları taşırabiliyordu (ödeme yazılamaz, tur kilitli kalırdı).
 * Tavana ulaşma olasılığı ihmal edilebilir; RTP'ye etkisi yok denecek kadar az.
 */
export const HL_MAX_MULT = 10_000;

/* ------------------------------------------------------------------ */
/* RULET (Amerikan: 0 ve 00)                                           */
/* ------------------------------------------------------------------ */
/**
 * 38 cep: 1–36, 0 ve 00. Her bahis türü gerçek rulet oranını öder
 * (tek sayı 35'e 1, renk 1'e 1, düzine 2'ye 1). Ev avantajını 0 ve 00
 * sağlar: her bahiste RTP = 36/38 = %94,737. Kurala hiç dokunulmadan
 * platformun %95 hedefine en yakın rulet.
 *
 * 0-00-1-2-3 "beşli" bahsi bilerek yok: Amerikan rulette RTP'si %92,1,
 * diğerlerinden kötü.
 */
export const ROULETTE_POCKETS = 38; // 0..36; 37 = "00"
export const ROULETTE_DOUBLE_ZERO = 37;
export const ROULETTE_RED: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
/** Ödeme, bahis dahil (brüt): tek sayı 36, dış bahisler 2 veya 3 katı. */
export const ROULETTE_PAYOUT = {
  straight: 36,
  red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2,
  dozen: 3, column: 3,
} as const;
/** Tek çevirmede en fazla farklı bahis. */
export const ROULETTE_MAX_BETS = 40;

/* ------------------------------------------------------------------ */
/* KLASİK 777 SLOT                                                     */
/* ------------------------------------------------------------------ */
/**
 * 3 makara, tek ödeme çizgisi. Sonuç önce ağırlıklı tablodan seçilir,
 * sonra o sonuca uyan makara görüntüsü o sınıftaki bütün dizilimler
 * arasından eşit olasılıkla kurulur (gerçek slotlardaki "sanal makara"
 * ile aynı ilke). Kaybeden görüntüler de eşit olasılıklı: "7-7-boş"
 * gibi kıl payı kaçırmalar bilerek sık gösterilmez.
 *
 * Ağırlıklar 10.000 üzerinden, Σ(w·m) = 950.000 → RTP tam %95.
 * Kazançların hepsi en az 1,5x (0,5x / 1x gibi "kazanç gibi görünen
 * kayıplar" yok). Çevirmelerin %32,25'i kazançlı.
 */
export type ClassicSymbol = "7" | "BAR" | "🔔" | "🍉" | "🍋" | "🍒";
export const CLASSIC_SYMBOLS: readonly ClassicSymbol[] = ["7", "BAR", "🔔", "🍉", "🍋", "🍒"];
export const CLASSIC_FRUITS: readonly ClassicSymbol[] = ["🍉", "🍋", "🍒"];

export type ClassicClass =
  | "lose" | "cherry2" | "mixed" | "cherry3" | "lemon3" | "melon3" | "bell3" | "bar3" | "seven3";

export const CLASSIC_TABLE: readonly { cls: ClassicClass; mult: number; weight: number; label: string }[] = [
  { cls: "lose", mult: 0, weight: 6775, label: "Eşleşme yok" },
  { cls: "cherry2", mult: 150, weight: 1500, label: "İki 🍒" },
  { cls: "mixed", mult: 200, weight: 800, label: "Karışık meyve" },
  { cls: "cherry3", mult: 300, weight: 450, label: "🍒🍒🍒" },
  { cls: "lemon3", mult: 500, weight: 250, label: "🍋🍋🍋" },
  { cls: "melon3", mult: 800, weight: 120, label: "🍉🍉🍉" },
  { cls: "bell3", mult: 1200, weight: 70, label: "🔔🔔🔔" },
  { cls: "bar3", mult: 2500, weight: 30, label: "BAR BAR BAR" },
  { cls: "seven3", mult: 10000, weight: 5, label: "7 7 7" },
];

/* ------------------------------------------------------------------ */
/* KAPALIÇARŞI (5 makara video slot)                                   */
/* ------------------------------------------------------------------ */
/**
 * 5×3 ızgara, 5 sabit çizgi. Her hücre makarasının ağırlık tablosundan
 * bağımsız çekilir. 🧿 Nazar joker (2–5. makaralarda, 🗝️ hariç her
 * şeyin yerine geçer), 🗝️ Çarşı anahtarı dağılım sembolü: ekranın
 * herhangi bir yerinde 3+ tane → ödeme + 10 bedava dönüş (kazançlar ×2,
 * bedava dönüşte tekrar tetiklenirse +10; toplam en fazla 50).
 *
 * Çizgi ödemeleri TOPLAM bahsin katı (yüzde birlik) — en küçük kazanç
 * 1,5x. RTP'yi scripts/verify-bazaar.ts TAM olarak hesaplar (her hücre
 * bağımsız olduğundan çizgi beklentisi kapalı biçimde bulunur, bedava
 * dönüş zinciri Wald özdeşliğiyle): %95,000017.
 */
export type BazaarSymbol = "H1" | "H2" | "H3" | "M1" | "M2" | "L1" | "L2" | "W" | "S";
export const BAZAAR_PAYING: readonly BazaarSymbol[] = ["H1", "H2", "H3", "M1", "M2", "L1", "L2"];
export const BAZAAR_SYMBOLS: readonly BazaarSymbol[] = [...BAZAAR_PAYING, "W", "S"];
export const BAZAAR_ICON: Record<BazaarSymbol, string> = {
  H1: "💰", H2: "🏺", H3: "🪔", M1: "☕", M2: "🫖", L1: "🌶️", L2: "🍬", W: "🧿", S: "🗝️",
};
export const BAZAAR_NAME: Record<BazaarSymbol, string> = {
  H1: "Altın kese", H2: "Küp", H3: "Kandil", M1: "Türk kahvesi", M2: "Çaydanlık",
  L1: "Baharat", L2: "Lokum", W: "Nazar (joker)", S: "Çarşı anahtarı",
};
/** Makara başına ağırlık; 1. makarada joker yok. */
export const BAZAAR_WEIGHTS: readonly Record<BazaarSymbol, number>[] = [0, 1, 2, 3, 4].map((i) => ({
  H1: 20, H2: 30, H3: 40, M1: 140, M2: 150, L1: 201, L2: 225, W: i === 0 ? 0 : 12, S: 22,
}));
/** 3 / 4 / 5 aynı sembol → toplam bahsin katı (yüzde birlik). */
export const BAZAAR_PAYS: Record<Exclude<BazaarSymbol, "W" | "S">, readonly [number, number, number]> = {
  H1: [600, 2000, 15000],
  H2: [450, 1500, 7500],
  H3: [350, 1000, 4000],
  M1: [300, 800, 3000],
  M2: [250, 600, 2000],
  L1: [200, 500, 1500],
  L2: [150, 400, 1000],
};
/** 3 / 4 / 5+ anahtar → toplam bahsin katı (yüzde birlik). */
export const BAZAAR_SCATTER_PAYS: readonly [number, number, number] = [200, 1000, 5000];
export const BAZAAR_LINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];
export const BAZAAR_FREE_SPINS = 10;
export const BAZAAR_FS_MULT = 2;
export const BAZAAR_FS_CAP = 50;
/** Tek turda (bedava dönüşler dahil) en fazla bahsin 5.000 katı. */
export const BAZAAR_MAX_WIN_X = 5_000;

/* ------------------------------------------------------------------ */
/* BLACKJACK                                                           */
/* ------------------------------------------------------------------ */
/**
 * 6 deste, her elde yeni karılır. Blackjack 6:5 öder, krupiye yumuşak
 * 17'de kart çeker (H17), as veya onluk açıkken krupiye blackjack'e
 * bakar (peek). İlk iki kartta ikiye katlama var; bölme (split),
 * sigorta ve teslim yok.
 *
 * Oyuncunun kararına bağlı olduğundan RTP sabit değil:
 *   kusursuz temel strateji → %97,3   (scripts/verify-blackjack.ts)
 *   "krupiye gibi oyna" (17'ye kadar çek) → daha düşük, sim çıktısına bakın
 */
export const BJ_DECKS = 6;
/** Bir elde en fazla kullanılabilecek kart sayısından fazlası çekilir. */
export const BJ_SHOE_DRAW = 80;
/** Blackjack ödemesi: 6:5 → bahis + bahis·6/5. */
export const BJ_PAY_NUM = 6;
export const BJ_PAY_DEN = 5;
export const BJ_ROUND_TTL_MS = 30 * 60_000;
