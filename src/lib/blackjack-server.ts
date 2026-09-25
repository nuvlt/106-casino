/**
 * Blackjack elinin sunucu tarafı kapanışı — üç uç (start, action, state)
 * aynı yoldan kapatır.
 */

import { db } from "@/db";
import { bjSettle } from "@/lib/games/engine";
import { describeBj, type BjPublic, type BjSecret } from "@/lib/blackjack";
import { settleOpenRound } from "@/lib/wallet";

export interface BjSettled {
  roundId: string;
  state: BjPublic;
  balance: number;
  settled: {
    payout: number;
    /** El sonunda yatırılmış toplam (katlandıysa 2 × bahis). */
    stake: number;
    mult: number;
    newBadges: { id: string; title: string; icon: string; reward: number }[];
  };
}

/** Biten eli öder ve kapatır. Koşullu kapanış: aynı el iki kez ödenmez. */
export async function finishBlackjack(userId: string, roundId: string, secret: BjSecret): Promise<BjSettled> {
  const r = bjSettle(secret, secret.bet);
  const state = describeBj(secret);
  const done = await settleOpenRound(db, {
    userId,
    roundId,
    game: "BLACKJACK",
    payout: r.payout,
    mult: r.stake > 0 ? r.payout / r.stake : 0,
    publicState: state,
  });
  return {
    roundId,
    state,
    balance: done.balance,
    settled: { payout: r.payout, stake: r.stake, mult: done.mult, newBadges: done.newBadges },
  };
}
