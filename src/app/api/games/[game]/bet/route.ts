/**
 * POST /api/games/:game/bet — tek adımlı oyunların tamamı.
 *
 * Wheel, Dice, Plinko, Scratch, Guess, Mystery, Rulet, Klasik 777 ve
 * Kapalıçarşı aynı akıştan geçer:
 * doğrula → bakiyeyi atomik düş → sunucuda çöz → öde → defterle.
 * İstemci yalnızca sonucun animasyonunu oynatır.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { fail } from "@/lib/api";
import { gameRoute } from "@/lib/game-routes";
import { settleRound, type Game } from "@/lib/wallet";
import type { Outcome } from "@/lib/games/engine";
import type { Rng } from "@/lib/games/rng-core";
import {
  resolveBazaarSlot,
  resolveClassicSlot,
  resolveDice,
  resolveGuess,
  resolveMystery,
  resolvePlinko,
  resolveRoulette,
  resolveScratch,
  resolveWheel,
} from "@/lib/games/engine";
import {
  bazaarSlotParams,
  classicSlotParams,
  diceParams,
  guessParams,
  mysteryParams,
  plinkoParams,
  rouletteParams,
  scratchParams,
  wheelParams,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

/** URL parçası → (şema, oyun kodu, çözücü) eşlemesi. */
const GAMES = {
  wheel: {
    game: "WHEEL" as Game,
    schema: wheelParams,
    resolve: (b: z.infer<typeof wheelParams>) => (rng: Rng) => resolveWheel(rng, b.bet),
  },
  dice: {
    game: "DICE" as Game,
    schema: diceParams,
    resolve: (b: z.infer<typeof diceParams>) => (rng: Rng) =>
      resolveDice(rng, b.bet, b.winOutcomes, b.mode),
  },
  plinko: {
    game: "PLINKO" as Game,
    schema: plinkoParams,
    resolve: (b: z.infer<typeof plinkoParams>) => (rng: Rng) =>
      resolvePlinko(rng, b.bet, b.risk, b.rows),
  },
  scratch: {
    game: "SCRATCH" as Game,
    schema: scratchParams,
    resolve: (b: z.infer<typeof scratchParams>) => (rng: Rng) => resolveScratch(rng, b.bet),
  },
  guess: {
    game: "GUESS" as Game,
    schema: guessParams,
    resolve: (b: z.infer<typeof guessParams>) => (rng: Rng) => resolveGuess(rng, b.bet, b.picks),
  },
  mystery: {
    game: "MYSTERY" as Game,
    schema: mysteryParams,
    resolve: (b: z.infer<typeof mysteryParams>) => (rng: Rng) =>
      resolveMystery(rng, b.bet, b.tier, b.pick),
  },
  roulette: {
    game: "ROULETTE" as Game,
    schema: rouletteParams,
    // `bet` şemada bahislerin toplamı olarak üretilir; ortak akış değişmez.
    resolve: (b: z.infer<typeof rouletteParams>) => (rng: Rng) => resolveRoulette(rng, b.bets),
  },
  slot: {
    game: "SLOT_CLASSIC" as Game,
    schema: classicSlotParams,
    resolve: (b: z.infer<typeof classicSlotParams>) => (rng: Rng) => resolveClassicSlot(rng, b.bet),
  },
  bazaar: {
    game: "SLOT_BAZAAR" as Game,
    schema: bazaarSlotParams,
    resolve: (b: z.infer<typeof bazaarSlotParams>) => (rng: Rng) => resolveBazaarSlot(rng, b.bet),
  },
} as const;

export type SingleStepGame = keyof typeof GAMES;

export async function POST(req: NextRequest, ctx: { params: Promise<{ game: string }> }) {
  const { game } = await ctx.params;
  const entry = GAMES[game as SingleStepGame];

  if (!entry) {
    return fail(404, `Bilinmeyen oyun: ${game}`, "UNKNOWN_GAME");
  }

  return gameRoute(entry.schema, async ({ user, body }) => {
    const resolve = (entry.resolve as (b: unknown) => (rng: Rng) => Outcome)(body);

    const { idempotencyKey, bet, ...params } = body as {
      idempotencyKey: string;
      bet: number;
      [k: string]: unknown;
    };

    return settleRound(db, {
      userId: user.id,
      game: entry.game,
      bet,
      params,
      idempotencyKey,
      resolve,
    });
  })(req);
}
