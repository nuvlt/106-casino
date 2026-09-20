"use client";

import Link from "next/link";
import { coins } from "@/lib/format";
import { Pill } from "@/components/ui";

/** Üst şerit: bakiye, seri ve geri dönüş bağlantısı. Her ekranda sabit. */
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
    <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-white/8 bg-bg/85 px-4 py-3 backdrop-blur-lg">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {back ? (
          <Link
            href="/"
            aria-label="Ana sayfaya dön"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-lg text-white/80 active:scale-95"
          >
            ‹
          </Link>
        ) : (
          <div className="font-display text-lg font-black tracking-tight">
            <span className="text-gold">106</span>
            <span className="text-white/85"> Casino</span>
          </div>
        )}

        {title ? (
          <div className="font-display truncate text-base font-bold text-white/90">{title}</div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {streakDay ? <Pill tone="gold">🔥 {streakDay}. gün</Pill> : null}
          <div
            className="tabular flex items-center gap-1.5 rounded-full border border-gold/30
                       bg-gold/12 px-3 py-1.5 font-display font-extrabold text-gold"
          >
            <span className="text-sm">🪙</span>
            <span className="text-sm">{balance === undefined ? "—" : coins(balance)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
