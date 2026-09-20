import Link from "next/link";
import type { Route } from "next";
import { GAMES } from "@/lib/catalog";

/** Ana sayfanın kalbi: sekiz oyunun renkli kart ızgarası. */
export function GameGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {GAMES.map((g) => {
        const inner = (
          <>
            <div
              className={`absolute inset-0 bg-gradient-to-br ${g.gradient} opacity-90 transition group-active:opacity-100`}
            />
            <div className="absolute -right-4 -top-3 text-6xl opacity-25 blur-[1px]">{g.emoji}</div>
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />

            <div className="relative flex h-full flex-col p-3.5">
              <span className="text-2xl drop-shadow">{g.emoji}</span>
              <span className="font-display mt-auto text-[15px] font-black leading-tight text-white drop-shadow">
                {g.title}
              </span>
              <span className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/75">
                {g.tagline}
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-bold text-white/85">
                  {g.maxWin}
                </span>
                <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] text-white/70">
                  {g.volatility}
                </span>
              </div>
            </div>
          </>
        );

        const shell =
          "group relative aspect-[4/5] overflow-hidden rounded-3xl border border-white/12 shadow-[0_10px_30px_rgba(0,0,0,0.4)]";

        return g.ready ? (
          <Link key={g.slug} href={`/oyun/${g.slug}` as Route} className={`${shell} active:scale-[0.97] transition`}>
            {inner}
          </Link>
        ) : (
          <div key={g.slug} className={`${shell} cursor-not-allowed`}>
            {inner}
            <div className="absolute inset-0 z-10 grid place-items-center bg-black/55 backdrop-blur-[2px]">
              <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold text-white/80">
                yakında
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
