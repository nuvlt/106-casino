"use client";

import { BalanceBar } from "@/components/BalanceBar";
import { Leaderboard } from "@/components/Leaderboard";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { coins, mult as fmtMult } from "@/lib/format";

/** Kendi rakamların — sıralamadaki yerinin nereden geldiğini gösterir. */
function MyStats({ me }: { me: NonNullable<ReturnType<typeof useMe>["data"]> }) {
  const rows = [
    { label: "Zirve bakiye", value: coins(me.stats.peakBalance), hint: "sıralama buna göre" },
    { label: "En büyük kazanç", value: coins(me.stats.biggestWin) },
    { label: "En büyük çarpan", value: fmtMult(me.stats.biggestMult) },
    { label: "Oynanan tur", value: String(me.stats.roundsPlayed) },
    { label: "Toplam çevrim", value: coins(me.stats.totalWagered) },
    { label: "En uzun giriş serisi", value: `${me.streak.longest} gün` },
  ];

  return (
    <Card>
      <SectionTitle right="senin rakamların">Karnen</SectionTitle>
      <dl className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/8">
            <dt className="text-[10px] font-black uppercase tracking-wide text-muted">{r.label}</dt>
            <dd className="tabular font-display mt-0.5 text-lg font-black text-gold">{r.value}</dd>
            {r.hint ? <p className="text-[10px] text-muted">{r.hint}</p> : null}
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function RankScreen() {
  const me = useMe();

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 lg:max-w-4xl lg:px-6">
      <BalanceBar balance={me.data?.wallet.balance} back title="Sıralama" user={me.data?.user} />

      <div className="space-y-4">
        <Leaderboard />
        {me.data ? <MyStats me={me.data} /> : <Skeleton className="h-40" />}

        <p className="text-center text-[11px] leading-relaxed text-muted">
          Sıralama <strong className="text-white/75">zirve bakiyeye</strong> göre yapılır: sezon
          boyunca ulaştığın en yüksek bakiye. Anlık bakiye sayılsaydı, kazandıktan sonra oynamayı
          bırakmak en iyi strateji olurdu.
        </p>
      </div>
    </main>
  );
}
