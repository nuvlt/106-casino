"use client";

import { coins } from "@/lib/format";
import { MAX_BET, MIN_BET, COIN } from "@/lib/games/config";

const PRESETS = [10, 50, 100, 250, 500].map((c) => c * COIN);

/** Bahis seçici — tüm oyunlarda aynı. Sınırlar sunucuda da zorlanır. */
export function BetControls({
  bet,
  setBet,
  balance,
  disabled,
}: {
  bet: number;
  setBet: (v: number) => void;
  balance: number;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.max(MIN_BET, Math.min(MAX_BET, Math.min(v, balance || MAX_BET)));

  return (
    <div className="rounded-3xl border border-white/8 bg-surface/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">Bahis</span>
        <span className="tabular font-display text-lg font-black text-gold">
          {coins(bet)} 🪙
        </span>
      </div>

      <div className="mb-2 flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            disabled={disabled || p > balance}
            onClick={() => setBet(p)}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition disabled:opacity-30 ${
              bet === p
                ? "bg-gold text-[#3a2500]"
                : "bg-white/6 text-white/70 active:bg-white/12"
            }`}
          >
            {p / COIN}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          disabled={disabled}
          onClick={() => setBet(clamp(Math.floor(bet / 2)))}
          className="flex-1 rounded-xl bg-white/6 py-2 text-xs font-bold text-white/70 active:bg-white/12 disabled:opacity-30"
        >
          ½
        </button>
        <button
          disabled={disabled}
          onClick={() => setBet(clamp(bet * 2))}
          className="flex-1 rounded-xl bg-white/6 py-2 text-xs font-bold text-white/70 active:bg-white/12 disabled:opacity-30"
        >
          2×
        </button>
        <button
          disabled={disabled}
          onClick={() => setBet(clamp(balance))}
          className="flex-1 rounded-xl bg-white/6 py-2 text-xs font-bold text-white/70 active:bg-white/12 disabled:opacity-30"
        >
          hepsi
        </button>
      </div>
    </div>
  );
}
