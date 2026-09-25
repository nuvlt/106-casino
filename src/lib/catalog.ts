/**
 * Oyun kataloğu — ana sayfadaki kartların ve oyun sayfalarının kaynağı.
 * URL parçaları API anahtarlarıyla aynı; ekranda Türkçe adlar görünür.
 */

export interface GameMeta {
  slug: string;
  title: string;
  tagline: string;
  /** Kart arka planı için degrade. */
  gradient: string;
  accent: string;
  emoji: string;
  /** Oynanışın ne kadar sert dalgalandığı — karta rozet olarak basılır. */
  volatility: "düşük" | "orta" | "yüksek";
  maxWin: string;
  ready: boolean;
  /** Kartta "YENİ" rozeti — yeni eklenen oyunlar birkaç hafta öne çıksın. */
  isNew?: boolean;
}

export const GAMES: readonly GameMeta[] = [
  {
    slug: "roulette",
    title: "Rulet",
    tagline: "0 ve 00'lı Amerikan masası",
    gradient: "from-[#3b0a0a] via-[#8b1a1a] to-[#1f8b4c]",
    accent: "#c8102e",
    emoji: "🔴",
    volatility: "orta",
    maxWin: "36x",
    ready: true,
    isNew: true,
  },
  {
    slug: "blackjack",
    title: "Blackjack",
    tagline: "21'e en yakın sen ol",
    gradient: "from-[#062a18] via-[#0f5132] to-[#3a7d44]",
    accent: "#1f8b4c",
    emoji: "♠️",
    volatility: "düşük",
    maxWin: "2,2x",
    ready: true,
    isNew: true,
  },
  {
    slug: "bazaar",
    title: "Kapalıçarşı",
    tagline: "Anahtarları bul, bedava dönüşleri aç",
    gradient: "from-[#2a0a3d] via-[#7a1f5c] to-[#e8a91b]",
    accent: "#e8a91b",
    emoji: "🧿",
    volatility: "yüksek",
    maxWin: "5.000x",
    ready: true,
    isNew: true,
  },
  {
    slug: "slot",
    title: "Klasik 777",
    tagline: "Üç makara, tek çizgi",
    gradient: "from-[#5c0a14] via-[#c8102e] to-[#ffb347]",
    accent: "#ffb347",
    emoji: "🍒",
    volatility: "orta",
    maxWin: "100x",
    ready: true,
    isNew: true,
  },
  {
    slug: "guess",
    title: "Sayı Tut",
    tagline: "1–10 arası, kaç tane istersen",
    gradient: "from-[#0c2d6b] via-[#2d7dd2] to-[#7dd3fc]",
    accent: "#2d7dd2",
    emoji: "🔢",
    volatility: "orta",
    maxWin: "9,5x",
    ready: true,
  },
  {
    slug: "hilo",
    title: "Yüksek / Alçak",
    tagline: "Zinciri uzat, istediğinde çek",
    gradient: "from-[#111827] via-[#374151] to-[#d62828]",
    accent: "#d62828",
    emoji: "🃏",
    volatility: "orta",
    maxWin: "zincire bağlı",
    ready: true,
  },
  {
    slug: "wheel",
    title: "Şans Çarkı",
    tagline: "Çevir ve altın dilimi yakala",
    gradient: "from-[#7a1220] via-[#b3341f] to-[#f5b921]",
    accent: "#f5b921",
    emoji: "🎡",
    volatility: "orta",
    maxWin: "100x",
    ready: true,
  },
  {
    slug: "crash",
    title: "Crash",
    tagline: "Patlamadan önce çek",
    gradient: "from-[#0b3b5c] via-[#1179a8] to-[#21d4fd]",
    accent: "#21d4fd",
    emoji: "🚀",
    volatility: "yüksek",
    maxWin: "10.000x",
    ready: true,
  },
  {
    slug: "dice",
    title: "Zar",
    tagline: "Eşiği sen belirle",
    gradient: "from-[#0f5132] via-[#1b7a43] to-[#4ade80]",
    accent: "#23d18b",
    emoji: "🎲",
    volatility: "düşük",
    maxWin: "95x",
    ready: true,
  },
  {
    slug: "plinko",
    title: "Plinko",
    tagline: "Top çivilerden süzülsün",
    gradient: "from-[#3b1470] via-[#6d28d9] to-[#a78bfa]",
    accent: "#8b5cf6",
    emoji: "🔻",
    volatility: "yüksek",
    maxWin: "271x",
    ready: true,
  },
  {
    slug: "scratch",
    title: "Kazı Kazan",
    tagline: "Üç aynı sembol bul",
    gradient: "from-[#7c2d12] via-[#c2410c] to-[#fbbf24]",
    accent: "#fb923c",
    emoji: "🎫",
    volatility: "orta",
    maxWin: "100x",
    ready: true,
  },
  {
    slug: "mystery",
    title: "Gizemli Kutular",
    tagline: "Dokuz kutu, bir seçim",
    gradient: "from-[#4a0d46] via-[#a21caf] to-[#ff2d95]",
    accent: "#ff2d95",
    emoji: "🎁",
    volatility: "yüksek",
    maxWin: "500x",
    ready: true,
  },
];

export const gameBySlug = (slug: string): GameMeta | undefined =>
  GAMES.find((g) => g.slug === slug);

/** API oyun kodu → katalog. Akış ve sıralamada ad göstermek için. */
export const GAME_BY_CODE: Record<string, GameMeta> = Object.fromEntries(
  (
    [
      ["WHEEL", "wheel"],
      ["CRASH", "crash"],
      ["DICE", "dice"],
      ["PLINKO", "plinko"],
      ["SCRATCH", "scratch"],
      ["GUESS", "guess"],
      ["MYSTERY", "mystery"],
      ["HIGHERLOWER", "hilo"],
      ["ROULETTE", "roulette"],
      ["SLOT_CLASSIC", "slot"],
      ["SLOT_BAZAAR", "bazaar"],
      ["BLACKJACK", "blackjack"],
    ] as const
  ).map(([code, slug]) => {
    const meta = gameBySlug(slug);
    if (!meta) throw new Error(`Katalogda ${slug} yok — GAME_BY_CODE bozuk`);
    return [code, meta];
  }),
);
