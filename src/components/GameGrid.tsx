import Link from "next/link";
import type { Route } from "next";
import { GAMES } from "@/lib/catalog";
import { GameArt, type ArtKey } from "@/components/GameArt";

/**
 * Ana sayfanın kalbi: oyun kartları.
 * Her kartın kendi çizimi, altın çerçevesi ve ışık süpürmesi var.
 */
export function GameGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {GAMES.map((g) => {
        const inner = (
          <>
            {/* renkli zemin */}
            <div className={`absolute inset-0 bg-gradient-to-br ${g.gradient}`} />
            {/* üstten sahne ışığı */}
            <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_-10%,rgba(255,255,255,0.35),transparent_60%)]" />
            {/* alttan karartma — yazı okunsun */}
            <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

            {/* oyunun kendi çizimi */}
            <div className="absolute inset-x-0 top-1 h-[56%] px-3">
              <div className="size-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]">
                <GameArt name={g.slug as ArtKey} />
              </div>
            </div>

            {g.isNew ? (
              <span className="absolute right-2 top-2 z-10 rounded-full bg-gradient-to-b from-[#ff7a8c] to-[#c8102e]
                               px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white
                               shadow-[0_2px_6px_rgba(0,0,0,0.5)] ring-1 ring-white/30">
                yeni
              </span>
            ) : null}

            <div className="relative flex h-full flex-col justify-end p-3">
              <span className="font-display text-[15px] font-black leading-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.85)]">
                {g.title}
              </span>
              <span className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/80">
                {g.tagline}
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-black text-gold ring-1 ring-gold/35">
                  {g.maxWin}
                </span>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] text-white/70">
                  {g.volatility}
                </span>
              </div>
            </div>
          </>
        );

        const shell =
          "group relative aspect-[4/5] overflow-hidden rounded-3xl " +
          "shadow-[0_12px_32px_rgba(0,0,0,0.55)] " +
          "before:pointer-events-none before:absolute before:inset-0 before:z-20 before:rounded-3xl " +
          "before:shadow-[inset_0_0_0_1.5px_rgba(255,201,74,0.4),inset_0_2px_0_rgba(255,255,255,0.28)]";

        return g.ready ? (
          <Link
            key={g.slug}
            href={`/oyun/${g.slug}` as Route}
            className={`${shell} shine transition active:scale-[0.97]`}
          >
            {inner}
          </Link>
        ) : (
          <div key={g.slug} className={`${shell} cursor-not-allowed`}>
            <div className="absolute inset-0 opacity-60">{inner}</div>
            <div className="absolute inset-0 z-30 grid place-items-center bg-black/45 backdrop-blur-[3px]">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-gold ring-1 ring-gold/40">
                yakında
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
