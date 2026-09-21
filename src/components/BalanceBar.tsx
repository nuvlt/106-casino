"use client";

import Link from "next/link";
import { coins } from "@/lib/format";
import { SoundToggle } from "@/components/SoundToggle";

/** Üst şerit: altın jeton görünümlü bakiye, seri ve geri dönüş. Her ekranda sabit. */
export function BalanceBar({
  balance,
  streakDay,
  back,
  title,
}: {
  balance: number | undefined;
  streakDay?: number;
  back?: boolean;
  title?: string;
}) {
  return (
    <header
      className="sticky top-0 z-30 -mx-4 mb-4 border-b border-gold/20 px-4 py-3 lg:-mx-6 lg:px-6
                 bg-[linear-gradient(180deg,rgba(10,20,32,0.96),rgba(10,20,32,0.78))] backdrop-blur-lg"
    >
      <div className="mx-auto flex w-full max-w-lg items-center gap-3 lg:max-w-6xl">
        {back ? (
          <Link
            href="/"
            aria-label="Ana sayfaya dön"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8
                       text-lg text-gold ring-1 ring-gold/30 active:scale-95"
          >
            ‹
          </Link>
        ) : (
          <div className="font-display text-lg font-black tracking-tight">
            <span className="gold-text">106</span>
            <span className="ml-1 text-white/90">CASINO</span>
          </div>
        )}

        {title ? (
          <div className="font-display truncate text-base font-black text-white">{title}</div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <SoundToggle />
          {streakDay ? (
            <span className="rounded-full bg-ruby/20 px-2.5 py-1 text-[11px] font-black text-[#ffb3be] ring-1 ring-ruby/40">
              🔥 {streakDay}
            </span>
          ) : null}

          {/* Bakiye: kenarı pirinç, içi koyu — masadaki jeton gibi. */}
          <div
            className="gloss relative flex items-center gap-1.5 overflow-hidden rounded-full
                       bg-gradient-to-b from-[#ffd977] to-[#a9760a] p-[2px]
                       shadow-[0_4px_0_#6b4d05,0_10px_20px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center gap-1.5 rounded-full bg-[#0d1a12] px-3 py-1.5">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <circle cx="12" cy="12" r="10" fill="url(#coinG)" />
                <circle cx="12" cy="12" r="7" fill="none" stroke="#8d6205" strokeWidth="1.4" />
                <text x="12" y="16" fontSize="9" fontWeight="900" textAnchor="middle" fill="#7a5804">
                  ₡
                </text>
                <defs>
                  <linearGradient id="coinG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff3cc" />
                    <stop offset="50%" stopColor="#ffd062" />
                    <stop offset="100%" stopColor="#c68d10" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="tabular font-display text-sm font-black text-gold">
                {balance === undefined ? "—" : coins(balance)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
