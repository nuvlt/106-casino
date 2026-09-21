"use client";

import { Pill } from "@/components/ui";
import { coins } from "@/lib/format";
import type { MeResponse } from "@/hooks/useMe";

/**
 * Ana sayfanın kasa bölümü.
 * Yeşil çuha, altın çerçeve, jeton yığını — üstünde günün bakiyesi.
 */
export function Hero({ me }: { me: MeResponse }) {
  return (
    <div
      className="gloss relative mb-4 overflow-hidden rounded-3xl p-[2px]
                 bg-gradient-to-b from-[#ffd977] via-[#a9760a] to-[#7a5804]
                 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
    >
      <div
        className="relative overflow-hidden rounded-[22px] px-4 py-4
                   bg-[radial-gradient(120%_120%_at_50%_-20%,#2b9a5e_0%,#14663a_38%,#0a3a22_75%,#06281a_100%)]"
      >
        {/* çuha üstünde ışık halkası */}
        <div className="pointer-events-none absolute -left-10 -top-16 size-48 rounded-full bg-white/10 blur-2xl" />

        <div className="relative flex items-center gap-4">
          {/* jeton yığını */}
          <div className="relative size-16 shrink-0">
            <svg viewBox="0 0 64 64" className="size-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]">
              <defs>
                <linearGradient id="chipA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff8fa0" />
                  <stop offset="100%" stopColor="#b3172c" />
                </linearGradient>
                <linearGradient id="chipB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7fc2ff" />
                  <stop offset="100%" stopColor="#1d5fae" />
                </linearGradient>
                <linearGradient id="chipC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff3cc" />
                  <stop offset="55%" stopColor="#ffd062" />
                  <stop offset="100%" stopColor="#b5830e" />
                </linearGradient>
              </defs>
              <ellipse cx="32" cy="50" rx="22" ry="8" fill="url(#chipB)" />
              <ellipse cx="32" cy="46" rx="22" ry="8" fill="url(#chipA)" />
              <ellipse cx="32" cy="41" rx="22" ry="8" fill="url(#chipC)" />
              <ellipse cx="32" cy="41" rx="13" ry="4.6" fill="none" stroke="#8d6205" strokeWidth="1.6" />
              <g className="animate-floaty" style={{ transformOrigin: "32px 20px" }}>
                <circle cx="32" cy="20" r="11" fill="url(#chipC)" />
                <circle cx="32" cy="20" r="7" fill="none" stroke="#8d6205" strokeWidth="1.4" />
                <text x="32" y="24" fontSize="10" fontWeight="900" textAnchor="middle" fill="#7a5804">
                  ₡
                </text>
              </g>
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#9fe6bd]">
              Bugünün kasası
            </div>
            <div className="gold-text font-display tabular text-[38px] font-black leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              {coins(me.wallet.balance)}
            </div>
            <p className="mt-1 text-[11px] text-white/65">
              Her gece 1.000 coin&apos;e sıfırlanır — biriktiremezsin, harca
            </p>
          </div>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="gold">🔥 {me.streak.day}. gün serisi</Pill>
          {me.streak.nextBonus > 0 ? (
            <Pill tone="info">yarın +{coins(me.streak.nextBonus)}</Pill>
          ) : null}
          {me.stats.roundsPlayed > 0 ? (
            <Pill tone="win">zirve {coins(me.stats.peakBalance)}</Pill>
          ) : null}
        </div>
      </div>
    </div>
  );
}
