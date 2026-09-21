"use client";

import { BalanceBar } from "@/components/BalanceBar";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { useMe } from "@/hooks/useMe";
import { coins, timeAgo } from "@/lib/format";

interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: number;
  reward: number;
  earnedAt: string | null;
}

/** Kademe rengi — zorlaştıkça ısınır. */
const TIER = [
  { label: "kolay", ring: "ring-white/20", text: "text-white/60" },
  { label: "orta", ring: "ring-[#8fb6ff]/40", text: "text-[#8fb6ff]" },
  { label: "zor", ring: "ring-gold/45", text: "text-gold" },
];

export function BadgesScreen() {
  const me = useMe();
  const { data, loading } = useApi<{ badges: Badge[]; earned: number; total: number }>(
    "/api/badges",
    { refreshMs: 60_000 },
  );

  const badges = data?.badges ?? [];
  const earned = badges.filter((b) => b.earnedAt !== null);
  const locked = badges.filter((b) => b.earnedAt === null);
  const pct = data ? Math.round((data.earned / data.total) * 100) : 0;

  return (
    <main className="mx-auto max-w-lg px-4 pb-16">
      <BalanceBar balance={me.data?.wallet.balance} back title="Başarımlar" />

      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-end justify-between">
              <span className="font-display text-3xl font-black text-gold">
                {data?.earned} <span className="text-lg text-white/35">/ {data?.total}</span>
              </span>
              <span className="text-xs font-black text-muted">%{pct} tamam</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/8">
              <div
                className="gold-metal h-full rounded-full transition-all duration-700"
                style={{ width: `${pct === 0 ? 0 : Math.max(pct, 3)}%` }}
              />
            </div>
          </Card>

          {earned.length > 0 ? (
            <Card>
              <SectionTitle right={`${earned.length} rozet`}>Kazandıkların</SectionTitle>
              <ul className="space-y-2">
                {earned.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 rounded-2xl bg-gradient-to-b from-gold/12 to-transparent
                               p-3 ring-1 ring-gold/30"
                  >
                    <span className="text-2xl drop-shadow">{b.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-white">{b.title}</div>
                      <p className="truncate text-[11px] text-muted">{b.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="tabular text-xs font-black text-gold">+{coins(b.reward)}</div>
                      <div className="text-[10px] text-muted">
                        {b.earnedAt ? timeAgo(b.earnedAt) : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {locked.length > 0 ? (
            <Card>
              <SectionTitle right={`${locked.length} kaldı`}>Kilitli</SectionTitle>
              <ul className="space-y-2">
                {locked.map((b) => {
                  const tier = TIER[Math.min(b.tier, TIER.length) - 1]!;
                  return (
                    <li
                      key={b.id}
                      className={`flex items-center gap-3 rounded-2xl bg-black/30 p-3 ring-1 ${tier.ring}`}
                    >
                      <span className="text-2xl opacity-30 grayscale">{b.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-white/75">{b.title}</div>
                        <p className="truncate text-[11px] text-muted">{b.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="tabular text-xs font-black text-white/45">
                          +{coins(b.reward)}
                        </div>
                        <div className={`text-[10px] font-black ${tier.text}`}>{tier.label}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <p className="text-center text-[11px] text-muted">
            Rozet ödülleri kazanıldığı anda bakiyene yatar.
          </p>
        </div>
      )}
    </main>
  );
}
