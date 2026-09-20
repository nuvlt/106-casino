"use client";

import { useApi } from "@/hooks/useApi";
import { GAME_BY_CODE } from "@/lib/catalog";
import { coins, multX4, shortName, timeAgo } from "@/lib/format";

interface FeedRow {
  id: string;
  name: string | null;
  game: string;
  payout: number;
  multX4: number;
  createdAt: string;
}

/** Ana sayfanın üstünde akan kazanç şeridi — ofis oyununu sosyalleştiren şey. */
export function LiveFeed() {
  const { data } = useApi<{ recent: FeedRow[]; legendary: FeedRow[] }>("/api/feed", {
    refreshMs: 6000,
  });

  const rows = data?.recent ?? [];
  if (rows.length === 0) {
    return (
      <div className="mb-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-center text-xs text-muted">
        Henüz büyük bir kazanç yok — ilk sen ol 👀
      </div>
    );
  }

  // Kesintisiz kayma için listeyi iki kez basıyoruz.
  const loop = [...rows, ...rows];

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-r from-surface via-surface-2 to-surface py-2.5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-surface to-transparent" />
      <div className="animate-marquee flex w-max gap-6 whitespace-nowrap px-4">
        {loop.map((r, i) => {
          const g = GAME_BY_CODE[r.game];
          return (
            <span key={`${r.id}-${i}`} className="flex items-center gap-2 text-xs">
              <span>{g?.emoji ?? "🎰"}</span>
              <strong className="font-semibold text-white/90">{shortName(r.name)}</strong>
              <span className="text-muted">{g?.title ?? r.game}</span>
              <span className="tabular font-bold text-win">{multX4(r.multX4)}</span>
              <span className="tabular text-gold">+{coins(r.payout)}</span>
              <span className="text-muted">· {timeAgo(r.createdAt)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
