/**
 * Tarayıcıda çalışan doğrulayıcı.
 *
 * Amaç şu: oyuncu sonucun doğruluğunu SUNUCUYA SORMADAN öğrenebilmeli.
 * Bu dosya node:crypto kullanmaz; HMAC'i tarayıcının kendi Web Crypto
 * motoru hesaplar ve sonucu `rng-core.ts`'teki Rng sınıfı ile aynı
 * `engine.ts` çözücülerine verir — yani sunucunun çalıştırdığı kodun
 * birebir aynısı. "Doğrulama sayfası da sunucunun dediğini yazıyor"
 * itirazının önünü kapatan şey bu.
 *
 * Web Crypto eşzamansız olduğu için baytlar önce toplu hesaplanır,
 * sonra eşzamanlı Rng'ye beslenir. Reddetme örneklemesi beklenenden
 * çok bayt tüketirse daha fazla blok hesaplanıp baştan denenir.
 */

import { Rng } from "@/lib/games/rng-core";
import {
  resolveBazaarSlot,
  resolveBlackjack,
  resolveClassicSlot,
  resolveDice,
  resolveGuess,
  resolveMystery,
  resolvePlinko,
  resolveRoulette,
  resolveScratch,
  resolveWheel,
  type BjAction,
  type Outcome,
  type RouletteBet,
} from "@/lib/games/engine";

const BLOCK = 32; // HMAC-SHA256 çıktısı

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** serverSeed'in taahhüt edilen hash'e gerçekten karşılık geldiğini sınar. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(digest);
}

/** cursor 0..count-1 için HMAC bloklarını üretip birleştirir. */
async function hmacBytes(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  blocks: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serverSeed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const out = new Uint8Array(blocks * BLOCK);
  for (let cursor = 0; cursor < blocks; cursor++) {
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${clientSeed}:${nonce}:${cursor}`),
    );
    out.set(new Uint8Array(sig), cursor * BLOCK);
  }
  return out;
}

class OutOfBytes extends Error {}

/** Hazır bayt dizisinden beslenen Rng. Bitince OutOfBytes atar. */
function rngFromBytes(bytes: Uint8Array): Rng {
  let i = 0;
  return new Rng(() => {
    if (i >= bytes.length) throw new OutOfBytes();
    return bytes[i++]!;
  });
}

export type VerifiableGame =
  | "WHEEL"
  | "DICE"
  | "PLINKO"
  | "SCRATCH"
  | "GUESS"
  | "MYSTERY"
  | "ROULETTE"
  | "SLOT_CLASSIC"
  | "SLOT_BAZAAR"
  | "BLACKJACK";

/** Tur parametreleri — sunucuya gönderilenlerin aynısı. */
export interface RoundParams {
  bet: number;
  winOutcomes?: number;
  mode?: "under" | "over";
  risk?: "low" | "medium" | "high";
  rows?: 8 | 12 | 16;
  picks?: number[];
  tier?: "bronze" | "silver" | "gold";
  pick?: number;
  bets?: RouletteBet[];
  /** Blackjack: oyuncunun hamleleri, sırasıyla. `bet` = ilk bahis. */
  actions?: BjAction[];
}

/** Oyun koduna göre doğru çözücüyü seçer. Motor kodu ortak. */
function resolverFor(game: VerifiableGame, p: RoundParams): (rng: Rng) => Outcome {
  switch (game) {
    case "WHEEL":
      return (rng) => resolveWheel(rng, p.bet);
    case "DICE":
      return (rng) => resolveDice(rng, p.bet, p.winOutcomes!, p.mode!);
    case "PLINKO":
      return (rng) => resolvePlinko(rng, p.bet, p.risk!, p.rows!);
    case "SCRATCH":
      return (rng) => resolveScratch(rng, p.bet);
    case "GUESS":
      return (rng) => resolveGuess(rng, p.bet, p.picks!);
    case "MYSTERY":
      return (rng) => resolveMystery(rng, p.bet, p.tier!, p.pick!);
    case "ROULETTE":
      return (rng) => resolveRoulette(rng, p.bets!);
    case "SLOT_CLASSIC":
      return (rng) => resolveClassicSlot(rng, p.bet);
    case "SLOT_BAZAAR":
      return (rng) => resolveBazaarSlot(rng, p.bet);
    case "BLACKJACK":
      // Deste turun başında tohumdan karılır; hamleler aynı sırayla
      // yeniden oynatılınca aynı kartlar, aynı sonuç çıkmalı.
      return (rng) => resolveBlackjack(rng, p.bet, p.actions ?? []);
  }
}

/**
 * Crash ve Hilo tek adımlı değil — bunlar ayrı ele alınır. Blackjack de
 * çok adımlı ama hamleler tur sonucunda saklandığı için baştan oynatılarak
 * doğrulanabiliyor.
 */
export const VERIFIABLE: readonly VerifiableGame[] = [
  "WHEEL",
  "DICE",
  "PLINKO",
  "SCRATCH",
  "GUESS",
  "MYSTERY",
  "ROULETTE",
  "SLOT_CLASSIC",
  "SLOT_BAZAAR",
  "BLACKJACK",
];

/**
 * Doğrulayıcıya verilecek parametreler. `params` sütunu bahsi içermez;
 * blackjack'te ise tur bahsi katlandıysa ilk bahsin iki katıdır ve
 * hamleler tur sonucunda durur.
 */
export function verifyParamsFor(r: {
  game: string;
  bet: number;
  params: unknown;
  result: unknown;
}): RoundParams {
  if (r.game === "BLACKJACK") {
    const res = (r.result ?? {}) as { doubled?: boolean; actions?: BjAction[] };
    return { bet: res.doubled ? r.bet / 2 : r.bet, actions: res.actions ?? [] };
  }
  return { ...((r.params ?? {}) as object), bet: r.bet };
}

/** Yarım kalıp süresi dolan el yeniden oynatılamaz (oyuncu hamlesini yapmadı). */
export function skipReason(r: { game: string; state?: string; result: unknown }): string | null {
  if (r.state === "OPEN") return "devam ediyor";
  if (r.game === "BLACKJACK" && (r.result as { phase?: string } | null)?.phase !== "done") {
    return "süresi dolan el";
  }
  return null;
}

export function isVerifiable(game: string): game is VerifiableGame {
  return (VERIFIABLE as readonly string[]).includes(game);
}

/**
 * Turu seed'lerden yeniden hesaplar. Sunucuya hiçbir şey sormaz.
 */
export async function recomputeRound(opts: {
  game: VerifiableGame;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  params: RoundParams;
}): Promise<Outcome> {
  const resolve = resolverFor(opts.game, opts.params);

  // Çoğu tur tek blokla biter; reddetme örneklemesi uzarsa büyütülür.
  for (const blocks of [4, 16, 64, 256]) {
    const bytes = await hmacBytes(opts.serverSeed, opts.clientSeed, opts.nonce, blocks);
    try {
      return resolve(rngFromBytes(bytes));
    } catch (e) {
      if (e instanceof OutOfBytes) continue;
      throw e;
    }
  }
  throw new Error("Tur yeniden hesaplanamadı: bayt bütçesi aşıldı");
}
