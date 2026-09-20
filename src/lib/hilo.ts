/**
 * Higher/Lower turunun sunucu tarafı durumu.
 *
 * Deste `secret` alanında durur; istemci yalnızca açılmış kartları ve
 * sıradaki adımın olasılıklarını görür. Oyuncunun desteyi önceden
 * bilmesi imkânsızdır.
 */

import { hlOdds, hlRank, hlSuit, type HlState } from "@/lib/games/engine";
import { RTP_BPS } from "@/lib/games/config";

const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUIT_LABELS = ["♣", "♦", "♥", "♠"];

export const cardLabel = (card: number) =>
  `${RANK_LABELS[hlRank(card)] ?? "?"}${SUIT_LABELS[hlSuit(card)] ?? ""}`;

export interface HiloSecret {
  deck: number[];
  position: number;
  mult: number;
}

export interface HiloPublic {
  cards: { value: number; label: string }[];
  mult: number;
  step: number;
  odds: { higher: number; lower: number };
  nextMult: { higher: number | null; lower: number | null };
}

const toState = (s: HiloSecret): HlState => ({ deck: s.deck, position: s.position, mult: s.mult });

/**
 * Bir sonraki adımın olasılıkları ve ödeyeceği birikmiş çarpanlar.
 *
 * Ev avantajı YALNIZCA ilk adımda uygulanır (×0,95); sonraki adımlar tam
 * adil (1/p) öder. Böylece oyuncu kaç adım giderse gitsin turun RTP'si
 * tam %95 kalır — adım başına avantaj uygulansaydı 5 adımlık zincir
 * %77'ye düşerdi.
 */
export function describe(secret: HiloSecret): HiloPublic {
  const state = toState(secret);
  const odds = hlOdds(state);
  const edge = secret.position === 0 ? RTP_BPS / 10_000 : 1;

  const stepMult = (p: number) => (p > 0 ? secret.mult * (1 / p) * edge : null);

  return {
    cards: secret.deck.slice(0, secret.position + 1).map((value) => ({ value, label: cardLabel(value) })),
    mult: secret.mult,
    step: secret.position,
    odds,
    nextMult: {
      higher: odds.higher > 0 ? round2(stepMult(odds.higher)) : null,
      lower: odds.lower > 0 ? round2(stepMult(odds.lower)) : null,
    },
  };
}

const round2 = (v: number | null) => (v == null ? null : Math.round(v * 10_000) / 10_000);
