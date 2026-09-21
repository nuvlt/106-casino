"use client";

import { coins } from "@/lib/format";
import { outcomeOf } from "@/lib/outcome";

/**
 * Tur sonucu. Ölçüt NET sonuçtur: bahsin altında kalan bir ödeme
 * kazanç değildir (bkz. src/lib/outcome.ts).
 */
export function ResultFlash({
  payout,
  stake,
  mult,
  badges,
}: {
  payout: number;
  stake: number;
  mult: number;
  badges?: { id: string; title: string; icon: string; reward: number }[];
}) {
  const o = outcomeOf(payout, stake, mult);
  return (
    <div className="animate-pop text-center">
      <div className={`font-display text-4xl font-black tabular ${o.tone}`}>{o.headline}</div>
      <div
        className={`mt-1 text-sm font-bold ${o.kind === "win" ? "text-gold" : "text-white/40"}`}
      >
        {o.note}
      </div>
      {badges && badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {badges.map((b) => (
            <span
              key={b.id}
              className="animate-pop rounded-full bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold"
            >
              {b.icon} {b.title} +{coins(b.reward)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
