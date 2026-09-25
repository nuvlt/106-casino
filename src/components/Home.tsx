"use client";

import Link from "next/link";
import { BalanceBar } from "@/components/BalanceBar";
import { GameGrid } from "@/components/GameGrid";
import { Hero } from "@/components/Hero";
import { InviteCard } from "@/components/InviteCard";
import { Leaderboard } from "@/components/Leaderboard";
import { LiveFeed } from "@/components/LiveFeed";
import { Missions } from "@/components/Missions";
import { OpenRoundBanner } from "@/components/OpenRoundBanner";
import { QuickNav } from "@/components/QuickNav";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { GAMES } from "@/lib/catalog";

/**
 * Ana sayfa. Dar ekranda tek sütun; geniş ekranda oyunlar solda dört
 * sütun, sıralama/rozet/adalet sağda sabit bir kolonda durur — yoksa
 * masaüstünde ortada dar bir şerit kalıp iki yan boş kalıyordu.
 *
 * Görevler bilerek oyunların ÜSTÜNDE: günlük yönlendirmeyi oyuncu
 * oyun seçmeden önce görmeli.
 */
export function Home() {
  const { data: me, loading, setData, reload } = useMe(30_000);

  /** Görev ödülü alınınca üst şeritteki bakiye hemen güncellensin. */
  const onClaimed = (balance: number) => {
    setData((prev) => (prev ? { ...prev, wallet: { ...prev.wallet, balance } } : prev));
    void reload();
  };

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 lg:max-w-6xl lg:px-6">
      <BalanceBar balance={me?.wallet.balance} streakDay={me?.streak.day} user={me?.user} />
      <QuickNav isAdmin={me?.user.role === "ADMIN"} />

      <LiveFeed />
      <OpenRoundBanner round={me?.openRound ?? null} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        {/* ---------- ANA SÜTUN ---------- */}
        <div className="space-y-4">
          {loading && !me ? <Skeleton className="h-32" /> : me ? <Hero me={me} /> : null}

          {me ? (
            <Missions missions={me.missions} onClaimed={onClaimed} />
          ) : loading ? (
            <Skeleton className="h-16" />
          ) : null}

          <section>
            <SectionTitle right={`${GAMES.length} oyun`}>Oyunlar</SectionTitle>
            <GameGrid />
          </section>
        </div>

        {/* ---------- YAN SÜTUN ---------- */}
        {me ? (
          <aside className="mt-4 space-y-4 lg:mt-0">
            <InviteCard />
            <Leaderboard />
            <Link
              href="/siralama"
              className="-mt-1 block rounded-2xl bg-white/6 py-2.5 text-center text-xs font-black
                         text-white/70 ring-1 ring-white/10 transition hover:bg-white/12 active:bg-white/12"
            >
              Tüm sıralama ve karnen →
            </Link>

            <Card>
              <SectionTitle right={`${me.badges.length} rozet`}>Başarımların</SectionTitle>
              {me.badges.length > 0 ? (
                <div className="mb-2.5 flex flex-wrap gap-2">
                  {me.badges.map((b) => (
                    <div
                      key={b.id}
                      title={b.description}
                      className="flex items-center gap-2 rounded-2xl bg-gradient-to-b from-white/10 to-white/4
                                 px-3 py-2 ring-1 ring-gold/25"
                    >
                      <span className="text-lg drop-shadow">{b.icon}</span>
                      <span className="text-xs font-black text-white/90">{b.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-2.5 text-xs text-muted">
                  Henüz rozetin yok — ilk turunu oynadığında ilki gelir.
                </p>
              )}
              <Link
                href="/rozetler"
                className="block rounded-2xl bg-white/6 py-2.5 text-center text-xs font-black
                           text-white/70 ring-1 ring-white/10 transition hover:bg-white/12 active:bg-white/12"
              >
                Bütün rozetleri gör →
              </Link>
            </Card>

          </aside>
        ) : loading ? (
          // Yüklenirken yan sütunun yeri tutulur; veri gelince sayfa zıplamaz.
          <aside className="mt-4 space-y-4 lg:mt-0">
            <Skeleton className="h-64" />
            <Skeleton className="h-32" />
          </aside>
        ) : null}
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-muted">
        106 Casino — ofis içi eğlence. Gerçek para yok, çekilemez, transfer edilemez.
      </p>
    </main>
  );
}
