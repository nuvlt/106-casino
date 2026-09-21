"use client";

import { BalanceBar } from "@/components/BalanceBar";
import { GameGrid } from "@/components/GameGrid";
import { Hero } from "@/components/Hero";
import { Leaderboard } from "@/components/Leaderboard";
import { LiveFeed } from "@/components/LiveFeed";
import { Missions } from "@/components/Missions";
import { OpenRoundBanner } from "@/components/OpenRoundBanner";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { useMe } from "@/hooks/useMe";

export function Home() {
  const { data: me, loading } = useMe(30_000);

  return (
    <main className="mx-auto max-w-lg px-4 pb-16">
      <BalanceBar balance={me?.wallet.balance} streakDay={me?.streak.day} />

      <LiveFeed />
      <OpenRoundBanner round={me?.openRound ?? null} />

      {loading && !me ? <Skeleton className="mb-4 h-32" /> : me ? <Hero me={me} /> : null}

      <section className="mb-4">
        <SectionTitle right="8 oyun">Oyunlar</SectionTitle>
        <GameGrid />
      </section>

      {me ? (
        <div className="space-y-4">
          <Missions missions={me.missions} />
          <Leaderboard />

          {me.badges.length > 0 ? (
            <Card>
              <SectionTitle right={`${me.badges.length} rozet`}>Başarımların</SectionTitle>
              <div className="flex flex-wrap gap-2">
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
            </Card>
          ) : null}

          <Card>
            <SectionTitle right="provably fair">Adalet</SectionTitle>
            <p className="mb-2 text-xs leading-relaxed text-muted">
              Her turun sonucu, bahisten <strong className="text-white/85">önce</strong> yayınlanan
              bir sunucu tohumundan üretilir. Tohumu döndürdüğünde eskisi açılır ve geçmiş
              turlarının tamamını kendin hesaplayabilirsin.
            </p>
            <div className="tabular space-y-1 rounded-2xl bg-black/35 p-3 text-[11px] ring-1 ring-white/6">
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-muted">sunucu hash</span>
                <span className="truncate text-white/70">{me.fairness.serverSeedHash}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-muted">senin tohumun</span>
                <span className="truncate text-white/70">{me.fairness.clientSeed}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 shrink-0 text-muted">tur sayacı</span>
                <span className="text-white/70">{me.fairness.nonce}</span>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-muted">
        106 Casino — ofis içi eğlence. Gerçek para yok, çekilemez, transfer edilemez.
      </p>
    </main>
  );
}
