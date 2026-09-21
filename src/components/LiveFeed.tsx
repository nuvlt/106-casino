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
      <div className="gold-hairline mb-4 rounded-2xl bg-black/25 px-4 py-3 text-center text-xs text-muted">
        Henüz büyük bir kazanç yok — ilk sen ol 👀
      </div>
    );
  }

  // Kesintisiz kayma için listeyi iki kez basıyoruz.
  const loop = [...rows, ...rows];

  return (
    <div
      className="gold-hairline relative mb-4 overflow-hidden rounded-2xl py-2.5
                 bg-[linear-gradient(90deg,#1a1230,#2a1a4d_35%,#132133_70%,#1a1230)]
                 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
    >
      <span className="absolute left-2.5 top-1/2 z-20 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider text-lose">
        ● canlı
      </span>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#1a1230] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#1a1230] to-transparent" />

      <div className="animate-marquee flex w-max gap-7 whitespace-nowrap pl-24 pr-4">
        {loop.map((r, i) => {
          const g = GAME_BY_CODE[r.game];
          return (
            <span key={`${r.id}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="text-sm">{g?.emoji ?? "🎰"}</span>
              <strong className="font-black text-white">{shortName(r.name)}</strong>
              <span className="text-muted">{g?.title ?? r.game}</span>
              <span className="tabular rounded-md bg-win/15 px-1.5 py-0.5 font-black text-win">
                {multX4(r.multX4)}
              </span>
              <span className="tabular font-bold text-gold">+{coins(r.payout)}</span>
              <span className="text-muted/70">· {timeAgo(r.createdAt)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
