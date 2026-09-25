/**
 * Blackjack elinin istemciye gösterilen hâli.
 *
 * Ayakkabı (sıradaki kartlar) ve el sürerken krupiyenin kapalı kartı
 * `secret` alanında kalır; buradan üretilen görünümde yer almaz. El
 * bittiğinde kapalı kart ve krupiyenin çektikleri açılır.
 */

import {
  bjCanDouble,
  bjSettle,
  bjTotal,
  type BjAction,
  type BjResult,
  type BjState,
} from "@/lib/games/engine";
import { cardLabel } from "@/lib/hilo";

/** Sunucuda saklanan tam durum: motor durumu + ilk bahis. */
export interface BjSecret extends BjState {
  bet: number;
}

export interface BjCard {
  value: number;
  label: string;
}

export interface BjPublic {
  player: BjCard[];
  /** El sürerken ikinci kart null (kapalı). */
  dealer: (BjCard | null)[];
  playerTotal: number;
  playerSoft: boolean;
  /** El sürerken yalnız açık kartın değeri. */
  dealerTotal: number;
  phase: "player" | "done";
  canDouble: boolean;
  /** Şimdiye kadarki hamle sayısı — istemci bir sonraki hamlede geri gönderir. */
  step: number;
  actions: BjAction[];
  doubled: boolean;
  /** İlk bahis (centicoin). */
  bet: number;
  result?: BjResult;
  payout?: number;
}

const card = (value: number): BjCard => ({ value, label: cardLabel(value) });

export function describeBj(s: BjSecret): BjPublic {
  const done = s.phase === "done";
  const p = bjTotal(s.player);
  const view: BjPublic = {
    player: s.player.map(card),
    dealer: done ? s.dealer.map(card) : [card(s.dealer[0]!), null],
    playerTotal: p.total,
    playerSoft: p.soft,
    dealerTotal: done ? bjTotal(s.dealer).total : bjTotal([s.dealer[0]!]).total,
    phase: s.phase,
    canDouble: bjCanDouble(s),
    step: s.actions.length,
    actions: s.actions,
    doubled: s.doubled,
    bet: s.bet,
  };
  if (done) {
    const r = bjSettle(s, s.bet);
    view.result = r.result;
    view.payout = r.payout;
  }
  return view;
}

export const BJ_RESULT_TEXT: Record<BjResult, string> = {
  blackjack: "Blackjack!",
  win: "Kazandın",
  push: "Berabere",
  lose: "Krupiye kazandı",
  bust: "Battın",
  dealer_blackjack: "Krupiye blackjack yaptı",
};
