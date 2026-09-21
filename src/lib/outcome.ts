/**
 * Tur sonucunun ekranda nasıl görüneceği — tek yerden.
 *
 * NEDEN: Ödeme (payout) sıfırdan büyük diye yeşil "+" basmak yanıltıcı.
 * 50 coin yatırıp 0,5x alan oyuncu 25 coin geri alır ama 25 coin KAYBETMİŞTİR.
 * Eski hâlde bu ekranda "+25" olarak yeşil görünüyordu. Burada ölçüt net
 * sonuçtur: kazanç ancak ödeme bahsi aştığında kazançtır.
 */

import { coins, mult as fmtMult } from "@/lib/format";

export interface Outcome {
  kind: "win" | "even" | "partial" | "loss";
  /** Büyük rakam. */
  headline: string;
  /** Tailwind renk sınıfı. */
  tone: string;
  /** Alt satır — çarpan ve geri gelen tutar. */
  note: string;
}

export function outcomeOf(payout: number, stake: number, mult: number): Outcome {
  const net = payout - stake;

  if (net > 0) {
    return {
      kind: "win",
      headline: `+${coins(net)}`,
      tone: "text-win",
      note: `${fmtMult(mult)} · ${coins(payout)} geri geldi`,
    };
  }
  if (net === 0 && stake > 0) {
    return {
      kind: "even",
      headline: "±0",
      tone: "text-white/70",
      note: `${fmtMult(mult)} · bahsin geri geldi`,
    };
  }
  if (payout > 0) {
    return {
      kind: "partial",
      headline: `−${coins(-net)}`,
      tone: "text-lose",
      note: `${fmtMult(mult)} · ${coins(payout)} geri geldi`,
    };
  }
  return {
    kind: "loss",
    headline: `−${coins(stake)}`,
    tone: "text-lose",
    note: "bu sefer olmadı",
  };
}
