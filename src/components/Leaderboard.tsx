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

/** İlk üçün kürsüsü — madalya rengi, halka ve taç. */
const PODIUM = [
  { ring: "ring-[#ffd062]", glow: "shadow-[0_0_20px_rgba(255,208,98,0.45)]", medal: "🥇", h: "h-[74px]" },
  { ring: "ring-[#d7dce6]", glow: "shadow-[0_0_14px_rgba(215,220,230,0.3)]", medal: "🥈", h: "h-[58px]" },
  { ring: "ring-[#d08a4a]", glow: "shadow-[0_0_14px_rgba(208,138,74,0.3)]", medal: "🥉", h: "h-[46px]" },
];

export function Leaderboard() {
  const [scope, setScope] = useState<(typeof TABS)[number]["scope"]>("season");
  const { data, loading } = useApi<{ title: string; unit: "coin" | "mult"; entries: Entry[] }>(
    `/api/leaderboard?scope=${scope}`,
    { refreshMs: 20_000 },
  );

  const top = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];
  const fmt = (v: number) => (data?.unit === "mult" ? multX4(v) : coinsShort(v));

  return (
    <Card>
      <SectionTitle right={data?.title}>Sıralama</SectionTitle>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.scope}
            onClick={() => setScope(t.scope)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-black transition ${
              scope === t.scope
                ? "gold-metal text-[#3a2500] shadow-[0_2px_0_#7a5804]"
                : "bg-white/6 text-white/60 ring-1 ring-white/10 active:bg-white/12"
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
        <>
          {/* kürsü */}
          {top.length > 0 ? (
            <div className="mb-3 flex items-end justify-center gap-2.5">
              {[1, 0, 2].map((idx) => {
                const e = top[idx];
                if (!e) return null;
                const p = PODIUM[idx]!;
                return (
                  <div key={e.userId} className="flex w-1/3 flex-col items-center">
                    <span className="mb-1 text-lg">{p.medal}</span>
                    <div className={`rounded-full ring-2 ${p.ring} ${p.glow}`}>
                      <Avatar name={initials(e.name)} size={idx === 0 ? 46 : 38} />
                    </div>
                    <span className="mt-1 max-w-full truncate text-[11px] font-bold text-white/85">
                      {shortName(e.name)}
                    </span>
                    <span className="tabular text-[11px] font-black text-gold">{fmt(e.value)}</span>
                    <div
                      className={`gloss relative mt-1.5 grid w-full place-items-center overflow-hidden
                        rounded-t-xl ${p.h} bg-gradient-to-b from-[#3a2b12] to-[#14100a]
                        shadow-[inset_0_1px_0_rgba(255,201,74,0.45)] ring-1 ring-gold/30`}
                    >
                      <span className="gold-text font-display text-xl font-black">{idx + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {rest.length > 0 ? (
            <ol className="space-y-1.5">
              {rest.map((e) => (
                <li
                  key={e.userId}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                    e.isMe ? "bg-gold/10 ring-1 ring-gold/40" : "bg-white/4"
                  }`}
                >
                  <span className="tabular w-6 shrink-0 text-center font-display text-sm font-black text-white/45">
                    {e.rank}
                  </span>
                  <Avatar name={initials(e.name)} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white/90">
                      {shortName(e.name)}
                      {e.isMe ? <span className="ml-1.5 text-[11px] text-gold">sen</span> : null}
                    </div>
                    <div className="text-[11px] text-muted">{e.rounds} tur</div>
                  </div>
                  <div className="tabular font-display text-sm font-black text-gold">
                    {fmt(e.value)}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </Card>
  );
}
