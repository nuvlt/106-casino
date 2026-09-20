"use client";

import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Avatar, Card, SectionTitle, Skeleton } from "@/components/ui";
import { coinsShort, initials, multX4, shortName } from "@/lib/format";

interface Entry {
  rank: number;
  userId: string;
  name: string | null;
  value: number;
  rounds: number;
  isMe: boolean;
}

const TABS = [
  { scope: "season", label: "Zirve" },
  { scope: "today", label: "Bugün" },
  { scope: "multiplier", label: "Çarpan" },
  { scope: "wagered", label: "Çevrim" },
] as const;

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard() {
  const [scope, setScope] = useState<(typeof TABS)[number]["scope"]>("season");
  const { data, loading } = useApi<{ title: string; unit: "coin" | "mult"; entries: Entry[] }>(
    `/api/leaderboard?scope=${scope}`,
    { refreshMs: 20_000 },
  );

  return (
    <Card>
      <SectionTitle right={data?.title}>Sıralama</SectionTitle>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.scope}
            onClick={() => setScope(t.scope)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              scope === t.scope
                ? "bg-gold text-[#3a2500]"
                : "bg-white/6 text-white/60 active:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (data?.entries.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Tablo henüz boş. İlk turu oyna, zirveye adını yaz.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {data!.entries.map((e) => (
            <li
              key={e.userId}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                e.isMe
                  ? "border border-gold/35 bg-gold/10"
                  : "bg-white/4"
              }`}
            >
              <span className="tabular w-7 shrink-0 text-center font-display text-sm font-black text-white/50">
                {MEDALS[e.rank - 1] ?? e.rank}
              </span>
              <Avatar name={initials(e.name)} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white/90">
                  {shortName(e.name)}
                  {e.isMe ? <span className="ml-1.5 text-[11px] text-gold">sen</span> : null}
                </div>
                <div className="text-[11px] text-muted">{e.rounds} tur</div>
              </div>
              <div className="tabular font-display text-sm font-extrabold text-gold">
                {data!.unit === "mult" ? multX4(e.value) : coinsShort(e.value)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
