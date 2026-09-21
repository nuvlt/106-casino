"use client";

import { coins } from "@/lib/format";
import { MAX_BET, MIN_BET, COIN } from "@/lib/games/config";

const PRESETS = [
  { v: 10, face: "#2f80ed", edge: "#1d5fae" },
  { v: 50, face: "#1f8b4c", edge: "#0b3d22" },
  { v: 100, face: "#e01e37", edge: "#7a0d1d" },
  { v: 250, face: "#9d5cff", edge: "#4a0d8a" },
  { v: 500, face: "#ffc94a", edge: "#8d6205" },
].map((p) => ({ ...p, amount: p.v * COIN }));

/** Bahis seçici — gerçek jeton görünümlü. Sınırlar sunucuda da zorlanır. */
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
    <div className="gold-hairline rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest text-muted">Bahis</span>
        <span className="tabular font-display text-xl font-black text-gold">{coins(bet)}</span>
      </div>

      <div className="mb-2.5 flex justify-between gap-1.5">
        {PRESETS.map((p) => {
          const active = bet === p.amount;
          const off = disabled || p.amount > balance;
          return (
            <button
              key={p.v}
              disabled={off}
              onClick={() => setBet(p.amount)}
              aria-label={`${p.v} coin`}
              className={`relative grid size-12 shrink-0 place-items-center rounded-full
                font-display text-xs font-black transition disabled:opacity-25
                ${active ? "scale-110 -translate-y-0.5" : "active:scale-95"}`}
              style={{
                background: `radial-gradient(circle at 50% 35%, ${p.face} 0 54%, ${p.edge} 55% 100%)`,
                boxShadow: active
                  ? `0 0 0 2.5px #ffd062, 0 6px 14px rgba(0,0,0,0.55)`
                  : `0 4px 10px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.35)`,
                color: p.v === 500 ? "#3a2500" : "#ffffff",
              }}
            >
              {/* jeton kenarındaki çentikler */}
              <span
                className="pointer-events-none absolute inset-0 rounded-full opacity-70"
                style={{
                  background: `repeating-conic-gradient(rgba(255,255,255,0.55) 0deg 8deg, transparent 8deg 30deg)`,
                  maskImage: "radial-gradient(circle, transparent 60%, black 62%, black 76%, transparent 78%)",
                  WebkitMaskImage:
                    "radial-gradient(circle, transparent 60%, black 62%, black 76%, transparent 78%)",
                }}
              />
              <span className="relative">{p.v}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        {[
          { label: "½", fn: () => setBet(clamp(Math.floor(bet / 2))) },
          { label: "2×", fn: () => setBet(clamp(bet * 2)) },
          { label: "hepsi", fn: () => setBet(clamp(balance)) },
        ].map((b) => (
          <button
            key={b.label}
            disabled={disabled}
            onClick={b.fn}
            className="flex-1 rounded-xl bg-white/6 py-2 text-xs font-black text-white/75
                       ring-1 ring-white/10 transition active:bg-white/14 disabled:opacity-30"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
