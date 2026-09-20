"use client";

import Link from "next/link";
import type { Route } from "next";
import { GAME_BY_CODE } from "@/lib/catalog";
import { coins } from "@/lib/format";

/**
 * Devam eden tur uyarısı.
 *
 * Aynı anda tek tur kuralı var; oyuncu yarım bıraktığı turu bitirmeden
 * başka oyuna geçemez. Sonucu kesinleşmiş Crash turları sunucuda
 * otomatik kapanır, o yüzden buraya yalnızca gerçekten devam eden
 * (uçuşu süren ya da zinciri açık) turlar düşer.
 */
export function OpenRoundBanner({
  round,
  currentSlug,
}: {
  round: { id: string; game: string; bet: number } | null;
  currentSlug?: string;
}) {
  if (!round) return null;
  const meta = GAME_BY_CODE[round.game];
  if (!meta || meta.slug === currentSlug) return null;

  return (
    <Link
      href={`/oyun/${meta.slug}` as Route}
      className="mb-4 flex items-center gap-3 rounded-2xl border border-gold/35 bg-gold/10 px-4 py-3 active:scale-[0.99]"
    >
      <span className="text-xl">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-gold">Devam eden turun var</div>
        <div className="text-[11px] text-muted">
          {meta.title} · {coins(round.bet)} coin — bitirmeden yeni tur başlatamazsın
        </div>
      </div>
      <span className="text-gold">›</span>
    </Link>
  );
}
