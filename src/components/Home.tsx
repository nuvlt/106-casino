"use client";

import { BalanceBar } from "@/components/BalanceBar";
import { GameGrid } from "@/components/GameGrid";
import { Leaderboard } from "@/components/Leaderboard";
import { LiveFeed } from "@/components/LiveFeed";
import { Missions } from "@/components/Missions";
import { OpenRoundBanner } from "@/components/OpenRoundBanner";
import { Card, Pill, SectionTitle, Skeleton } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { coins } from "@/lib/format";

export function Home() {
  const { data: me, loading } = useMe(30_000);

  return (
    <main className="mx-auto max-w-lg px-4 pb-16">
      <BalanceBar balance={me?.wallet.balance} streakDay={me?.streak.day} />

      <LiveFeed />
      <OpenRoundBanner round={me?.openRound ?? null} />

      {/* Günlük hak kartı — sabah ilk girişte bakiye burada sıfırlanır. */}
      {loading && !me ? (
        <Skeleton className="mb-4 h-24" />
      ) : me ? (
        <Card className="mb-4 !bg-gradient-to-br !from-[#2a1a4d] !to-[#13223a]">
          <div className="flex items-center gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold/15 text-3xl">
              🪙
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-2xl font-black tabular text-gold">
                {coins(me.wallet.balance)}
              </div>
              <p className="text-xs text-muted">
                Bugünün hakkı verildi · her gece 1.000 coin&apos;e sıfırlanır
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone="gold">🔥 {me.streak.day}. gün</Pill>
            {me.streak.nextBonus > 0 ? (
              <Pill tone="info">yarın +{coins(me.streak.nextBonus)} bonus</Pill>
            ) : null}
            {me.stats.roundsPlayed > 0 ? (
              <Pill>zirve {coins(me.stats.peakBalance)}</Pill>
            ) : null}
          </div>
        </Card>
      ) : null}

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
                    className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2"
                  >
                    <span className="text-lg">{b.icon}</span>
                    <span className="text-xs font-bold text-white/85">{b.title}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <SectionTitle right="provably fair">Adalet</SectionTitle>
            <p className="mb-2 text-xs leading-relaxed text-muted">
              Her turun sonucu, bahisten <strong className="text-white/80">önce</strong> yayınlanan
              bir sunucu tohumundan üretilir. Tohumu döndürdüğünde eskisi açılır ve geçmiş
              turlarının tamamını kendin hesaplayabilirsin.
            </p>
            <div className="tabular space-y-1 rounded-2xl bg-black/25 p-3 text-[11px]">
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
