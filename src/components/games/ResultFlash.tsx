"use client";

import { coins, mult as fmtMult } from "@/lib/format";

/** Tur sonucu — kazançta altın, kayıpta sessiz. */
export function ResultFlash({
  payout,
  mult,
  badges,
}: {
  payout: number;
  mult: number;
  badges?: { id: string; title: string; icon: string; reward: number }[];
}) {
  const won = payout > 0;
  return (
    <div className="animate-pop text-center">
      <div
        className={`font-display text-4xl font-black tabular ${
          won ? "text-win" : "text-white/35"
        }`}
      >
        {won ? `+${coins(payout)}` : "—"}
      </div>
      <div className={`mt-1 text-sm font-bold ${won ? "text-gold" : "text-white/40"}`}>
        {won ? fmtMult(mult) : "bu sefer olmadı"}
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
