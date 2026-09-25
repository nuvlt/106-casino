/**
 * Oyun parametrelerinin SUNUCU tarafı doğrulaması.
 *
 * İstemciden gelen hiçbir çarpan, olasılık veya ödeme değeri kullanılmaz —
 * yalnızca oyuncunun SEÇİMLERİ alınır (zar eşiği, plinko riski, seçilen kutu)
 * ve bunların geçerli aralıkta olduğu burada zorlanır.
 */

import { z } from "zod";
import {
  DICE_MAX_WIN_OUTCOMES,
  DICE_MIN_WIN_OUTCOMES,
  GUESS_MAX_PICKS,
  GUESS_RANGE,
  MAX_BET,
  MIN_BET,
  MYSTERY_BOX_COUNT,
  CRASH_MAX_MULT,
  ROULETTE_MAX_BETS,
  ROULETTE_POCKETS,
} from "@/lib/games/config";

export const betAmount = z
  .number()
  .int("Bahis tam sayı olmalı")
  .min(MIN_BET, `En az ${MIN_BET / 100} coin`)
  .max(MAX_BET, `En fazla ${MAX_BET / 100} coin`);

export const idempotencyKey = z.string().min(8).max(100);

const base = z.object({ bet: betAmount, idempotencyKey });

export const wheelParams = base;

export const diceParams = base.extend({
  /** Kazanan sonuç sayısı — 10.000 üzerinden. Çarpan bundan türetilir. */
  winOutcomes: z.number().int().min(DICE_MIN_WIN_OUTCOMES).max(DICE_MAX_WIN_OUTCOMES),
  mode: z.enum(["under", "over"]),
});

export const plinkoParams = base.extend({
  risk: z.enum(["low", "medium", "high"]),
  rows: z.union([z.literal(8), z.literal(12), z.literal(16)]),
});

export const scratchParams = base;

export const guessParams = base.extend({
  picks: z
    .array(z.number().int().min(1).max(GUESS_RANGE))
    .min(1)
    .max(GUESS_MAX_PICKS)
    .refine((a) => new Set(a).size === a.length, "Aynı sayı iki kez seçilemez"),
});

export const mysteryParams = base.extend({
  tier: z.enum(["bronze", "silver", "gold"]),
  pick: z.number().int().min(0).max(MYSTERY_BOX_COUNT - 1),
});

export const crashStartParams = base.extend({
  /**
   * Otomatik çekim hedefi (yüzde birlik). Tur başında yazılır, sonuç
   * zamandan bağımsız hesaplanır — ağ gecikmesinden etkilenmez.
   */
  autoCashout: z.number().int().min(101).max(CRASH_MAX_MULT).nullish(),
});

/* --------------------------- RULET --------------------------- */

const chip = z.number().int("Tutar tam sayı olmalı").min(MIN_BET, `Her bahis en az ${MIN_BET / 100} coin`);

const rouletteBet = z.union([
  z.object({ kind: z.literal("straight"), n: z.number().int().min(0).max(ROULETTE_POCKETS - 1), amount: chip }),
  z.object({ kind: z.enum(["red", "black", "odd", "even", "low", "high"]), amount: chip }),
  z.object({ kind: z.enum(["dozen", "column"]), n: z.number().int().min(1).max(3), amount: chip }),
]);

/**
 * Rulet: tek çevirmede birden fazla bahis. Toplam, tek bahisli oyunlardaki
 * sınırlara tabi; aynı alana iki ayrı bahis gönderilemez (istemci birleştirir).
 * Çıktıya `bet` (toplam) eklenir ki ortak bahis akışı değişmeden kullanılsın.
 */
export const rouletteParams = z
  .object({
    idempotencyKey,
    bets: z.array(rouletteBet).min(1, "En az bir bahis").max(ROULETTE_MAX_BETS, `En fazla ${ROULETTE_MAX_BETS} bahis`),
  })
  .refine(
    (b) => new Set(b.bets.map((x) => `${x.kind}:${"n" in x ? x.n : ""}`)).size === b.bets.length,
    "Aynı alana iki ayrı bahis konamaz",
  )
  .transform((b) => ({ ...b, bet: b.bets.reduce((a, x) => a + x.amount, 0) }))
  .pipe(
    z.object({
      idempotencyKey,
      bets: z.array(rouletteBet),
      bet: betAmount,
    }),
  );

/* --------------------------- SLOTLAR --------------------------- */

export const classicSlotParams = base;
export const bazaarSlotParams = base;

export const roundIdParam = z.object({ roundId: z.string().min(1) });

/* -------------------------- BLACKJACK -------------------------- */

export const blackjackStartParams = base;

export const blackjackActionParams = roundIdParam.extend({
  action: z.enum(["hit", "stand", "double"]),
  /**
   * İstemcinin gördüğü hamle sayısı. Sunucudaki elle uyuşmazsa (çift
   * tıklama, ağ tekrarı, iki sekme) hamle reddedilir — aynı "kart çek"
   * iki kez işlenip iki kart verilmez.
   */
  step: z.number().int().min(0).max(40),
});

export const hiloStartParams = base;

export const hiloStepParams = roundIdParam.extend({
  guess: z.enum(["higher", "lower"]),
});

export const seedRotateParams = z.object({
  clientSeed: z.string().trim().min(1).max(64).optional(),
});

/** Zod hatasını okunabilir tek satıra indirger. */
export function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "istek"}: ${issue.message}` : "Geçersiz istek";
}
